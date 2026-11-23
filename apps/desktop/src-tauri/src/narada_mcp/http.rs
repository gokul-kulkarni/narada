//! Serves the MCP tools over Streamable HTTP on 127.0.0.1 only, behind a bearer token.
//! rmcp also rejects non-loopback `Host` headers (DNS rebinding) and, with origin validation
//! enforced, any request carrying an `Origin` header: browsers send one, MCP clients don't.

use super::bridge::ToolBridge;
use super::server::NaradaServer;
use axum::Router;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::http::header::AUTHORIZATION;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use rmcp::transport::streamable_http_server::session::local::LocalSessionManager;
use rmcp::transport::streamable_http_server::{StreamableHttpServerConfig, StreamableHttpService};
use std::net::Ipv4Addr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

/// Requests larger than this are refused; tool arguments are small.
const MAX_REQUEST_BYTES: usize = 256 * 1024;

pub struct Running {
    pub port: u16,
    cancel: CancellationToken,
    task: JoinHandle<()>,
}

impl Running {
    /// Stops accepting requests; open sessions end.
    #[cfg(test)]
    pub fn stop(&self) {
        self.cancel.cancel();
    }

    /// Stops and waits until the port is free again.
    pub async fn shutdown(self) {
        self.cancel.cancel();
        let _ = self.task.await;
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |diff, (x, y)| diff | (x ^ y)) == 0
}

/// Whether an `Authorization` header carries exactly `Bearer <token>`.
pub fn token_matches(header: Option<&str>, token: &str) -> bool {
    header
        .and_then(|value| value.strip_prefix("Bearer "))
        .is_some_and(|given| constant_time_eq(given.as_bytes(), token.as_bytes()))
}

async fn require_token(State(token): State<Arc<String>>, request: Request, next: Next) -> Response {
    let header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok());
    if token_matches(header, &token) {
        next.run(request).await
    } else {
        (
            StatusCode::UNAUTHORIZED,
            "Missing or wrong Narada MCP token.",
        )
            .into_response()
    }
}

async fn bind(port: u16) -> Result<TcpListener, String> {
    TcpListener::bind((Ipv4Addr::LOCALHOST, port))
        .await
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AddrInUse => {
                format!("Port {port} is already in use. Choose another port in Settings.")
            }
            _ => format!("Could not start Narada's MCP server: {e}"),
        })
}

/// Starts the server on `port` (0 picks a free one) and returns where it listens.
pub async fn serve(
    port: u16,
    token: String,
    bridge: Arc<dyn ToolBridge>,
) -> Result<Running, String> {
    let listener = bind(port).await?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Could not start Narada's MCP server: {e}"))?
        .port();
    let cancel = CancellationToken::new();
    let mut config = StreamableHttpServerConfig::default()
        .with_cancellation_token(cancel.clone())
        .enforce_origin_validation();
    config.max_request_body_bytes = MAX_REQUEST_BYTES;
    let service = StreamableHttpService::new(
        move || Ok(NaradaServer::new(bridge.clone())),
        Arc::new(LocalSessionManager::default()),
        config,
    );
    let router = Router::new()
        .nest_service("/mcp", service)
        .layer(middleware::from_fn_with_state(
            Arc::new(token),
            require_token,
        ));
    let shutdown = cancel.clone();
    let task = tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(shutdown.cancelled_owned())
            .await;
    });
    Ok(Running { port, cancel, task })
}

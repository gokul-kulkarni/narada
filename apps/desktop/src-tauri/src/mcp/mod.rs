mod handler;
mod transport;
mod types;

pub use handler::Sink;
pub use types::{ListKind, McpEvent, Operation, ServerTransport, Timed};

use rmcp::ClientHandler;
use rmcp::model::{CallToolRequestParams, GetPromptRequestParams, ReadResourceRequestParams};
use rmcp::service::{RoleClient, RunningService, ServiceError};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tokio::time::timeout;
use transport::Session;

const CONNECT_TIMEOUT: Duration = Duration::from_secs(60);
const DEFAULT_REQUEST_TIMEOUT_MS: u64 = 120_000;

/// Open MCP sessions, by the id the UI gave each connection.
#[derive(Default)]
pub struct McpState {
    sessions: Mutex<HashMap<String, Arc<Session>>>,
}

impl McpState {
    fn sessions(&self) -> Result<std::sync::MutexGuard<'_, HashMap<String, Arc<Session>>>, String> {
        self.sessions
            .lock()
            .map_err(|_| "MCP session registry is unavailable".to_string())
    }

    fn session(&self, id: &str) -> Result<Arc<Session>, String> {
        let session = self.sessions()?.get(id).cloned();
        let session = session.ok_or("Not connected to this server. Connect first.")?;
        if session.is_closed() {
            self.sessions()?.remove(id);
            return Err("The server closed the connection. Connect again.".into());
        }
        Ok(session)
    }
}

fn json(value: impl Serialize) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|e| format!("Unreadable reply from the server: {e}"))
}

fn describe(error: ServiceError) -> String {
    match error {
        ServiceError::McpError(error) => error.message.to_string(),
        other => format!("Request failed: {other}"),
    }
}

/// What the server said about itself during the handshake.
pub fn server_info<S: ClientHandler>(
    session: &RunningService<RoleClient, S>,
) -> Result<Value, String> {
    json(session.peer_info())
}

pub async fn list<S: ClientHandler>(
    session: &RunningService<RoleClient, S>,
    kind: ListKind,
) -> Result<Value, String> {
    match kind {
        ListKind::Tools => json(session.list_all_tools().await.map_err(describe)?),
        ListKind::Resources => json(session.list_all_resources().await.map_err(describe)?),
        ListKind::ResourceTemplates => json(
            session
                .list_all_resource_templates()
                .await
                .map_err(describe)?,
        ),
        ListKind::Prompts => json(session.list_all_prompts().await.map_err(describe)?),
    }
}

/// Runs one operation; a tool that reports an error still returns its result (`isError`).
pub async fn run<S: ClientHandler>(
    session: &RunningService<RoleClient, S>,
    operation: Operation,
    limit: Duration,
) -> Result<Timed, String> {
    let started = Instant::now();
    let reply = async {
        match operation {
            Operation::Tool { name, arguments } => json(
                session
                    .call_tool(CallToolRequestParams::new(name).with_arguments(arguments))
                    .await
                    .map_err(describe)?,
            ),
            Operation::Resource { uri } => json(
                session
                    .read_resource(ReadResourceRequestParams::new(uri))
                    .await
                    .map_err(describe)?,
            ),
            Operation::Prompt { name, arguments } => json(
                session
                    .get_prompt(GetPromptRequestParams::new(name).with_arguments(arguments))
                    .await
                    .map_err(describe)?,
            ),
        }
    };
    let result = timeout(limit, reply)
        .await
        .map_err(|_| format!("No reply within {} s", limit.as_secs()))??;
    Ok(Timed {
        result,
        time_ms: started.elapsed().as_millis(),
    })
}

/// Connects (replacing an earlier session with the same id) and returns the server's info.
#[tauri::command]
pub async fn mcp_connect(
    state: tauri::State<'_, McpState>,
    id: String,
    transport: ServerTransport,
    channel: Channel<McpEvent>,
) -> Result<Value, String> {
    state.sessions()?.remove(&id);
    let sink: Sink = Arc::new(move |event| {
        let _ = channel.send(event);
    });
    let session = timeout(CONNECT_TIMEOUT, transport::connect(transport, sink))
        .await
        .map_err(|_| "The server did not answer the MCP handshake within 60 s".to_string())??;
    let info = server_info(&session)?;
    state.sessions()?.insert(id, Arc::new(session));
    Ok(info)
}

#[tauri::command]
pub async fn mcp_list(
    state: tauri::State<'_, McpState>,
    id: String,
    kind: ListKind,
) -> Result<Value, String> {
    let session = state.session(&id)?;
    list(&session, kind).await
}

#[tauri::command]
pub async fn mcp_run(
    state: tauri::State<'_, McpState>,
    id: String,
    operation: Operation,
    timeout_ms: Option<u64>,
) -> Result<Timed, String> {
    let session = state.session(&id)?;
    let limit = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_REQUEST_TIMEOUT_MS));
    run(&session, operation, limit).await
}

/// Closing the last handle to a session ends it (and stops a stdio server).
#[tauri::command]
pub fn mcp_disconnect(state: tauri::State<'_, McpState>, id: String) -> Result<(), String> {
    if let Some(session) = state.sessions()?.remove(&id) {
        session.cancellation_token().cancel();
    }
    Ok(())
}

#[cfg(test)]
mod tests;

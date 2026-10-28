use super::handler::{Notifier, Sink};
use super::types::{McpEvent, ServerTransport};
use reqwest::header::{HeaderName, HeaderValue};
use rmcp::ServiceExt;
use rmcp::service::{RoleClient, RunningService};
use rmcp::transport::streamable_http_client::StreamableHttpClientTransportConfig;
use rmcp::transport::{StreamableHttpClientTransport, TokioChildProcess};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::OnceLock;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

pub type Session = RunningService<RoleClient, Notifier>;

/// Apps opened from the Finder get a bare PATH, so `npx`, `uvx` and friends would not be
/// found. Ask the login shell for the PATH the user sees in a terminal, once.
fn login_path() -> Option<&'static str> {
    static PATH: OnceLock<Option<String>> = OnceLock::new();
    PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        let output = std::process::Command::new(shell)
            .args(["-l", "-c", "printf %s \"$PATH\""])
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output()
            .ok()?;
        let path = String::from_utf8(output.stdout).ok()?;
        (!path.trim().is_empty()).then_some(path)
    })
    .as_deref()
}

fn command(program: &str, args: &[String], env: &[(String, String)], cwd: Option<&str>) -> Command {
    let mut command = Command::new(program);
    command.args(args);
    if let Some(path) = login_path() {
        command.env("PATH", path);
    }
    command.envs(env.iter().map(|(k, v)| (k.as_str(), v.as_str())));
    if let Some(dir) = cwd.filter(|d| !d.trim().is_empty()) {
        command.current_dir(dir);
    }
    command
}

fn headers(pairs: &[(String, String)]) -> Result<HashMap<HeaderName, HeaderValue>, String> {
    pairs
        .iter()
        .map(|(name, value)| {
            let name = HeaderName::from_bytes(name.trim().as_bytes())
                .map_err(|_| format!("Invalid header name: {name}"))?;
            let value = HeaderValue::from_str(value)
                .map_err(|_| format!("Invalid value for header {name}"))?;
            Ok((name, value))
        })
        .collect()
}

/// Forwards each stderr line of a stdio server to the UI.
fn forward_stderr(stderr: tokio::process::ChildStderr, sink: Sink) {
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            sink(McpEvent::Stderr { line });
        }
    });
}

/// Starts or reaches the server and completes the MCP initialize handshake.
pub async fn connect(transport: ServerTransport, sink: Sink) -> Result<Session, String> {
    let notifier = Notifier::new(sink.clone());
    match transport {
        ServerTransport::Stdio {
            command: program,
            args,
            env,
            cwd,
        } => {
            if program.trim().is_empty() {
                return Err("Enter the command that starts the server.".into());
            }
            let (process, stderr) =
                TokioChildProcess::builder(command(program.trim(), &args, &env, cwd.as_deref()))
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Could not start \"{program}\": {e}"))?;
            if let Some(stderr) = stderr {
                forward_stderr(stderr, sink);
            }
            notifier
                .serve(process)
                .await
                .map_err(|e| format!("The server did not start an MCP session: {e}"))
        }
        ServerTransport::Http {
            url,
            headers: pairs,
        } => {
            reqwest::Url::parse(url.trim()).map_err(|e| format!("Invalid URL \"{url}\": {e}"))?;
            let config = StreamableHttpClientTransportConfig::with_uri(url.trim().to_string())
                .custom_headers(headers(&pairs)?);
            let transport = StreamableHttpClientTransport::from_config(config);
            notifier
                .serve(transport)
                .await
                .map_err(|e| format!("Could not connect to the MCP server: {e}"))
        }
    }
}

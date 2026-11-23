//! Narada as an MCP server: coding agents (Claude Code, Codex, Cursor, …) connect to it to
//! read the user's requests, environments and deliveries. Off until the user turns it on.
//! See docs/plans/agent-assist.md, phase 2.

mod bridge;
mod http;
mod server;

use bridge::{Pending, TauriBridge};
use serde::Deserialize;
use serde_json::Value;
use std::sync::{Arc, Mutex};

/// A token shorter than this is too easy to guess.
const MIN_TOKEN_LEN: usize = 32;

#[derive(Default)]
pub struct NaradaMcpState {
    running: Mutex<Option<http::Running>>,
    pending: Pending,
}

impl NaradaMcpState {
    fn take_running(&self) -> Option<http::Running> {
        self.running
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
    }
}

/// Starts (or restarts) the server; returns the port it listens on.
#[tauri::command]
pub async fn narada_mcp_start(
    app: tauri::AppHandle,
    state: tauri::State<'_, NaradaMcpState>,
    port: u16,
    token: String,
) -> Result<u16, String> {
    if token.len() < MIN_TOKEN_LEN {
        return Err("The MCP token is too short; generate a new one.".into());
    }
    if port < 1024 {
        return Err("Choose a port from 1024 to 65535.".into());
    }
    if let Some(previous) = state.take_running() {
        previous.shutdown().await;
    }
    let bridge = Arc::new(TauriBridge::new(app, state.pending.clone()));
    let running = http::serve(port, token, bridge).await?;
    let port = running.port;
    *state.running.lock().unwrap_or_else(|e| e.into_inner()) = Some(running);
    Ok(port)
}

#[tauri::command]
pub async fn narada_mcp_stop(state: tauri::State<'_, NaradaMcpState>) -> Result<(), String> {
    if let Some(running) = state.take_running() {
        running.shutdown().await;
    }
    Ok(())
}

/// The port the server listens on, if it is running.
#[tauri::command]
pub fn narada_mcp_status(state: tauri::State<'_, NaradaMcpState>) -> Option<u16> {
    state
        .running
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .map(|running| running.port)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolReply {
    call_id: String,
    result: Option<Value>,
    error: Option<String>,
}

/// The UI's answer to a tool call it received as a `narada-mcp://tool-call` event.
#[tauri::command]
pub fn narada_mcp_reply(state: tauri::State<'_, NaradaMcpState>, reply: ToolReply) {
    let result = match reply.error {
        Some(message) => Err(message),
        None => Ok(reply.result.unwrap_or(Value::Null)),
    };
    state.pending.answer(&reply.call_id, result);
}

#[cfg(test)]
mod tests;

//! Tool calls are answered by the app's UI, which holds the collections, environments and
//! tabs: Rust emits each call as an event and waits for `narada_mcp_reply`.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

pub type BridgeResult = Result<Value, String>;
pub type BridgeFuture<'a> = Pin<Box<dyn Future<Output = BridgeResult> + Send + 'a>>;

/// Answers one MCP tool call with JSON, or an error message for the agent. `client` is the
/// connected agent's name, for asking the user to approve changes and for the activity log.
/// `cancelled` fires when the agent gives up on the call (its own timeout, or it went away).
pub trait ToolBridge: Send + Sync + 'static {
    fn call(
        &self,
        tool: &str,
        arguments: Value,
        client: Option<String>,
        cancelled: CancellationToken,
    ) -> BridgeFuture<'_>;
}

/// Tool calls waiting for the UI's answer, by call id.
#[derive(Default, Clone)]
pub struct Pending {
    calls: Arc<Mutex<HashMap<String, oneshot::Sender<BridgeResult>>>>,
}

impl Pending {
    fn calls(&self) -> std::sync::MutexGuard<'_, HashMap<String, oneshot::Sender<BridgeResult>>> {
        // A poisoned lock only means another call panicked; the map itself is still usable.
        self.calls.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn open(&self) -> (String, oneshot::Receiver<BridgeResult>) {
        let id: String = rand::random::<[u8; 16]>()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        let (send, receive) = oneshot::channel();
        self.calls().insert(id.clone(), send);
        (id, receive)
    }

    /// Delivers the UI's answer; false if no call with this id is waiting.
    pub fn answer(&self, id: &str, result: BridgeResult) -> bool {
        self.calls()
            .remove(id)
            .is_some_and(|send| send.send(result).is_ok())
    }

    fn forget(&self, id: &str) {
        self.calls().remove(id);
    }
}

pub const TOOL_CALL_EVENT: &str = "narada-mcp://tool-call";
/// The agent stopped waiting for a call, so the app withdraws it (e.g. a pending approval).
pub const TOOL_CANCELLED_EVENT: &str = "narada-mcp://tool-cancelled";
const READ_TIMEOUT: Duration = Duration::from_secs(30);
/// Changes wait for the user to approve them in Narada.
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(5 * 60);

/// How long a tool call may wait for the app's answer.
pub fn answer_timeout(tool: &str) -> Duration {
    if tool.starts_with("create_") {
        APPROVAL_TIMEOUT
    } else {
        READ_TIMEOUT
    }
}

/// How waiting for the app's answer ended.
#[derive(Debug, PartialEq)]
pub enum Waited {
    Answer(BridgeResult),
    /// The app went away before answering.
    Closed,
    TimedOut,
    /// The agent gave up first.
    Cancelled,
}

pub async fn wait_for_answer(
    reply: oneshot::Receiver<BridgeResult>,
    limit: Duration,
    cancelled: CancellationToken,
) -> Waited {
    tokio::select! {
        answer = tokio::time::timeout(limit, reply) => match answer {
            Ok(Ok(result)) => Waited::Answer(result),
            Ok(Err(_)) => Waited::Closed,
            Err(_) => Waited::TimedOut,
        },
        () = cancelled.cancelled() => Waited::Cancelled,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Cancelled<'a> {
    call_id: &'a str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ToolCall<'a> {
    call_id: &'a str,
    tool: &'a str,
    arguments: Value,
    client: Option<String>,
}

pub struct TauriBridge {
    app: AppHandle,
    pending: Pending,
}

impl TauriBridge {
    pub fn new(app: AppHandle, pending: Pending) -> Self {
        Self { app, pending }
    }
}

impl ToolBridge for TauriBridge {
    fn call(
        &self,
        tool: &str,
        arguments: Value,
        client: Option<String>,
        cancelled: CancellationToken,
    ) -> BridgeFuture<'_> {
        let tool = tool.to_owned();
        Box::pin(async move {
            let (id, reply) = self.pending.open();
            let event = ToolCall {
                call_id: &id,
                tool: &tool,
                arguments,
                client,
            };
            if let Err(e) = self.app.emit(TOOL_CALL_EVENT, event) {
                self.pending.forget(&id);
                return Err(format!("Narada could not take the call: {e}"));
            }
            match wait_for_answer(reply, answer_timeout(&tool), cancelled).await {
                Waited::Answer(result) => result,
                Waited::Closed => Err("Narada closed before answering.".into()),
                Waited::TimedOut | Waited::Cancelled => {
                    self.pending.forget(&id);
                    // Withdraw it in the app, so a late approval can't add what the agent
                    // was told failed.
                    let _ = self
                        .app
                        .emit(TOOL_CANCELLED_EVENT, Cancelled { call_id: &id });
                    Err("Narada didn't answer in time: the user may not have seen the request, so nothing was added.".into())
                }
            }
        })
    }
}

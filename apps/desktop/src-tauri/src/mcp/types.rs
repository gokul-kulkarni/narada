use serde::{Deserialize, Serialize};
use serde_json::Value;

pub type Pair = (String, String);

/// How to reach an MCP server: launch it locally (stdio) or connect over Streamable HTTP.
#[derive(Debug, Clone, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ServerTransport {
    Stdio {
        command: String,
        args: Vec<String>,
        env: Vec<Pair>,
        cwd: Option<String>,
    },
    Http {
        url: String,
        headers: Vec<Pair>,
    },
}

/// What a connected server tells the UI between requests.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum McpEvent {
    /// An MCP notification (log message, progress, list changed…), as sent by the server.
    Notification { method: String, params: Value },
    /// A line the server process wrote to stderr (stdio servers only).
    Stderr { line: String },
}

/// The kinds of things a server can list.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ListKind {
    Tools,
    Resources,
    ResourceTemplates,
    Prompts,
}

/// One operation on a connected server.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Operation {
    Tool {
        name: String,
        arguments: serde_json::Map<String, Value>,
    },
    Resource {
        uri: String,
    },
    Prompt {
        name: String,
        arguments: serde_json::Map<String, Value>,
    },
}

/// A result as MCP JSON, with how long the server took.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Timed {
    pub result: Value,
    pub time_ms: u128,
}

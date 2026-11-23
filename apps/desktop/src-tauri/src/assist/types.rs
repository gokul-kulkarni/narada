use serde::{Deserialize, Serialize};

/// An agent CLI found on this computer.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgent {
    pub id: String,
    pub name: String,
    pub path: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistRequest {
    pub agent_id: String,
    /// The redacted prompt; it goes to the agent on stdin, never in argv.
    pub prompt: String,
    /// Continue this earlier session (a follow-up question) instead of starting a new one.
    pub session_id: Option<String>,
}

/// Progress of one agent run, in the same shape whichever CLI produced it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum AssistEvent {
    Started {
        session_id: Option<String>,
    },
    Text {
        text: String,
    },
    /// What the agent is doing between answers, e.g. "Reading src/orders.ts".
    Activity {
        label: String,
    },
    Done {
        session_id: Option<String>,
        cost_usd: Option<f64>,
    },
    Error {
        message: String,
    },
    Stopped,
}

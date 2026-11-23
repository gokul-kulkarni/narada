//! Codex's `exec --json` JSONL events, turned into `AssistEvent`s. Codex sends whole messages,
//! not token deltas.

use super::process::LineParser;
use super::types::AssistEvent;
use serde_json::Value;

#[derive(Default)]
pub struct CodexParser {
    thread_id: Option<String>,
    /// A message was shown already, so the next one starts a new paragraph.
    said_something: bool,
}

/// "Running cat src/orders.ts" for `/bin/zsh -lc 'cat src/orders.ts'`.
pub fn describe_command(command: &str) -> String {
    let inner = command
        .split_once(" -lc ")
        .map(|(_, rest)| rest.trim().trim_matches('\''))
        .unwrap_or(command);
    format!("Running {inner}")
}

impl CodexParser {
    fn item_started(&self, item: &Value) -> Vec<AssistEvent> {
        let label = match item["type"].as_str() {
            Some("command_execution") => describe_command(item["command"].as_str().unwrap_or("")),
            Some("mcp_tool_call") => "Using a tool".to_owned(),
            Some("web_search") => "Searching the web".to_owned(),
            _ => return vec![],
        };
        vec![AssistEvent::Activity { label }]
    }

    fn item_completed(&mut self, item: &Value) -> Vec<AssistEvent> {
        let Some(text) = item["text"].as_str().filter(|t| !t.is_empty()) else {
            return vec![];
        };
        if item["type"] != "agent_message" {
            return vec![];
        }
        let text = if self.said_something {
            format!("\n\n{text}")
        } else {
            text.to_owned()
        };
        self.said_something = true;
        vec![AssistEvent::Text { text }]
    }
}

impl LineParser for CodexParser {
    fn line(&mut self, line: &str) -> Vec<AssistEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return vec![];
        };
        match value["type"].as_str() {
            Some("thread.started") => {
                self.thread_id = value["thread_id"].as_str().map(str::to_owned);
                vec![AssistEvent::Started {
                    session_id: self.thread_id.clone(),
                }]
            }
            Some("item.started") => self.item_started(&value["item"]),
            Some("item.completed") => self.item_completed(&value["item"]),
            Some("turn.completed") => vec![AssistEvent::Done {
                session_id: self.thread_id.clone(),
                cost_usd: None,
            }],
            // `error` repeats as `turn.failed`, which ends the turn; report that one.
            Some("turn.failed") => {
                let message = value["error"]["message"]
                    .as_str()
                    .unwrap_or("Codex stopped with an error.")
                    .to_owned();
                vec![AssistEvent::Error { message }]
            }
            _ => vec![],
        }
    }
}

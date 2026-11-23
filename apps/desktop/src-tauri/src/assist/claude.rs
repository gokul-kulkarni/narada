//! Claude Code's `--output-format stream-json` lines, turned into `AssistEvent`s.

use super::process::LineParser;
use super::types::AssistEvent;
use serde_json::Value;

#[derive(Default)]
pub struct ClaudeParser {
    /// Text arrived as partial deltas, so whole assistant messages would repeat it.
    streamed_text: bool,
}

fn string(value: &Value) -> Option<String> {
    value.as_str().map(str::to_owned)
}

/// Says in plain words what a tool call is doing.
pub fn describe_tool(name: &str, input: &Value) -> String {
    let field = |key: &str| input.get(key).and_then(Value::as_str);
    let described = match name {
        "Read" => field("file_path").map(|p| format!("Reading {p}")),
        "Grep" => field("pattern").map(|p| format!("Searching for {p}")),
        "Glob" => field("pattern").map(|p| format!("Finding files {p}")),
        "WebSearch" => field("query").map(|q| format!("Searching the web for {q}")),
        _ => None,
    };
    described.unwrap_or_else(|| format!("Using {name}"))
}

impl ClaudeParser {
    fn stream_event(&mut self, event: &Value) -> Vec<AssistEvent> {
        let delta = &event["delta"];
        if event["type"] != "content_block_delta" || delta["type"] != "text_delta" {
            return vec![];
        }
        self.streamed_text = true;
        string(&delta["text"])
            .map(|text| vec![AssistEvent::Text { text }])
            .unwrap_or_default()
    }

    fn assistant(&self, message: &Value) -> Vec<AssistEvent> {
        let blocks = message["content"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default();
        blocks
            .iter()
            .filter_map(|block| match block["type"].as_str() {
                Some("tool_use") => Some(AssistEvent::Activity {
                    label: describe_tool(
                        block["name"].as_str().unwrap_or("a tool"),
                        &block["input"],
                    ),
                }),
                Some("text") if !self.streamed_text => {
                    string(&block["text"]).map(|text| AssistEvent::Text { text })
                }
                _ => None,
            })
            .collect()
    }
}

fn result(value: &Value) -> AssistEvent {
    if value["is_error"].as_bool().unwrap_or(false) {
        let message = string(&value["result"])
            .filter(|text| !text.trim().is_empty())
            .unwrap_or_else(|| {
                format!(
                    "Claude Code stopped: {}",
                    value["subtype"].as_str().unwrap_or("error")
                )
            });
        return AssistEvent::Error { message };
    }
    AssistEvent::Done {
        session_id: string(&value["session_id"]),
        cost_usd: value["total_cost_usd"].as_f64(),
    }
}

impl LineParser for ClaudeParser {
    fn line(&mut self, line: &str) -> Vec<AssistEvent> {
        let Ok(value) = serde_json::from_str::<Value>(line) else {
            return vec![];
        };
        // Subagents report with a parent tool use; only the main answer is shown.
        let top_level = value.get("parent_tool_use_id").is_none_or(Value::is_null);
        match value["type"].as_str() {
            Some("system") if value["subtype"] == "init" => vec![AssistEvent::Started {
                session_id: string(&value["session_id"]),
            }],
            Some("stream_event") if top_level => self.stream_event(&value["event"]),
            Some("assistant") if top_level => self.assistant(&value["message"]),
            Some("result") => vec![result(&value)],
            _ => vec![],
        }
    }
}

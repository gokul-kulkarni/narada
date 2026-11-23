use super::agents::{AGENTS, AgentSpec, find_agent, parse_version};
use super::claude::{ClaudeParser, describe_tool};
use super::process::{LineParser, RunLimits, run_agent};
use super::types::AssistEvent;
use serde_json::json;
use std::time::Duration;
use tokio::sync::oneshot;

const FIXTURE: &str = include_str!("fixtures/claude-stream.jsonl");

fn parse_all(text: &str) -> Vec<AssistEvent> {
    let mut parser = ClaudeParser::default();
    text.lines().flat_map(|line| parser.line(line)).collect()
}

#[test]
fn claude_parser_streams_top_level_text_and_tool_activity() {
    let events = parse_all(FIXTURE);
    assert_eq!(
        events,
        vec![
            AssistEvent::Started {
                session_id: Some("s-1".into())
            },
            AssistEvent::Text {
                text: "The server says ".into()
            },
            AssistEvent::Text {
                text: "`qty` is required.".into()
            },
            AssistEvent::Activity {
                label: "Reading /app/src/orders.ts".into()
            },
            AssistEvent::Text {
                text: "\n\nAdd `qty` to the body.".into()
            },
            AssistEvent::Done {
                session_id: Some("s-1".into()),
                cost_usd: Some(0.0123)
            },
        ]
    );
}

#[test]
fn claude_parser_falls_back_to_whole_messages_without_partial_deltas() {
    let line = json!({
        "type": "assistant",
        "message": { "content": [{ "type": "text", "text": "whole answer" }] },
        "parent_tool_use_id": null
    })
    .to_string();
    assert_eq!(
        parse_all(&line),
        vec![AssistEvent::Text {
            text: "whole answer".into()
        }]
    );
}

#[test]
fn claude_parser_reports_an_error_result() {
    let line = json!({
        "type": "result", "subtype": "error_during_execution", "is_error": true,
        "result": "Credit balance is too low", "session_id": "s-2"
    })
    .to_string();
    assert_eq!(
        parse_all(&line),
        vec![AssistEvent::Error {
            message: "Credit balance is too low".into()
        }]
    );
}

#[test]
fn claude_parser_names_an_error_result_without_text() {
    let line =
        json!({ "type": "result", "subtype": "error_max_turns", "is_error": true }).to_string();
    assert_eq!(
        parse_all(&line),
        vec![AssistEvent::Error {
            message: "Claude Code stopped: error_max_turns".into()
        }]
    );
}

#[test]
fn describes_tools_in_plain_words() {
    assert_eq!(
        describe_tool("Grep", &json!({ "pattern": "qty" })),
        "Searching for qty"
    );
    assert_eq!(
        describe_tool("Glob", &json!({ "pattern": "**/*.ts" })),
        "Finding files **/*.ts"
    );
    assert_eq!(
        describe_tool("WebSearch", &json!({ "query": "422" })),
        "Searching the web for 422"
    );
    assert_eq!(describe_tool("Read", &json!({})), "Using Read");
    assert_eq!(describe_tool("Task", &json!({})), "Using Task");
}

#[test]
fn claude_runs_read_only_and_reads_the_prompt_from_stdin() {
    let claude = find_agent("claude").expect("claude is a known agent");
    let args = claude.args;
    for flag in [
        "-p",
        "--permission-mode",
        "plan",
        "--restricted",
        "--strict-mcp-config",
    ] {
        assert!(args.contains(&flag), "missing {flag}");
    }
    assert!(
        !args
            .iter()
            .any(|a| a.contains("bypass") || a.contains("acceptEdits"))
    );
    let tools = args
        .iter()
        .position(|a| *a == "--tools")
        .map(|i| args[i + 1]);
    assert_eq!(
        tools,
        Some("Read,Grep,Glob"),
        "only read-only tools, no WebSearch"
    );
    assert!(AGENTS.iter().all(|agent| !agent.args.is_empty()));
    assert!(find_agent("nope").is_none());
}

#[test]
fn parses_versions_from_cli_output() {
    assert_eq!(
        parse_version("2.1.330 (Claude Code)\n"),
        Some("2.1.330".into())
    );
    assert_eq!(parse_version("codex-cli 0.9.1"), Some("0.9.1".into()));
    assert_eq!(parse_version("  \n"), None);
}

// --- Process runs against a fake CLI ------------------------------------------------------

#[cfg(unix)]
mod fake_cli {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;
    use std::sync::{Arc, Mutex};

    /// Echoes each stdin line back as a text event, so the test sees the prompt arrived.
    struct EchoParser;
    impl LineParser for EchoParser {
        fn line(&mut self, line: &str) -> Vec<AssistEvent> {
            match line.strip_prefix("DONE") {
                Some(_) => vec![AssistEvent::Done {
                    session_id: None,
                    cost_usd: None,
                }],
                None => vec![AssistEvent::Text {
                    text: line.to_owned(),
                }],
            }
        }
    }

    const SPEC: AgentSpec = AgentSpec {
        id: "fake",
        name: "Fake",
        program: "fake",
        args: &[],
        parser: || Box::new(EchoParser),
    };

    fn script(dir: &tempfile::TempDir, body: &str) -> PathBuf {
        let path = dir.path().join("fake-agent");
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        path
    }

    async fn run(
        body: &str,
        limits: RunLimits,
        cancel: oneshot::Receiver<()>,
    ) -> (Result<(), String>, Vec<AssistEvent>) {
        let dir = tempfile::tempdir().unwrap();
        let program = script(&dir, body);
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        let result = run_agent(
            &SPEC,
            &program,
            "line one\nline two",
            dir.path(),
            limits,
            cancel,
            move |e| sink.lock().unwrap().push(e),
        )
        .await;
        let events = events.lock().unwrap().clone();
        (result, events)
    }

    fn limits() -> RunLimits {
        RunLimits {
            timeout: Duration::from_secs(10),
            grace: Duration::from_millis(200),
        }
    }

    #[tokio::test]
    async fn streams_stdout_lines_through_the_parser() {
        let (_keep, cancel) = oneshot::channel();
        let (result, events) = run("cat; echo; echo DONE", limits(), cancel).await;
        assert_eq!(result, Ok(()));
        assert_eq!(
            events,
            vec![
                AssistEvent::Text {
                    text: "line one".into()
                },
                AssistEvent::Text {
                    text: "line two".into()
                },
                AssistEvent::Done {
                    session_id: None,
                    cost_usd: None
                },
            ]
        );
    }

    #[tokio::test]
    async fn reports_a_failed_exit_with_the_tail_of_stderr() {
        let (_keep, cancel) = oneshot::channel();
        let (result, events) = run(
            "echo 'error: unknown option --restricted' >&2; exit 2",
            limits(),
            cancel,
        )
        .await;
        assert_eq!(result, Ok(()));
        assert_eq!(
            events,
            vec![AssistEvent::Error {
                message: "Fake exited with code 2: error: unknown option --restricted".into()
            }]
        );
    }

    #[tokio::test]
    async fn a_clean_exit_without_a_result_still_finishes() {
        let (_keep, cancel) = oneshot::channel();
        let (_, events) = run("cat >/dev/null; echo hello", limits(), cancel).await;
        assert_eq!(
            events,
            vec![
                AssistEvent::Text {
                    text: "hello".into()
                },
                AssistEvent::Done {
                    session_id: None,
                    cost_usd: None
                },
            ]
        );
    }

    #[tokio::test]
    async fn stop_ends_the_run_and_its_children() {
        let (stop, cancel) = oneshot::channel();
        let handle = tokio::spawn(run("sleep 30 & wait", limits(), cancel));
        tokio::time::sleep(Duration::from_millis(200)).await;
        stop.send(()).unwrap();
        let (result, events) = tokio::time::timeout(Duration::from_secs(5), handle)
            .await
            .expect("run ends promptly after stop")
            .unwrap();
        assert_eq!(result, Ok(()));
        assert_eq!(events, vec![AssistEvent::Stopped]);
    }

    #[tokio::test]
    async fn times_out() {
        let (_keep, cancel) = oneshot::channel();
        let limits = RunLimits {
            timeout: Duration::from_millis(300),
            grace: Duration::from_millis(100),
        };
        let (_, events) = run("sleep 30", limits, cancel).await;
        assert_eq!(
            events,
            vec![AssistEvent::Error {
                message: "Fake took longer than 0.3 s and was stopped.".into()
            }]
        );
    }
}

/// Runs the real Claude Code with Narada's arguments. Uses your account and costs a little,
/// so it only runs on request: `cargo test real_claude -- --ignored --nocapture`.
#[tokio::test]
#[ignore]
async fn real_claude_answers_through_the_parser() {
    let spec = find_agent("claude").unwrap();
    let path = crate::shell_env::effective_path().unwrap_or_default();
    let program = crate::shell_env::find_program(spec.program, &path).expect("claude installed");
    let dir = tempfile::tempdir().unwrap();
    let (_keep, cancel) = oneshot::channel();
    let mut events = Vec::new();
    let limits = RunLimits {
        timeout: Duration::from_secs(120),
        grace: Duration::from_secs(2),
    };
    run_agent(
        spec,
        &program,
        "Reply with exactly: narada ok",
        dir.path(),
        limits,
        cancel,
        |e| events.push(e),
    )
    .await
    .unwrap();
    println!("{events:#?}");
    let text: String = events
        .iter()
        .filter_map(|e| match e {
            AssistEvent::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert!(text.contains("narada ok"), "got {text:?}");
    assert!(matches!(events.last(), Some(AssistEvent::Done { .. })));
}

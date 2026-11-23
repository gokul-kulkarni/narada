use super::agents::{AGENTS, AgentSpec, find_agent, parse_version, run_args};
use super::claude::{ClaudeParser, describe_tool};
use super::codex::{CodexParser, describe_command};
use super::process::{LineParser, RunLimits, RunPlan, run_agent};
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
    let owned = (claude.new_args)();
    let args: Vec<&str> = owned.iter().map(String::as_str).collect();
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
    assert!(AGENTS.iter().all(|agent| !(agent.new_args)().is_empty()));
    assert!(find_agent("nope").is_none());
}

#[test]
fn claude_resumes_a_session_for_follow_ups() {
    let claude = find_agent("claude").unwrap();
    let fresh = (claude.new_args)();
    assert!(
        !fresh.iter().any(|a| a == "--no-session-persistence"),
        "sessions must be kept to resume"
    );
    assert_eq!(run_args(claude, None), Ok(fresh.clone()));
    let resumed = run_args(claude, Some("fbe6303d-f6f1-4cd2-b072-9424d9d77c6b")).unwrap();
    assert_eq!(resumed[..fresh.len()], fresh[..]);
    assert_eq!(
        resumed[fresh.len()..],
        ["--resume", "fbe6303d-f6f1-4cd2-b072-9424d9d77c6b"]
    );
}

#[test]
fn rejects_session_ids_that_could_act_as_flags() {
    for agent in AGENTS {
        for bad in ["", "--tools=Bash", "-r", "a b", "x;rm", &"a".repeat(129)] {
            assert!(
                run_args(agent, Some(bad)).is_err(),
                "{} accepted {bad:?}",
                agent.id
            );
        }
    }
}

#[test]
fn an_agent_without_resume_cannot_follow_up() {
    const NO_RESUME: AgentSpec = AgentSpec {
        id: "x",
        name: "X",
        program: "x",
        new_args: || vec!["-p".into()],
        resume_args: None,
        project_config: None,
        parser: || Box::new(ClaudeParser::default()),
    };
    assert_eq!(run_args(&NO_RESUME, None), Ok(vec!["-p".to_string()]));
    assert_eq!(
        run_args(&NO_RESUME, Some("abc")),
        Err("X cannot continue a conversation.".to_string())
    );
}

// --- Codex --------------------------------------------------------------------------------

const CODEX_FIXTURE: &str = include_str!("fixtures/codex-stream.jsonl");

#[test]
fn codex_parser_reports_messages_commands_and_the_thread() {
    let mut parser = CodexParser::default();
    let events: Vec<AssistEvent> = CODEX_FIXTURE.lines().flat_map(|l| parser.line(l)).collect();
    assert_eq!(
        events,
        vec![
            AssistEvent::Started {
                session_id: Some("01a20791-5d9a-75a0-9d57-74fe6495ff06".into())
            },
            AssistEvent::Text {
                text: "I'll read the handler first.".into()
            },
            AssistEvent::Activity {
                label: "Running cat src/orders.ts".into()
            },
            AssistEvent::Text {
                text: "\n\nThe handler requires `qty`.".into()
            },
            AssistEvent::Done {
                session_id: Some("01a20791-5d9a-75a0-9d57-74fe6495ff06".into()),
                cost_usd: None
            },
        ]
    );
}

#[test]
fn codex_parser_reports_a_failed_turn_once() {
    let mut parser = CodexParser::default();
    let lines = [
        r#"{"type":"error","message":"Your access token could not be refreshed."}"#,
        r#"{"type":"turn.failed","error":{"message":"Your access token could not be refreshed."}}"#,
    ];
    let events: Vec<AssistEvent> = lines.iter().flat_map(|l| parser.line(l)).collect();
    assert_eq!(
        events,
        vec![AssistEvent::Error {
            message: "Your access token could not be refreshed.".into()
        }]
    );
}

#[test]
fn describes_codex_commands_without_the_shell_wrapper() {
    assert_eq!(
        describe_command("/bin/zsh -lc 'cat src/orders.ts'"),
        "Running cat src/orders.ts"
    );
    assert_eq!(describe_command("bash -lc ls"), "Running ls");
    assert_eq!(describe_command("rg qty"), "Running rg qty");
}

#[test]
fn codex_runs_in_a_read_only_profile_without_network_tools() {
    let codex = find_agent("codex").expect("codex is a known agent");
    let args = (codex.new_args)();
    assert_eq!(args.first().map(String::as_str), Some("exec"));
    assert_eq!(
        args.last().map(String::as_str),
        Some("-"),
        "prompt on stdin"
    );
    let joined = args.join(" ");
    for needed in [
        "--json",
        "--ignore-user-config",
        "--ignore-rules",
        r#"default_permissions="narada""#,
        r#"permissions.narada.filesystem={":minimal"="read", ":workspace_roots"={"."="read"}}"#,
        r#"web_search="disabled""#,
        "mcp_servers={}",
        "--disable browser_use",
        "--disable browser_use_external",
        "--disable in_app_browser",
        "--disable apps",
        "--disable image_generation",
    ] {
        assert!(joined.contains(needed), "missing {needed}");
    }
    // --sandbox (or sandbox_mode) would switch Codex back to its legacy sandbox, which reads
    // the whole disk, and the custom profile would be ignored.
    for forbidden in [
        "--sandbox",
        "sandbox_mode",
        "dangerously",
        "--trust",
        "--full-auto",
        "write",
    ] {
        assert!(!joined.contains(forbidden), "has {forbidden}");
    }
    assert!(
        !args.iter().any(|a| a == "--ephemeral"),
        "sessions must be kept to resume"
    );
    assert_eq!(codex.project_config, Some(".codex/config.toml"));
}

#[test]
fn codex_resumes_with_the_same_limits() {
    let codex = find_agent("codex").unwrap();
    let fresh = (codex.new_args)();
    let resumed = run_args(codex, Some("01a20791-5d9a-75a0-9d57-74fe6495ff06")).unwrap();
    let options = &fresh[1..fresh.len() - 1];
    assert_eq!(resumed[..2], ["exec", "resume"]);
    assert_eq!(&resumed[2..2 + options.len()], options);
    assert_eq!(
        resumed[2 + options.len()..],
        ["01a20791-5d9a-75a0-9d57-74fe6495ff06", "-"]
    );
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
        new_args: || vec!["--fixed".into()],
        resume_args: Some(|id| vec!["--fixed".into(), "--resume".into(), id.into()]),
        project_config: None,
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
        let plan = RunPlan {
            spec: &SPEC,
            program: &program,
            args: &[],
            prompt: "line one\nline two",
            cwd: dir.path(),
        };
        let result = run_agent(plan, limits, cancel, move |e| sink.lock().unwrap().push(e)).await;
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
    async fn passes_fixed_and_extra_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let program = script(&dir, "cat >/dev/null; echo \"$@\"");
        let (_keep, cancel) = oneshot::channel();
        let mut events = Vec::new();
        let extra = run_args(&SPEC, Some("s-1")).unwrap();
        run_agent(
            RunPlan {
                spec: &SPEC,
                program: &program,
                args: &extra,
                prompt: "p",
                cwd: dir.path(),
            },
            limits(),
            cancel,
            |e| events.push(e),
        )
        .await
        .unwrap();
        assert_eq!(
            events[0],
            AssistEvent::Text {
                text: "--fixed --resume s-1".into()
            }
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
    let args = run_args(spec, None).unwrap();
    let plan = RunPlan {
        spec,
        program: &program,
        args: &args,
        prompt: "Reply with exactly: narada ok",
        cwd: dir.path(),
    };
    run_agent(plan, limits, cancel, |e| events.push(e))
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

/// A follow-up continues the same Claude Code session. Costs a little; opt-in like the above.
#[tokio::test]
#[ignore]
async fn real_claude_remembers_across_a_follow_up() {
    let spec = find_agent("claude").unwrap();
    let path = crate::shell_env::effective_path().unwrap_or_default();
    let program = crate::shell_env::find_program(spec.program, &path).expect("claude installed");
    let dir = tempfile::tempdir().unwrap();
    let limits = RunLimits {
        timeout: Duration::from_secs(120),
        grace: Duration::from_secs(2),
    };
    let ask = |prompt: &'static str, extra: Vec<String>| {
        let program = program.clone();
        let cwd = dir.path().to_path_buf();
        async move {
            let (_keep, cancel) = oneshot::channel();
            let mut events = Vec::new();
            let plan = RunPlan {
                spec,
                program: &program,
                args: &extra,
                prompt,
                cwd: &cwd,
            };
            run_agent(plan, limits, cancel, |e| events.push(e))
                .await
                .unwrap();
            events
        }
    };
    let first = ask(
        "Remember the word pelican. Reply with exactly: ok",
        run_args(spec, None).unwrap(),
    )
    .await;
    let Some(AssistEvent::Done {
        session_id: Some(session),
        ..
    }) = first.last().cloned()
    else {
        panic!("no session: {first:?}");
    };
    let second = ask(
        "Which word did I ask you to remember? One word.",
        run_args(spec, Some(&session)).unwrap(),
    )
    .await;
    let text: String = second
        .iter()
        .filter_map(|e| match e {
            AssistEvent::Text { text } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert!(text.to_lowercase().contains("pelican"), "got {second:?}");
}

mod project_folder {
    use super::super::folder::project_folder;

    #[test]
    fn accepts_an_existing_folder_inside_home() {
        let home = tempfile::tempdir().unwrap();
        let project = home.path().join("shop-api");
        std::fs::create_dir(&project).unwrap();
        let chosen = project_folder(project.to_str().unwrap(), home.path()).unwrap();
        assert_eq!(chosen, project.canonicalize().unwrap());
    }

    #[test]
    fn refuses_folders_that_would_expose_too_much_or_do_not_exist() {
        let home = tempfile::tempdir().unwrap();
        let file = home.path().join("file.txt");
        std::fs::write(&file, "x").unwrap();
        let cases = [
            ("relative/path", "Choose a full folder path."),
            (
                "/",
                "Choose a project folder, not the whole disk or your home folder.",
            ),
            (
                home.path().to_str().unwrap(),
                "Choose a project folder, not the whole disk or your home folder.",
            ),
            (
                file.to_str().unwrap(),
                "That project folder doesn't exist any more.",
            ),
            (
                "/definitely/not/here",
                "That project folder doesn't exist any more.",
            ),
        ];
        for (path, message) in cases {
            assert_eq!(
                project_folder(path, home.path()),
                Err(message.to_string()),
                "{path}"
            );
        }
    }
}

mod codex_project_config {
    use super::super::folder::has_project_config;

    #[test]
    fn finds_codex_settings_in_the_folder_or_a_parent_up_to_home() {
        let home = tempfile::tempdir().unwrap();
        let project = home.path().join("work/shop/api");
        std::fs::create_dir_all(&project).unwrap();
        let rel = ".codex/config.toml";
        assert!(!has_project_config(&project, rel, home.path()));

        // The user's own ~/.codex/config.toml is skipped with --ignore-user-config.
        std::fs::create_dir_all(home.path().join(".codex")).unwrap();
        std::fs::write(home.path().join(rel), "model = \"x\"").unwrap();
        assert!(!has_project_config(&project, rel, home.path()));

        std::fs::create_dir_all(home.path().join("work/shop/.codex")).unwrap();
        std::fs::write(
            home.path().join("work/shop").join(rel),
            "sandbox_mode = \"danger-full-access\"",
        )
        .unwrap();
        assert!(has_project_config(&project, rel, home.path()));
    }
}

/// Runs the real Codex with Narada's arguments: it reads inside its folder, is refused
/// outside it, and a follow-up continues the thread. Uses your account; opt-in:
/// `cargo test real_codex -- --ignored --nocapture`.
#[tokio::test]
#[ignore]
async fn real_codex_stays_in_its_folder_and_follows_up() {
    let spec = find_agent("codex").unwrap();
    let path = crate::shell_env::effective_path().unwrap_or_default();
    let program = crate::shell_env::find_program(spec.program, &path).expect("codex installed");
    // Outside the temp folders, which Codex's shell may always read.
    let home = std::env::var("HOME").unwrap();
    let base = tempfile::tempdir_in(&home).unwrap();
    let project = base.path().join("proj");
    let outside = base.path().join("outside");
    std::fs::create_dir_all(&project).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(project.join("inside.txt"), "inside-4410").unwrap();
    std::fs::write(outside.join("note.txt"), "canary-7731").unwrap();
    let limits = RunLimits {
        timeout: Duration::from_secs(240),
        grace: Duration::from_secs(2),
    };
    let run = |prompt: String, args: Vec<String>| {
        let program = program.clone();
        let cwd = project.clone();
        async move {
            let (_keep, cancel) = oneshot::channel();
            let mut events = Vec::new();
            let plan = RunPlan {
                spec,
                program: &program,
                args: &args,
                prompt: &prompt,
                cwd: &cwd,
            };
            run_agent(plan, limits, cancel, |e| events.push(e))
                .await
                .unwrap();
            events
        }
    };
    let text_of = |events: &[AssistEvent]| -> String {
        events
            .iter()
            .filter_map(|e| match e {
                AssistEvent::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect()
    };
    let note = outside.join("note.txt");
    let first = run(
        format!(
            "Use shell commands: cat inside.txt, then cat {}. Reply exactly as INSIDE=<output>; OUTSIDE=<output or error>. Also remember the word pelican.",
            note.display()
        ),
        run_args(spec, None).unwrap(),
    )
    .await;
    println!("{first:#?}");
    let answer = text_of(&first);
    assert!(
        answer.contains("inside-4410"),
        "could not read inside: {answer}"
    );
    assert!(
        !answer.contains("canary-7731"),
        "read outside its folder: {answer}"
    );
    let Some(AssistEvent::Done {
        session_id: Some(thread),
        ..
    }) = first.last().cloned()
    else {
        panic!("no thread: {first:?}");
    };
    let second = run(
        "Which word did I ask you to remember? One word.".into(),
        run_args(spec, Some(&thread)).unwrap(),
    )
    .await;
    println!("{second:#?}");
    assert!(text_of(&second).to_lowercase().contains("pelican"));
}

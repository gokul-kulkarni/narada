use super::handler::Notifier;
use super::transport::connect;
use super::*;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::{ServiceExt, tool, tool_router};
use std::sync::Mutex as StdMutex;

#[derive(serde::Deserialize, rmcp::schemars::JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
struct AddArgs {
    a: i64,
    b: i64,
}

#[derive(Clone)]
struct Calculator;

#[tool_router(server_handler)]
impl Calculator {
    #[tool(description = "Add two numbers")]
    async fn add(&self, Parameters(AddArgs { a, b }): Parameters<AddArgs>) -> String {
        (a + b).to_string()
    }
}

/// A client session wired to an in-process server over an in-memory pipe.
async fn session() -> (
    RunningService<RoleClient, Notifier>,
    Arc<StdMutex<Vec<McpEvent>>>,
) {
    let (client_io, server_io) = tokio::io::duplex(64 * 1024);
    tokio::spawn(async move {
        let server = Calculator.serve(server_io).await.unwrap();
        let _ = server.waiting().await;
    });
    let events = Arc::new(StdMutex::new(Vec::new()));
    let seen = events.clone();
    let sink: Sink = Arc::new(move |event| seen.lock().unwrap().push(event));
    (Notifier::new(sink).serve(client_io).await.unwrap(), events)
}

#[tokio::test]
async fn reports_server_info_and_lists_tools() {
    let (session, _) = session().await;
    let info = server_info(&session).unwrap();
    assert!(info["serverInfo"]["name"].is_string(), "{info}");
    assert!(info["capabilities"]["tools"].is_object(), "{info}");

    let tools = list(&session, ListKind::Tools).await.unwrap();
    assert_eq!(tools[0]["name"], "add");
    assert_eq!(
        tools[0]["inputSchema"]["properties"]["a"]["type"],
        "integer"
    );
}

#[tokio::test]
async fn calls_a_tool_and_times_it() {
    let (session, _) = session().await;
    let arguments = serde_json::json!({ "a": 2, "b": 3 })
        .as_object()
        .unwrap()
        .clone();
    let timed = run(
        &session,
        Operation::Tool {
            name: "add".into(),
            arguments,
        },
        Duration::from_secs(5),
    )
    .await
    .unwrap();
    assert_eq!(timed.result["content"][0]["text"], "5");
    assert_ne!(timed.result["isError"], true);
}

#[tokio::test]
async fn reports_protocol_errors_readably() {
    let (session, _) = session().await;
    let arguments = serde_json::Map::new();
    let error = run(
        &session,
        Operation::Tool {
            name: "nope".into(),
            arguments,
        },
        Duration::from_secs(5),
    )
    .await
    .map(|t| t.result)
    .unwrap_err_or_tool_error();
    assert!(!error.is_empty());
}

trait ErrOrToolError {
    fn unwrap_err_or_tool_error(self) -> String;
}

/// A server may answer an unknown tool with a protocol error or with an `isError` result.
impl ErrOrToolError for Result<Value, String> {
    fn unwrap_err_or_tool_error(self) -> String {
        match self {
            Err(error) => error,
            Ok(result) => {
                assert_eq!(result["isError"], true, "{result}");
                result["content"][0]["text"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string()
            }
        }
    }
}

/// The error of a connect attempt (sessions are not `Debug`, so `unwrap_err` is unavailable).
fn error_of<T>(result: Result<T, String>) -> String {
    match result {
        Err(error) => error,
        Ok(_) => panic!("expected an error"),
    }
}

fn quiet_sink() -> Sink {
    Arc::new(|_| {})
}

#[tokio::test]
async fn explains_stdio_and_http_setup_errors() {
    let empty = ServerTransport::Stdio {
        command: " ".into(),
        args: vec![],
        env: vec![],
        cwd: None,
    };
    assert!(error_of(connect(empty, quiet_sink()).await).contains("Enter the command"));

    let missing = ServerTransport::Stdio {
        command: "narada-no-such-command".into(),
        args: vec![],
        env: vec![],
        cwd: None,
    };
    assert!(error_of(connect(missing, quiet_sink()).await).contains("Could not start"));

    let bad_url = ServerTransport::Http {
        url: "not a url".into(),
        headers: vec![],
    };
    assert!(error_of(connect(bad_url, quiet_sink()).await).contains("Invalid URL"));

    let bad_header = ServerTransport::Http {
        url: "http://127.0.0.1:9".into(),
        headers: vec![("bad header".into(), "x".into())],
    };
    assert!(error_of(connect(bad_header, quiet_sink()).await).contains("Invalid header name"));
}

#[tokio::test]
async fn stdio_servers_forward_stderr_and_fail_without_a_handshake() {
    let events = Arc::new(StdMutex::new(Vec::new()));
    let seen = events.clone();
    let sink: Sink = Arc::new(move |event| seen.lock().unwrap().push(event));
    let noisy = ServerTransport::Stdio {
        command: "/bin/sh".into(),
        args: vec!["-c".into(), "echo starting >&2; exit 1".into()],
        env: vec![],
        cwd: None,
    };
    let error = error_of(connect(noisy, sink).await);
    assert!(error.contains("did not start an MCP session"), "{error}");
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert!(events.lock().unwrap().contains(&McpEvent::Stderr {
        line: "starting".into()
    }));
}

/// End to end over a real child process: needs Node and the repo's node_modules,
/// and is skipped (passes trivially) when either is missing.
#[tokio::test]
async fn talks_to_a_real_stdio_server() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let script = root.join("tests/fixtures/stdio-mcp-server.mjs");
    let sdk = root.join("../node_modules/@modelcontextprotocol/sdk");
    let node = std::process::Command::new("node").arg("--version").output();
    if node.is_err() || !sdk.exists() {
        return;
    }
    let events = Arc::new(StdMutex::new(Vec::new()));
    let seen = events.clone();
    let sink: Sink = Arc::new(move |event| seen.lock().unwrap().push(event));
    let transport = ServerTransport::Stdio {
        command: "node".into(),
        args: vec![script.to_string_lossy().into_owned()],
        env: vec![("NARADA_TEST".into(), "from-env".into())],
        cwd: Some(root.to_string_lossy().into_owned()),
    };
    let session = connect(transport, sink).await.unwrap();
    assert_eq!(
        server_info(&session).unwrap()["serverInfo"]["name"],
        "stdio-calculator"
    );

    let tools = list(&session, ListKind::Tools).await.unwrap();
    assert_eq!(tools.as_array().unwrap().len(), 2);
    let args = serde_json::json!({ "a": 20, "b": 22 })
        .as_object()
        .unwrap()
        .clone();
    let sum = run(
        &session,
        Operation::Tool {
            name: "add".into(),
            arguments: args,
        },
        Duration::from_secs(10),
    );
    assert_eq!(sum.await.unwrap().result["content"][0]["text"], "42");
    let who = Operation::Tool {
        name: "whoami".into(),
        arguments: serde_json::Map::new(),
    };
    let who = run(&session, who, Duration::from_secs(10)).await.unwrap();
    assert_eq!(who.result["content"][0]["text"], "from-env");

    tokio::time::sleep(Duration::from_millis(100)).await;
    let stderr = McpEvent::Stderr {
        line: "stdio-calculator ready".into(),
    };
    assert!(events.lock().unwrap().contains(&stderr));
    session.cancellation_token().cancel();
}

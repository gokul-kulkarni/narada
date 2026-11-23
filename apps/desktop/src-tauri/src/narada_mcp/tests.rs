use super::bridge::{BridgeFuture, ToolBridge};
use super::http::{Running, serve};
use crate::mcp::{ListKind, Operation, ServerTransport, Sink, connect, list, run};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_util::sync::CancellationToken;

const TOKEN: &str = "test-token-0123456789abcdef0123456789abcdef";

/// Answers tool calls from a fixed table and records what it was asked.
#[derive(Default)]
struct StaticBridge {
    calls: Mutex<Vec<(String, Value)>>,
    clients: Mutex<Vec<Option<String>>>,
}

impl ToolBridge for StaticBridge {
    fn call(
        &self,
        tool: &str,
        arguments: Value,
        client: Option<String>,
        _cancelled: CancellationToken,
    ) -> BridgeFuture<'_> {
        self.clients.lock().unwrap().push(client);
        self.calls
            .lock()
            .unwrap()
            .push((tool.to_owned(), arguments));
        let tool = tool.to_owned();
        Box::pin(async move {
            match tool.as_str() {
                "list_collections" => Ok(json!([{ "id": "c1", "name": "Shop" }])),
                "get_request" => Err("No request with id \"nope\".".to_owned()),
                _ => Ok(json!({ "tool": tool })),
            }
        })
    }
}

async fn start() -> (Running, Arc<StaticBridge>) {
    let bridge = Arc::new(StaticBridge::default());
    let running = serve(0, TOKEN.into(), bridge.clone()).await.unwrap();
    (running, bridge)
}

fn initialize() -> Value {
    json!({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "clientInfo": { "name": "test", "version": "1" }
        }
    })
}

async fn post(port: u16, headers: &[(&str, &str)]) -> reqwest::StatusCode {
    let mut request = reqwest::Client::new()
        .post(format!("http://127.0.0.1:{port}/mcp"))
        .header("Accept", "application/json, text/event-stream")
        .json(&initialize());
    for (name, value) in headers {
        request = request.header(*name, *value);
    }
    request.send().await.unwrap().status()
}

#[tokio::test]
async fn refuses_requests_without_the_right_token() {
    let (running, _) = start().await;
    assert_eq!(post(running.port, &[]).await, 401);
    assert_eq!(
        post(running.port, &[("Authorization", "Bearer wrong")]).await,
        401
    );
    assert_eq!(post(running.port, &[("Authorization", TOKEN)]).await, 401);
    let auth = format!("Bearer {TOKEN}");
    assert!(
        post(running.port, &[("Authorization", &auth)])
            .await
            .is_success()
    );
    running.stop();
}

#[tokio::test]
async fn refuses_web_pages_and_other_hosts() {
    let (running, _) = start().await;
    let auth = format!("Bearer {TOKEN}");
    let from_page = post(
        running.port,
        &[("Authorization", &auth), ("Origin", "https://evil.example")],
    )
    .await;
    assert!(from_page.is_client_error(), "origin allowed: {from_page}");
    let rebound = post(
        running.port,
        &[("Authorization", &auth), ("Host", "evil.example")],
    )
    .await;
    assert!(rebound.is_client_error(), "host allowed: {rebound}");
    running.stop();
}

#[tokio::test]
async fn lists_its_tools_and_forwards_calls_to_the_app() {
    let (running, bridge) = start().await;
    let sink: Sink = Arc::new(|_| {});
    let transport = ServerTransport::Http {
        url: format!("http://127.0.0.1:{}/mcp", running.port),
        headers: vec![("Authorization".into(), format!("Bearer {TOKEN}"))],
    };
    let session = connect(transport, sink).await.unwrap();

    let tools = list(&session, ListKind::Tools).await.unwrap();
    let mut names: Vec<&str> = tools
        .as_array()
        .unwrap()
        .iter()
        .map(|t| t["name"].as_str().unwrap())
        .collect();
    names.sort_unstable();
    assert_eq!(
        names,
        [
            "create_collection",
            "create_folder",
            "create_request",
            "get_last_delivery",
            "get_request",
            "list_collections",
            "list_environments",
            "list_history",
            "send_request",
            "update_request"
        ]
    );

    let call = |name: &str, arguments: Value| Operation::Tool {
        name: name.into(),
        arguments: arguments.as_object().unwrap().clone(),
    };
    let listed = run(
        &session,
        call("list_collections", json!({})),
        Duration::from_secs(5),
    )
    .await
    .unwrap();
    let listed = serde_json::to_value(listed).unwrap();
    let text = listed["result"]["content"][0]["text"].as_str().unwrap();
    assert_eq!(
        serde_json::from_str::<Value>(text).unwrap(),
        json!([{ "id": "c1", "name": "Shop" }])
    );

    let missing = run(
        &session,
        call("get_request", json!({ "requestId": "nope" })),
        Duration::from_secs(5),
    )
    .await
    .unwrap();
    let missing = serde_json::to_value(missing).unwrap();
    assert_eq!(missing["result"]["isError"], true);
    assert_eq!(
        missing["result"]["content"][0]["text"],
        "No request with id \"nope\"."
    );

    run(
        &session,
        call("list_history", json!({ "limit": 3 })),
        Duration::from_secs(5),
    )
    .await
    .unwrap();
    let calls = bridge.calls.lock().unwrap().clone();
    assert_eq!(
        calls[1],
        ("get_request".to_owned(), json!({ "requestId": "nope" }))
    );
    assert_eq!(calls[2], ("list_history".to_owned(), json!({ "limit": 3 })));

    let request = json!({
        "collection": "Shop",
        "folder": "orders",
        "requests": [{
            "name": "Create order",
            "method": "POST",
            "url": "{{baseUrl}}/orders",
            "headers": [{ "key": "Content-Type", "value": "application/json" }],
            "body": { "mode": "raw", "language": "json", "raw": "{}" }
        }]
    });
    let timeout = Duration::from_secs(5);
    run(&session, call("create_request", request.clone()), timeout)
        .await
        .unwrap();
    run(
        &session,
        call("create_collection", json!({ "name": "Billing" })),
        timeout,
    )
    .await
    .unwrap();
    let update = json!({
        "requestId": "r1",
        "changes": { "method": "POST", "removeHeaders": ["X-Old"] }
    });
    run(&session, call("update_request", update.clone()), timeout)
        .await
        .unwrap();
    let send = json!({ "requestId": "r1" });
    run(&session, call("send_request", send.clone()), timeout)
        .await
        .unwrap();
    let calls = bridge.calls.lock().unwrap().clone();
    assert_eq!(calls[5], ("update_request".to_owned(), update));
    assert_eq!(calls[6], ("send_request".to_owned(), send));
    assert_eq!(calls[3], ("create_request".to_owned(), request));
    assert_eq!(
        calls[4],
        ("create_collection".to_owned(), json!({ "name": "Billing" }))
    );
    // The app names the agent when it asks the user to approve a change.
    let clients = bridge.clients.lock().unwrap().clone();
    assert!(
        clients.iter().all(|c| c.as_deref() == Some("Narada")),
        "{clients:?}"
    );

    let prompts = list(&session, ListKind::Prompts).await.unwrap();
    assert_eq!(prompts[0]["name"], "requests_from_code");
    let arguments = json!({ "collection": "Shop API" })
        .as_object()
        .unwrap()
        .clone();
    let prompt = run(
        &session,
        Operation::Prompt {
            name: "requests_from_code".into(),
            arguments,
        },
        timeout,
    )
    .await
    .unwrap();
    let prompt = serde_json::to_value(prompt).unwrap();
    let text = prompt["result"]["messages"][0]["content"]["text"]
        .as_str()
        .unwrap();
    assert!(
        text.contains("create_request") && text.contains("\"Shop API\""),
        "{text}"
    );
    running.stop();
}

#[tokio::test]
async fn says_when_the_port_is_taken() {
    let (running, _) = start().await;
    let error = serve(
        running.port,
        TOKEN.into(),
        Arc::new(StaticBridge::default()),
    )
    .await
    .err()
    .unwrap();
    assert!(error.contains("already in use"), "{error}");
    running.stop();
}

#[tokio::test]
async fn stops_listening_when_stopped() {
    let (running, _) = start().await;
    let port = running.port;
    running.stop();
    tokio::time::sleep(Duration::from_millis(100)).await;
    let refused = reqwest::Client::new()
        .post(format!("http://127.0.0.1:{port}/mcp"))
        .send()
        .await;
    assert!(refused.is_err(), "still listening");
}

mod tokens {
    use super::super::http::token_matches;

    #[test]
    fn compares_bearer_tokens_exactly() {
        assert!(token_matches(Some("Bearer abc"), "abc"));
        assert!(!token_matches(Some("Bearer abd"), "abc"));
        assert!(!token_matches(Some("Bearer ab"), "abc"));
        assert!(!token_matches(Some("abc"), "abc"));
        assert!(!token_matches(Some("Basic abc"), "abc"));
        assert!(!token_matches(None, "abc"));
    }
}

mod pending_calls {
    use super::super::bridge::Pending;
    use serde_json::json;

    #[tokio::test]
    async fn delivers_the_app_reply_to_the_waiting_call() {
        let pending = Pending::default();
        let (id, reply) = pending.open();
        assert!(pending.answer(&id, Ok(json!(1))));
        assert_eq!(reply.await.unwrap(), Ok(json!(1)));
        assert!(
            !pending.answer(&id, Ok(json!(2))),
            "a call is answered once"
        );
        assert!(!pending.answer("unknown", Ok(json!(3))));
    }
}

mod timeouts {
    use super::super::bridge::answer_timeout;
    use std::time::Duration;

    #[test]
    fn waits_longer_for_changes_the_user_must_approve() {
        assert_eq!(answer_timeout("list_collections"), Duration::from_secs(30));
        assert_eq!(answer_timeout("create_request"), Duration::from_secs(300));
        assert_eq!(
            answer_timeout("create_collection"),
            Duration::from_secs(300)
        );
        assert_eq!(answer_timeout("update_request"), Duration::from_secs(300));
        assert_eq!(answer_timeout("send_request"), Duration::from_secs(300));
    }
}

mod client_names {
    use super::super::server::agent_from_user_agent;

    #[test]
    fn names_agents_from_their_user_agent() {
        assert_eq!(
            agent_from_user_agent("claude-code/2.1.330 (sdk-cli)").as_deref(),
            Some("Claude Code")
        );
        assert_eq!(
            agent_from_user_agent("codex_cli_rs/0.171.0 (Mac OS)").as_deref(),
            Some("Codex")
        );
        assert_eq!(
            agent_from_user_agent("Cursor/1.2").as_deref(),
            Some("Cursor")
        );
        assert_eq!(
            agent_from_user_agent("my-agent/0.1").as_deref(),
            Some("my-agent")
        );
        // Generic HTTP libraries say nothing about which agent it is.
        for generic in [
            "node",
            "undici",
            "python-httpx/0.27",
            "reqwest/0.12",
            "",
            "   ",
        ] {
            assert_eq!(agent_from_user_agent(generic), None, "{generic}");
        }
    }
}

mod waiting {
    use super::super::bridge::{Waited, wait_for_answer};
    use serde_json::json;
    use std::time::Duration;
    use tokio::sync::oneshot;
    use tokio_util::sync::CancellationToken;

    const LONG: Duration = Duration::from_secs(60);

    #[tokio::test]
    async fn returns_the_app_answer() {
        let (send, reply) = oneshot::channel();
        send.send(Ok(json!(1))).unwrap();
        let waited = wait_for_answer(reply, LONG, CancellationToken::new()).await;
        assert_eq!(waited, Waited::Answer(Ok(json!(1))));
    }

    #[tokio::test]
    async fn stops_waiting_when_the_agent_gives_up() {
        let (_send, reply) = oneshot::channel();
        let cancelled = CancellationToken::new();
        let waiting = tokio::spawn(wait_for_answer(reply, LONG, cancelled.clone()));
        cancelled.cancel();
        let outcome = tokio::time::timeout(Duration::from_secs(2), waiting)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(outcome, Waited::Cancelled);
    }

    #[tokio::test]
    async fn times_out_and_notices_a_closed_app() {
        let (_send, reply) = oneshot::channel();
        let quick = Duration::from_millis(20);
        assert_eq!(
            wait_for_answer(reply, quick, CancellationToken::new()).await,
            Waited::TimedOut
        );
        let (send, reply) = oneshot::channel::<Result<serde_json::Value, String>>();
        drop(send);
        assert_eq!(
            wait_for_answer(reply, LONG, CancellationToken::new()).await,
            Waited::Closed
        );
    }
}

mod cancellation {
    use super::*;

    /// Records whether the agent's cancel token fired while a call was still waiting.
    #[derive(Default)]
    struct WatchingBridge {
        cancelled_early: Mutex<Vec<bool>>,
    }

    impl ToolBridge for WatchingBridge {
        fn call(
            &self,
            _tool: &str,
            _arguments: Value,
            _client: Option<String>,
            cancelled: CancellationToken,
        ) -> BridgeFuture<'_> {
            Box::pin(async move {
                let fired = tokio::time::timeout(Duration::from_millis(500), cancelled.cancelled())
                    .await
                    .is_ok();
                self.cancelled_early.lock().unwrap().push(fired);
                Ok(json!({ "ok": true }))
            })
        }
    }

    #[tokio::test]
    async fn a_waiting_call_is_not_cancelled_while_the_agent_still_waits() {
        let bridge = Arc::new(WatchingBridge::default());
        let running = serve(0, TOKEN.into(), bridge.clone()).await.unwrap();
        let sink: Sink = Arc::new(|_| {});
        let transport = ServerTransport::Http {
            url: format!("http://127.0.0.1:{}/mcp", running.port),
            headers: vec![("Authorization".into(), format!("Bearer {TOKEN}"))],
        };
        let session = connect(transport, sink).await.unwrap();
        let arguments = json!({ "name": "Billing" }).as_object().unwrap().clone();
        let call = Operation::Tool {
            name: "create_collection".into(),
            arguments,
        };
        run(&session, call, Duration::from_secs(5)).await.unwrap();
        assert_eq!(*bridge.cancelled_early.lock().unwrap(), vec![false]);
        running.stop();
    }
}

/// Serves the real MCP server on port 7388 with a bridge that answers after 3 s and logs what
/// happened, for pointing a real agent at it. `cargo test serve_for_a_real_agent -- --ignored --nocapture`
#[tokio::test]
#[ignore]
async fn serve_for_a_real_agent() {
    struct SlowBridge;
    impl ToolBridge for SlowBridge {
        fn call(
            &self,
            tool: &str,
            _arguments: Value,
            client: Option<String>,
            cancelled: CancellationToken,
        ) -> BridgeFuture<'_> {
            let tool = tool.to_owned();
            Box::pin(async move {
                println!(
                    "CALL {tool} from {client:?}, cancelled at start: {}",
                    cancelled.is_cancelled()
                );
                tokio::select! {
                    () = tokio::time::sleep(Duration::from_secs(3)) => {
                        println!("ANSWERED {tool}");
                        Ok(json!({ "answered": tool }))
                    }
                    () = cancelled.cancelled() => {
                        println!("CANCELLED {tool} while waiting");
                        Err("cancelled".into())
                    }
                }
            })
        }
    }
    let running = serve(7388, TOKEN.into(), Arc::new(SlowBridge))
        .await
        .unwrap();
    println!("SERVING on {}", running.port);
    tokio::time::sleep(Duration::from_secs(150)).await;
    running.stop();
}

use super::bridge::{BridgeFuture, ToolBridge};
use super::http::{Running, serve};
use crate::mcp::{ListKind, Operation, ServerTransport, Sink, connect, list, run};
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const TOKEN: &str = "test-token-0123456789abcdef0123456789abcdef";

/// Answers tool calls from a fixed table and records what it was asked.
#[derive(Default)]
struct StaticBridge {
    calls: Mutex<Vec<(String, Value)>>,
}

impl ToolBridge for StaticBridge {
    fn call(&self, tool: &str, arguments: Value) -> BridgeFuture<'_> {
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
            "get_last_delivery",
            "get_request",
            "list_collections",
            "list_environments",
            "list_history"
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

use super::*;
use std::future::pending;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// Sends without cancelling and without watching progress.
async fn send_plain(client: &Client, request: HttpRequest) -> Result<HttpResponse, String> {
    send(client, request, pending(), |_| {}).await
}

/// Starts a one-shot server that records the raw request and replies with `reply`.
async fn one_shot_server(reply: &'static [u8]) -> (String, tokio::task::JoinHandle<String>) {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let handle = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = vec![0u8; 16 * 1024];
        let n = socket.read(&mut buf).await.unwrap();
        socket.write_all(reply).await.unwrap();
        String::from_utf8_lossy(&buf[..n]).into_owned()
    });
    (url, handle)
}

fn request(method: &str, url: String, body: RequestBody) -> HttpRequest {
    HttpRequest {
        method: method.into(),
        url,
        headers: vec![("X-Test".into(), "yes".into())],
        body,
        timeout_ms: Some(5_000),
    }
}

#[tokio::test]
async fn sends_method_headers_and_body_and_reads_response() {
    let (url, server) = one_shot_server(
        b"HTTP/1.1 201 Created\r\nContent-Type: application/json\r\nContent-Length: 11\r\n\r\n{\"ok\":true}",
    )
    .await;
    let client = Client::new();
    let body = RequestBody::Text {
        content: "hello".into(),
    };
    let response = send_plain(&client, request("post", format!("{url}/items"), body))
        .await
        .unwrap();
    let raw = server.await.unwrap();

    assert!(raw.starts_with("POST /items HTTP/1.1"));
    assert!(raw.to_lowercase().contains("x-test: yes"));
    assert!(raw.ends_with("hello"));
    assert_eq!(response.status, 201);
    assert_eq!(response.status_text, "Created");
    assert_eq!(response.body, "{\"ok\":true}");
    assert_eq!(response.size_bytes, 11);
    assert!(!response.is_binary);
    assert!(
        response
            .headers
            .contains(&("content-type".into(), "application/json".into()))
    );
}

#[tokio::test]
async fn sends_multipart_fields() {
    let (url, server) = one_shot_server(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n").await;
    let body = RequestBody::Multipart {
        fields: vec![("name".into(), "Ada".into())],
    };
    send_plain(&Client::new(), request("POST", url, body))
        .await
        .unwrap();
    let raw = server.await.unwrap();
    assert!(raw.contains("multipart/form-data; boundary="));
    assert!(raw.contains("name=\"name\""));
    assert!(raw.contains("Ada"));
}

#[tokio::test]
async fn flags_binary_bodies() {
    let (url, _server) =
        one_shot_server(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n\xff\xfe").await;
    let response = send_plain(&Client::new(), request("GET", url, RequestBody::None))
        .await
        .unwrap();
    assert!(response.is_binary);
    assert_eq!(response.size_bytes, 2);
}

#[tokio::test]
async fn rejects_invalid_method_and_url() {
    let client = Client::new();
    let bad_method = send_plain(
        &client,
        request("NOT A METHOD", "http://x".into(), RequestBody::None),
    );
    assert!(
        bad_method
            .await
            .unwrap_err()
            .contains("Invalid HTTP method")
    );
    let bad_url = send_plain(
        &client,
        request("GET", "not a url".into(), RequestBody::None),
    );
    assert!(bad_url.await.unwrap_err().contains("Invalid URL"));
}

#[tokio::test]
async fn reports_connection_failures() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let error = send_plain(&Client::new(), request("GET", url, RequestBody::None))
        .await
        .unwrap_err();
    assert!(error.contains("Could not connect"), "{error}");
}

const STREAM_HEAD: &[u8] =
    b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n";

/// Replies with a chunked body, one piece every `gap`, then waits `hold` before ending.
async fn streaming_server(pieces: Vec<&'static str>, gap: Duration, hold: Duration) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = vec![0u8; 16 * 1024];
        let _ = socket.read(&mut buf).await;
        socket.write_all(STREAM_HEAD).await.unwrap();
        for piece in pieces {
            let chunk = format!("{:x}\r\n{piece}\r\n", piece.len());
            if socket.write_all(chunk.as_bytes()).await.is_err() {
                return;
            }
            socket.flush().await.unwrap();
            tokio::time::sleep(gap).await;
        }
        tokio::time::sleep(hold).await;
        let _ = socket.write_all(b"0\r\n\r\n").await;
    });
    url
}

#[tokio::test]
async fn streams_the_head_then_each_piece_then_the_end() {
    let pieces = vec!["data: one\n\n", "data: two\n\n", "data: three\n\n"];
    let url = streaming_server(pieces, Duration::from_millis(60), Duration::ZERO).await;
    let mut events = Vec::new();
    let response = send(
        &Client::new(),
        request("GET", url, RequestBody::None),
        pending(),
        |e| events.push(e),
    )
    .await
    .unwrap();

    assert!(matches!(
        events.first(),
        Some(StreamEvent::Head { status: 200, .. })
    ));
    let texts: Vec<_> = events
        .iter()
        .filter_map(|e| match e {
            StreamEvent::Chunk { text, .. } => Some(text.as_str()),
            _ => None,
        })
        .collect();
    assert!(
        texts.len() >= 2,
        "pieces should arrive separately: {texts:?}"
    );
    assert_eq!(texts.concat(), "data: one\n\ndata: two\n\ndata: three\n\n");
    assert_eq!(
        events.last(),
        Some(&StreamEvent::End {
            size_bytes: 35,
            time_ms: response.time_ms,
            is_binary: false,
            incomplete: None
        })
    );
    assert_eq!(response.body, texts.concat());
    assert_eq!(response.incomplete, None);
}

#[tokio::test]
async fn a_steady_stream_may_outlast_the_timeout() {
    let pieces = vec!["a", "b", "c", "d", "e"];
    let url = streaming_server(pieces, Duration::from_millis(80), Duration::ZERO).await;
    let slow = HttpRequest {
        timeout_ms: Some(200),
        ..request("GET", url, RequestBody::None)
    };
    let response = send_plain(&Client::new(), slow).await.unwrap();
    assert_eq!(response.body, "abcde");
    assert_eq!(response.incomplete, None);
}

#[tokio::test]
async fn stops_reading_when_the_server_goes_quiet() {
    let url = streaming_server(
        vec!["data: one\n\n"],
        Duration::ZERO,
        Duration::from_secs(5),
    )
    .await;
    let quick = HttpRequest {
        timeout_ms: Some(150),
        ..request("GET", url, RequestBody::None)
    };
    let response = send_plain(&Client::new(), quick).await.unwrap();
    assert_eq!(response.body, "data: one\n\n");
    assert!(
        response
            .incomplete
            .unwrap()
            .contains("Nothing arrived for 0.15 s")
    );
}

#[tokio::test]
async fn cancelling_mid_stream_keeps_what_arrived() {
    let url = streaming_server(vec!["partial"], Duration::ZERO, Duration::from_secs(5)).await;
    let cancel = tokio::time::sleep(Duration::from_millis(150));
    let response = send(
        &Client::new(),
        request("GET", url, RequestBody::None),
        cancel,
        |_| {},
    )
    .await
    .unwrap();
    assert_eq!(response.body, "partial");
    assert_eq!(response.incomplete.as_deref(), Some(STOPPED));
}

#[tokio::test]
async fn cancelling_before_the_reply_fails_the_request() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let _hold = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        tokio::time::sleep(Duration::from_secs(5)).await;
        drop(socket);
    });
    let cancel = tokio::time::sleep(Duration::from_millis(100));
    let error = send(
        &Client::new(),
        request("GET", url, RequestBody::None),
        cancel,
        |_| {},
    )
    .await
    .unwrap_err();
    assert_eq!(error, CANCELLED);
}

use super::*;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

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
    let body = RequestBody::Text { content: "hello".into() };
    let response = send(&client, request("post", format!("{url}/items"), body)).await.unwrap();
    let raw = server.await.unwrap();

    assert!(raw.starts_with("POST /items HTTP/1.1"));
    assert!(raw.to_lowercase().contains("x-test: yes"));
    assert!(raw.ends_with("hello"));
    assert_eq!(response.status, 201);
    assert_eq!(response.status_text, "Created");
    assert_eq!(response.body, "{\"ok\":true}");
    assert_eq!(response.size_bytes, 11);
    assert!(!response.is_binary);
    assert!(response.headers.contains(&("content-type".into(), "application/json".into())));
}

#[tokio::test]
async fn sends_multipart_fields() {
    let (url, server) = one_shot_server(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n").await;
    let body = RequestBody::Multipart { fields: vec![("name".into(), "Ada".into())] };
    send(&Client::new(), request("POST", url, body)).await.unwrap();
    let raw = server.await.unwrap();
    assert!(raw.contains("multipart/form-data; boundary="));
    assert!(raw.contains("name=\"name\""));
    assert!(raw.contains("Ada"));
}

#[tokio::test]
async fn flags_binary_bodies() {
    let (url, _server) =
        one_shot_server(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n\xff\xfe").await;
    let response = send(&Client::new(), request("GET", url, RequestBody::None)).await.unwrap();
    assert!(response.is_binary);
    assert_eq!(response.size_bytes, 2);
}

#[tokio::test]
async fn rejects_invalid_method_and_url() {
    let client = Client::new();
    let bad_method = send(&client, request("NOT A METHOD", "http://x".into(), RequestBody::None));
    assert!(bad_method.await.unwrap_err().contains("Invalid HTTP method"));
    let bad_url = send(&client, request("GET", "not a url".into(), RequestBody::None));
    assert!(bad_url.await.unwrap_err().contains("Invalid URL"));
}

#[tokio::test]
async fn reports_connection_failures() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let error = send(&Client::new(), request("GET", url, RequestBody::None)).await.unwrap_err();
    assert!(error.contains("Could not connect"), "{error}");
}

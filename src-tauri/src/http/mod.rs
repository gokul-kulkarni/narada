mod types;

pub use types::{HttpRequest, HttpResponse, RequestBody};

use reqwest::{multipart, Client, Method};
use std::time::{Duration, Instant};

const DEFAULT_TIMEOUT_MS: u64 = 30_000;

/// Shared client so cookies persist between requests, like Postman's cookie jar.
pub struct HttpState {
    client: Client,
}

impl HttpState {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .cookie_store(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
        Ok(Self { client })
    }
}

pub async fn send(client: &Client, request: HttpRequest) -> Result<HttpResponse, String> {
    let method = Method::from_bytes(request.method.trim().to_uppercase().as_bytes())
        .map_err(|_| format!("Invalid HTTP method: {}", request.method))?;
    let url = reqwest::Url::parse(request.url.trim())
        .map_err(|e| format!("Invalid URL \"{}\": {e}", request.url))?;

    let mut builder = client
        .request(method, url)
        .timeout(Duration::from_millis(request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS)));
    for (name, value) in &request.headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    builder = match request.body {
        RequestBody::None => builder,
        RequestBody::Text { content } => builder.body(content),
        RequestBody::Multipart { fields } => {
            let form = fields
                .into_iter()
                .fold(multipart::Form::new(), |form, (k, v)| form.text(k, v));
            builder.multipart(form)
        }
    };

    let started = Instant::now();
    let response = builder.send().await.map_err(describe_error)?;
    let status = response.status();
    let headers = response
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), String::from_utf8_lossy(v.as_bytes()).into_owned()))
        .collect();
    let bytes = response.bytes().await.map_err(describe_error)?;
    let time_ms = started.elapsed().as_millis();
    let decoded = std::str::from_utf8(&bytes);

    Ok(HttpResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or("").to_string(),
        headers,
        is_binary: decoded.is_err(),
        body: decoded.map(str::to_owned).unwrap_or_else(|_| String::from_utf8_lossy(&bytes).into_owned()),
        size_bytes: bytes.len(),
        time_ms,
    })
}

fn describe_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "Request timed out".to_string()
    } else if error.is_connect() {
        format!("Could not connect: {error}")
    } else {
        format!("Request failed: {error}")
    }
}

#[tauri::command]
pub async fn send_request(
    state: tauri::State<'_, HttpState>,
    request: HttpRequest,
) -> Result<HttpResponse, String> {
    send(&state.client, request).await
}

#[cfg(test)]
mod tests;

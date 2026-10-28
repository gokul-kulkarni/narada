mod types;
mod utf8;

pub use types::{HttpRequest, HttpResponse, RequestBody, StreamEvent};

use reqwest::{Client, Method, RequestBuilder, Response, multipart};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::ipc::Channel;
use tokio::sync::oneshot;
use tokio::time::timeout;
use utf8::Utf8Stream;

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
/// Bodies larger than this are cut off; the UI keeps the whole body in memory.
pub const MAX_BODY_BYTES: usize = 20 * 1024 * 1024;
const STOPPED: &str = "Stopped before the response finished.";
const CANCELLED: &str = "Request cancelled";
const LIMIT: &str = "Stopped at 20 MB; the rest of the response was not read.";

fn idle_message(limit: Duration) -> String {
    format!(
        "Nothing arrived for {} s, so the rest of the response was not read.",
        limit.as_secs_f64()
    )
}

/// Shared client so cookies persist between requests, like Postman's cookie jar, plus a
/// way to stop each request in flight.
pub struct HttpState {
    client: Client,
    in_flight: Mutex<HashMap<String, oneshot::Sender<()>>>,
}

impl HttpState {
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .cookie_store(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
        Ok(Self {
            client,
            in_flight: Mutex::new(HashMap::new()),
        })
    }

    fn in_flight(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<String, oneshot::Sender<()>>>, String> {
        self.in_flight
            .lock()
            .map_err(|_| "Request registry is unavailable".to_string())
    }
}

fn build(client: &Client, request: HttpRequest) -> Result<RequestBuilder, String> {
    let method = Method::from_bytes(request.method.trim().to_uppercase().as_bytes())
        .map_err(|_| format!("Invalid HTTP method: {}", request.method))?;
    let url = reqwest::Url::parse(request.url.trim())
        .map_err(|e| format!("Invalid URL \"{}\": {e}", request.url))?;
    let builder = request
        .headers
        .iter()
        .fold(client.request(method, url), |b, (name, value)| {
            b.header(name.as_str(), value.as_str())
        });
    Ok(match request.body {
        RequestBody::None => builder,
        RequestBody::Text { content } => builder.body(content),
        RequestBody::Multipart { fields } => {
            let form = fields
                .into_iter()
                .fold(multipart::Form::new(), |form, (k, v)| form.text(k, v));
            builder.multipart(form)
        }
    })
}

struct Body {
    text: String,
    size: usize,
    is_binary: bool,
    incomplete: Option<String>,
}

/// Reads the body piece by piece, reporting each one. `limit` is the longest the server
/// may stay silent, so a long but steady stream is never cut off.
async fn read_body<F: Future<Output = ()>>(
    mut response: Response,
    limit: Duration,
    mut cancel: Pin<&mut F>,
    started: Instant,
    emit: &mut impl FnMut(StreamEvent),
) -> Body {
    let mut decoder = Utf8Stream::default();
    let mut text = String::new();
    let mut size = 0;
    let mut piece = |piece: String, bytes: usize, text: &mut String| {
        text.push_str(&piece);
        emit(StreamEvent::Chunk {
            text: piece,
            bytes,
            at_ms: started.elapsed().as_millis(),
        });
    };
    let incomplete = loop {
        let next = tokio::select! {
            _ = &mut cancel => break Some(STOPPED.to_string()),
            next = timeout(limit, response.chunk()) => next,
        };
        match next {
            Err(_) => break Some(idle_message(limit)),
            Ok(Err(e)) => break Some(format!("Stream interrupted: {}", describe_error(e))),
            Ok(Ok(None)) => break None,
            Ok(Ok(Some(bytes))) => {
                let kept = &bytes[..bytes.len().min(MAX_BODY_BYTES - size)];
                size += kept.len();
                piece(decoder.push(kept), kept.len(), &mut text);
                if kept.len() < bytes.len() {
                    break Some(LIMIT.to_string());
                }
            }
        }
    };
    let tail = decoder.finish();
    if !tail.is_empty() {
        piece(tail, 0, &mut text);
    }
    Body {
        text,
        size,
        is_binary: decoder.is_binary(),
        incomplete,
    }
}

/// Sends `request`, reporting the status line, each body piece and the end through `emit`.
/// `cancel` completing stops the request; a body already streaming then ends as incomplete.
pub async fn send(
    client: &Client,
    request: HttpRequest,
    cancel: impl Future<Output = ()>,
    mut emit: impl FnMut(StreamEvent),
) -> Result<HttpResponse, String> {
    let limit = Duration::from_millis(request.timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
    let builder = build(client, request)?;
    tokio::pin!(cancel);

    let started = Instant::now();
    let response = tokio::select! {
        _ = &mut cancel => return Err(CANCELLED.to_string()),
        sent = timeout(limit, builder.send()) => sent
            .map_err(|_| "Request timed out".to_string())?
            .map_err(describe_error)?,
    };
    let status = response.status();
    let status_text = status.canonical_reason().unwrap_or("").to_string();
    let headers: Vec<_> = response
        .headers()
        .iter()
        .map(|(k, v)| {
            (
                k.to_string(),
                String::from_utf8_lossy(v.as_bytes()).into_owned(),
            )
        })
        .collect();
    emit(StreamEvent::Head {
        status: status.as_u16(),
        status_text: status_text.clone(),
        headers: headers.clone(),
    });

    let body = read_body(response, limit, cancel.as_mut(), started, &mut emit).await;
    let time_ms = started.elapsed().as_millis();
    emit(StreamEvent::End {
        size_bytes: body.size,
        time_ms,
        is_binary: body.is_binary,
        incomplete: body.incomplete.clone(),
    });
    Ok(HttpResponse {
        status: status.as_u16(),
        status_text,
        headers,
        body: body.text,
        is_binary: body.is_binary,
        size_bytes: body.size,
        time_ms,
        incomplete: body.incomplete,
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

/// Streams the response to the UI through `channel`; `cancel_request(id)` stops it.
#[tauri::command]
pub async fn send_request(
    state: tauri::State<'_, HttpState>,
    request: HttpRequest,
    id: String,
    channel: Channel<StreamEvent>,
) -> Result<(), String> {
    let (stop, stopped) = oneshot::channel();
    state.in_flight()?.insert(id.clone(), stop);
    // Only an explicit cancel stops the request, not the sender being dropped.
    let cancel = async move {
        if stopped.await.is_err() {
            std::future::pending::<()>().await;
        }
    };
    let result = send(&state.client, request, cancel, |event| {
        let _ = channel.send(event);
    })
    .await;
    state.in_flight()?.remove(&id);
    result.map(|_| ())
}

#[tauri::command]
pub fn cancel_request(state: tauri::State<'_, HttpState>, id: String) -> Result<(), String> {
    if let Some(stop) = state.in_flight()?.remove(&id) {
        let _ = stop.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests;

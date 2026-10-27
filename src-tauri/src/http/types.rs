use serde::{Deserialize, Serialize};

pub type HeaderPair = (String, String);

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RequestBody {
    None,
    /// Raw text, including pre-encoded `x-www-form-urlencoded` bodies.
    Text { content: String },
    /// `multipart/form-data` with text fields.
    Multipart { fields: Vec<HeaderPair> },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: Vec<HeaderPair>,
    pub body: RequestBody,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: Vec<HeaderPair>,
    /// Body decoded as UTF-8 (lossy); see `is_binary`.
    pub body: String,
    pub is_binary: bool,
    pub size_bytes: usize,
    pub time_ms: u128,
}

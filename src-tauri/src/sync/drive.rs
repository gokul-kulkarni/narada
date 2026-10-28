//! Minimal Google Drive v3 client for the files this app owns.

use serde::Deserialize;
use std::future::Future;

const API: &str = "https://www.googleapis.com/drive/v3";
const UPLOAD: &str = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME: &str = "application/vnd.google-apps.folder";

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub md5_checksum: Option<String>,
    #[serde(default)]
    pub modified_time: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileList {
    files: Vec<DriveFile>,
    next_page_token: Option<String>,
}

/// Operations the sync engine needs; implemented by Drive and by an in-memory fake in tests.
pub trait Remote {
    fn find_or_create_folder(&self, name: &str, parent: Option<&str>) -> impl Future<Output = Result<String, String>>;
    fn list(&self, folder_id: &str) -> impl Future<Output = Result<Vec<DriveFile>, String>>;
    fn download(&self, file_id: &str) -> impl Future<Output = Result<Vec<u8>, String>>;
    fn create(&self, folder_id: &str, name: &str, content: &[u8]) -> impl Future<Output = Result<DriveFile, String>>;
    fn update(&self, file_id: &str, content: &[u8]) -> impl Future<Output = Result<DriveFile, String>>;
    fn trash(&self, file_id: &str) -> impl Future<Output = Result<(), String>>;
}

pub struct DriveClient<'a> {
    pub http: &'a reqwest::Client,
    pub token: String,
}

/// Drive query strings quote values with single quotes.
fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}

pub fn multipart_body(boundary: &str, metadata: &serde_json::Value, content: &[u8]) -> Vec<u8> {
    let mut body = format!(
        "--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{metadata}\r\n--{boundary}\r\nContent-Type: application/json\r\n\r\n"
    )
    .into_bytes();
    body.extend_from_slice(content);
    body.extend_from_slice(format!("\r\n--{boundary}--").as_bytes());
    body
}

impl DriveClient<'_> {
    async fn check(response: reqwest::Response) -> Result<reqwest::Response, String> {
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }
        let text = response.text().await.unwrap_or_default();
        Err(match status.as_u16() {
            401 => "Google Drive session expired; sign in again".to_string(),
            403 => format!("Google Drive refused access: {text}"),
            _ => format!("Google Drive error {status}: {text}"),
        })
    }

    async fn json<T: serde::de::DeserializeOwned>(request: reqwest::RequestBuilder) -> Result<T, String> {
        let response = Self::check(request.send().await.map_err(|e| format!("Drive request failed: {e}"))?).await?;
        response.json().await.map_err(|e| format!("Unexpected Drive response: {e}"))
    }

    async fn query(&self, q: String) -> Result<Vec<DriveFile>, String> {
        let mut files = Vec::new();
        let mut page_token: Option<String> = None;
        loop {
            let mut request = self.http.get(format!("{API}/files")).bearer_auth(&self.token).query(&[
                ("q", q.as_str()),
                ("fields", "nextPageToken,files(id,name,md5Checksum,modifiedTime)"),
                ("pageSize", "1000"),
                ("orderBy", "modifiedTime desc"),
            ]);
            if let Some(token) = &page_token {
                request = request.query(&[("pageToken", token)]);
            }
            let page: FileList = Self::json(request).await?;
            files.extend(page.files);
            match page.next_page_token {
                Some(token) => page_token = Some(token),
                None => return Ok(files),
            }
        }
    }

    async fn upload(&self, request: reqwest::RequestBuilder, metadata: serde_json::Value, content: &[u8]) -> Result<DriveFile, String> {
        let boundary = format!("narada-{}", super::oauth::random_token());
        let request = request
            .bearer_auth(&self.token)
            .query(&[("uploadType", "multipart"), ("fields", "id,name,md5Checksum,modifiedTime")])
            .header("Content-Type", format!("multipart/related; boundary={boundary}"))
            .body(multipart_body(&boundary, &metadata, content));
        Self::json(request).await
    }
}

impl Remote for DriveClient<'_> {
    async fn find_or_create_folder(&self, name: &str, parent: Option<&str>) -> Result<String, String> {
        let parent = parent.unwrap_or("root");
        let q = format!("name = {} and mimeType = '{FOLDER_MIME}' and {} in parents and trashed = false", quote(name), quote(parent));
        if let Some(folder) = self.query(q).await?.into_iter().next() {
            return Ok(folder.id);
        }
        let metadata = serde_json::json!({ "name": name, "mimeType": FOLDER_MIME, "parents": [parent] });
        let created: DriveFile = Self::json(self.http.post(format!("{API}/files")).bearer_auth(&self.token).json(&metadata)).await?;
        Ok(created.id)
    }

    async fn list(&self, folder_id: &str) -> Result<Vec<DriveFile>, String> {
        self.query(format!("{} in parents and trashed = false and mimeType != '{FOLDER_MIME}'", quote(folder_id))).await
    }

    async fn download(&self, file_id: &str) -> Result<Vec<u8>, String> {
        let request = self.http.get(format!("{API}/files/{file_id}")).bearer_auth(&self.token).query(&[("alt", "media")]);
        let response = Self::check(request.send().await.map_err(|e| format!("Drive download failed: {e}"))?).await?;
        Ok(response.bytes().await.map_err(|e| e.to_string())?.to_vec())
    }

    async fn create(&self, folder_id: &str, name: &str, content: &[u8]) -> Result<DriveFile, String> {
        let metadata = serde_json::json!({ "name": name, "parents": [folder_id], "mimeType": "application/json" });
        self.upload(self.http.post(format!("{UPLOAD}/files")), metadata, content).await
    }

    async fn update(&self, file_id: &str, content: &[u8]) -> Result<DriveFile, String> {
        self.upload(self.http.patch(format!("{UPLOAD}/files/{file_id}")), serde_json::json!({}), content).await
    }

    async fn trash(&self, file_id: &str) -> Result<(), String> {
        let request = self.http.patch(format!("{API}/files/{file_id}")).bearer_auth(&self.token).json(&serde_json::json!({ "trashed": true }));
        Self::check(request.send().await.map_err(|e| format!("Drive request failed: {e}"))?).await.map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_query_values() {
        assert_eq!(quote("it's"), "'it\\'s'");
    }

    #[test]
    fn builds_multipart_related_bodies() {
        let body = multipart_body("b", &serde_json::json!({ "name": "x.json" }), b"{}");
        let text = String::from_utf8(body).unwrap();
        assert!(text.starts_with("--b\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{\"name\":\"x.json\"}\r\n--b\r\n"));
        assert!(text.ends_with("\r\n\r\n{}\r\n--b--"));
    }
}

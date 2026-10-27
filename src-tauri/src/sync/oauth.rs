//! Google OAuth for installed apps: PKCE + loopback redirect (RFC 8252).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
/// Only files this app creates — a non-sensitive scope that needs no Google security review.
pub const SCOPE: &str = "https://www.googleapis.com/auth/drive.file";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone)]
pub struct ClientConfig {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Debug, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub expires_in: Option<u64>,
    pub refresh_token: Option<String>,
}

pub fn random_token() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>())
}

pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn authorization_url(config: &ClientConfig, redirect_uri: &str, challenge: &str, state: &str) -> String {
    let mut url = reqwest::Url::parse(AUTH_URL).expect("valid auth url");
    url.query_pairs_mut()
        .append_pair("client_id", &config.client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent")
        .append_pair("state", state);
    url.to_string()
}

/// Extracts the authorization code from the browser's `GET /?code=…&state=…` request.
pub fn parse_callback(request: &str, expected_state: &str) -> Result<String, String> {
    let target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or("Malformed sign-in callback")?;
    let url = reqwest::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|e| e.to_string())?;
    let param = |name: &str| url.query_pairs().find(|(k, _)| k == name).map(|(_, v)| v.into_owned());
    if let Some(error) = param("error") {
        return Err(format!("Google sign-in was not completed: {error}"));
    }
    if param("state").as_deref() != Some(expected_state) {
        return Err("Sign-in response did not match this request (state mismatch)".into());
    }
    param("code").ok_or_else(|| "Sign-in response had no authorization code".into())
}

const DONE_PAGE: &str = "<html><body style=\"font-family:sans-serif;text-align:center;padding-top:4em\">\
<h2>Free Postman is connected to Google Drive</h2><p>You can close this tab.</p></body></html>";

/// Runs the browser sign-in and returns tokens. `open_browser` opens the consent page.
pub async fn sign_in(
    http: &reqwest::Client,
    config: &ClientConfig,
    open_browser: impl FnOnce(&str) -> Result<(), String>,
) -> Result<TokenResponse, String> {
    let listener = TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{}", listener.local_addr().map_err(|e| e.to_string())?.port());
    let verifier = random_token();
    let state = random_token();
    open_browser(&authorization_url(config, &redirect_uri, &pkce_challenge(&verifier), &state))?;

    let code = tokio::time::timeout(SIGN_IN_TIMEOUT, async {
        let (mut socket, _) = listener.accept().await.map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; 8192];
        let n = socket.read(&mut buf).await.map_err(|e| e.to_string())?;
        let result = parse_callback(&String::from_utf8_lossy(&buf[..n]), &state);
        let body = match &result {
            Ok(_) => DONE_PAGE.to_string(),
            Err(e) => format!("<html><body><h2>Sign-in failed</h2><p>{}</p></body></html>", html_escape(e)),
        };
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let _ = socket.write_all(response.as_bytes()).await;
        result
    })
    .await
    .map_err(|_| "Timed out waiting for Google sign-in".to_string())??;

    exchange(http, &[
        ("code", code.as_str()),
        ("client_id", &config.client_id),
        ("client_secret", &config.client_secret),
        ("redirect_uri", &redirect_uri),
        ("grant_type", "authorization_code"),
        ("code_verifier", &verifier),
    ])
    .await
}

pub async fn refresh(http: &reqwest::Client, config: &ClientConfig, refresh_token: &str) -> Result<TokenResponse, String> {
    exchange(http, &[
        ("client_id", config.client_id.as_str()),
        ("client_secret", &config.client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ])
    .await
}

async fn exchange(http: &reqwest::Client, form: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let response = http.post(TOKEN_URL).form(form).send().await.map_err(|e| format!("Token request failed: {e}"))?;
    let status = response.status();
    let text = response.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Google rejected the token request ({status}): {text}"));
    }
    serde_json::from_str(&text).map_err(|e| format!("Unexpected token response: {e}"))
}

fn html_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_matches_rfc_7636_example() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn builds_the_consent_url() {
        let config = ClientConfig { client_id: "id".into(), client_secret: "s".into() };
        let url = authorization_url(&config, "http://127.0.0.1:5000", "ch", "st");
        assert!(url.starts_with(AUTH_URL));
        for part in ["client_id=id", "code_challenge=ch", "state=st", "access_type=offline", "drive.file"] {
            assert!(url.contains(part), "{url} missing {part}");
        }
    }

    #[test]
    fn parses_callbacks() {
        assert_eq!(parse_callback("GET /?state=s&code=abc HTTP/1.1\r\n", "s").unwrap(), "abc");
        assert!(parse_callback("GET /?state=x&code=abc HTTP/1.1", "s").unwrap_err().contains("state"));
        assert!(parse_callback("GET /?error=access_denied HTTP/1.1", "s").unwrap_err().contains("access_denied"));
        assert!(parse_callback("GET /?state=s HTTP/1.1", "s").unwrap_err().contains("no authorization code"));
        assert!(parse_callback("", "s").is_err());
    }

    #[test]
    fn random_tokens_are_unique_and_url_safe() {
        let (a, b) = (random_token(), random_token());
        assert_ne!(a, b);
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }
}

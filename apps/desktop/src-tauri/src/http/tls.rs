//! HTTPS certificate settings: trust extra certificate authorities (a company proxy's root, a dev
//! server's self-signed certificate) or turn certificate checks off.

use reqwest::{Certificate, Client, cookie::Jar};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::State;

use super::HttpState;
use crate::storage::{Settings, StorageState};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct TlsConfig {
    pub accept_invalid_certs: bool,
    pub ca_certificates_file: Option<PathBuf>,
}

impl From<&Settings> for TlsConfig {
    fn from(settings: &Settings) -> Self {
        Self {
            accept_invalid_certs: settings.accept_invalid_certs,
            ca_certificates_file: settings.ca_certificates_file.clone(),
        }
    }
}

pub const CERTIFICATE_HINT: &str = "The server's certificate isn't trusted: self-signed, \
     re-signed by a company proxy, expired, or for another host name. In Settings → HTTPS \
     certificates, add the authority that signed it as an extra CA, or turn off certificate \
     checks for servers you trust.";

/// Reads a PEM file of one or more certificates.
pub fn load_certificates(path: &Path) -> Result<Vec<Certificate>, String> {
    let pem = std::fs::read(path).map_err(|e| {
        format!(
            "Could not read the CA certificates file {}: {e}",
            path.display()
        )
    })?;
    let certificates = Certificate::from_pem_bundle(&pem)
        .map_err(|e| format!("{} is not a PEM certificate file: {e}", path.display()))?;
    if certificates.is_empty() {
        return Err(format!(
            "{} has no certificates; expected PEM text starting with -----BEGIN CERTIFICATE-----.",
            path.display()
        ));
    }
    Ok(certificates)
}

/// A client with these TLS settings, sharing `jar` so cookies survive a settings change.
pub fn build_client(jar: Arc<Jar>, tls: &TlsConfig) -> Result<Client, String> {
    let mut builder = Client::builder()
        .cookie_provider(jar)
        .tls_danger_accept_invalid_certs(tls.accept_invalid_certs);
    if let Some(path) = &tls.ca_certificates_file {
        builder = builder.tls_certs_merge(load_certificates(path)?);
    }
    builder
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))
}

/// The innermost message about a certificate, if certificate checking is what failed.
pub fn certificate_problem(error: &(dyn std::error::Error + 'static)) -> Option<String> {
    let mut found = None;
    let mut current = Some(error);
    while let Some(e) = current {
        let text = e.to_string();
        let lower = text.to_lowercase();
        if lower.contains("certificate") || lower.contains("unknownissuer") {
            found = Some(text);
        }
        current = e.source();
    }
    found
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TlsSettingsView {
    pub accept_invalid_certs: bool,
    pub ca_certificates_file: Option<String>,
    /// Why the saved settings could not be applied at startup (e.g. the CA file is gone).
    pub problem: Option<String>,
}

fn view(settings: &Settings, problem: Option<String>) -> TlsSettingsView {
    TlsSettingsView {
        accept_invalid_certs: settings.accept_invalid_certs,
        ca_certificates_file: settings
            .ca_certificates_file
            .as_ref()
            .map(|p| p.display().to_string()),
        problem,
    }
}

#[tauri::command]
pub fn get_tls_settings(
    storage: State<'_, StorageState>,
    http: State<'_, HttpState>,
) -> TlsSettingsView {
    view(&storage.settings(), http.tls_problem())
}

/// Applies the settings first, so a CA file that can't be read is refused before it is saved.
#[tauri::command]
pub fn set_tls_settings(
    storage: State<'_, StorageState>,
    http: State<'_, HttpState>,
    accept_invalid_certs: bool,
    ca_certificates_file: Option<String>,
) -> Result<TlsSettingsView, String> {
    let ca_certificates_file = ca_certificates_file
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .map(PathBuf::from);
    let tls = TlsConfig {
        accept_invalid_certs,
        ca_certificates_file: ca_certificates_file.clone(),
    };
    http.configure(&tls)?;
    let saved = storage.update_settings(|s| Settings {
        accept_invalid_certs,
        ca_certificates_file,
        ..s
    })?;
    Ok(view(&saved, None))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{HttpRequest, RequestBody, send};
    use std::future::pending;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio_rustls::TlsAcceptor;
    use tokio_rustls::rustls::ServerConfig;
    use tokio_rustls::rustls::crypto::aws_lc_rs;
    use tokio_rustls::rustls::pki_types::{PrivateKeyDer, PrivatePkcs8KeyDer};

    /// A self-signed certificate for 127.0.0.1, as PEM, and a TLS acceptor serving it.
    fn self_signed() -> (String, TlsAcceptor) {
        let cert = rcgen::generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
        let key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(cert.signing_key.serialize_der()));
        let config = ServerConfig::builder_with_provider(Arc::new(aws_lc_rs::default_provider()))
            .with_safe_default_protocol_versions()
            .unwrap()
            .with_no_client_auth()
            .with_single_cert(vec![cert.cert.der().clone()], key)
            .unwrap();
        (cert.cert.pem(), TlsAcceptor::from(Arc::new(config)))
    }

    /// An HTTPS server that answers every connection with 200 and `{"secure":true}`.
    async fn https_server(acceptor: TlsAcceptor) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("https://{}/", listener.local_addr().unwrap());
        tokio::spawn(async move {
            while let Ok((socket, _)) = listener.accept().await {
                let acceptor = acceptor.clone();
                tokio::spawn(async move {
                    let Ok(mut tls) = acceptor.accept(socket).await else {
                        return;
                    };
                    let mut buf = vec![0u8; 4096];
                    let _ = tls.read(&mut buf).await;
                    let body = br#"{"secure":true}"#;
                    let head = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let _ = tls.write_all(head.as_bytes()).await;
                    let _ = tls.write_all(body).await;
                    let _ = tls.shutdown().await;
                });
            }
        });
        url
    }

    async fn get(client: &Client, url: &str) -> Result<String, String> {
        let request = HttpRequest {
            method: "GET".into(),
            url: url.into(),
            headers: vec![],
            body: RequestBody::None,
            timeout_ms: Some(5_000),
        };
        send(client, request, pending(), |_| {})
            .await
            .map(|r| r.body)
    }

    fn write_pem(dir: &tempfile::TempDir, pem: &str) -> PathBuf {
        let path = dir.path().join("ca.pem");
        std::fs::write(&path, pem).unwrap();
        path
    }

    #[tokio::test]
    async fn refuses_a_self_signed_server_by_default_and_says_what_to_change() {
        let (_, acceptor) = self_signed();
        let url = https_server(acceptor).await;
        let client = build_client(Arc::new(Jar::default()), &TlsConfig::default()).unwrap();
        let error = get(&client, &url).await.unwrap_err();
        assert!(error.contains("certificate"), "{error}");
        assert!(error.contains("Settings → HTTPS certificates"), "{error}");
    }

    #[tokio::test]
    async fn accepts_any_certificate_when_checks_are_off() {
        let (_, acceptor) = self_signed();
        let url = https_server(acceptor).await;
        let tls = TlsConfig {
            accept_invalid_certs: true,
            ca_certificates_file: None,
        };
        let client = build_client(Arc::new(Jar::default()), &tls).unwrap();
        assert_eq!(get(&client, &url).await.unwrap(), r#"{"secure":true}"#);
    }

    #[tokio::test]
    async fn trusts_an_extra_ca_and_still_checks_others() {
        let (pem, acceptor) = self_signed();
        let url = https_server(acceptor).await;
        let dir = tempfile::tempdir().unwrap();
        let tls = TlsConfig {
            accept_invalid_certs: false,
            ca_certificates_file: Some(write_pem(&dir, &pem)),
        };
        let client = build_client(Arc::new(Jar::default()), &tls).unwrap();
        assert_eq!(get(&client, &url).await.unwrap(), r#"{"secure":true}"#);

        // A different self-signed server is still refused.
        let (_, other) = self_signed();
        let other_url = https_server(other).await;
        assert!(get(&client, &other_url).await.is_err());
    }

    #[test]
    fn explains_unreadable_ca_files() {
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("nope.pem");
        assert!(
            load_certificates(&missing)
                .unwrap_err()
                .contains("Could not read the CA certificates file")
        );
        let not_pem = write_pem(&dir, "hello");
        assert!(
            load_certificates(&not_pem)
                .unwrap_err()
                .contains("no certificates")
        );
    }

    #[test]
    fn settings_view_shows_the_saved_values() {
        let settings = Settings {
            accept_invalid_certs: true,
            ca_certificates_file: Some("/certs/ca.pem".into()),
            ..Settings::default()
        };
        assert_eq!(
            view(&settings, Some("gone".into())),
            TlsSettingsView {
                accept_invalid_certs: true,
                ca_certificates_file: Some("/certs/ca.pem".into()),
                problem: Some("gone".into()),
            }
        );
    }
}

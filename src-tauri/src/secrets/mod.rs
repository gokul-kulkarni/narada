//! OS keychain access for values that must never be written to synced files.

use crate::storage::migrate::LEGACY_IDENTIFIER;

const SERVICE: &str = "com.narada.app";

fn entry_in(service: &str, key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(service, key).map_err(|e| format!("Keychain unavailable: {e}"))
}

fn entry(key: &str) -> Result<keyring::Entry, String> {
    entry_in(SERVICE, key)
}

fn read(entry: &keyring::Entry) -> Result<Option<String>, String> {
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read secret: {e}")),
    }
}

/// Reads a secret, moving it over from the pre-rename keychain service on first use.
pub fn get(key: &str) -> Result<Option<String>, String> {
    if let Some(value) = read(&entry(key)?)? {
        return Ok(Some(value));
    }
    let legacy = entry_in(LEGACY_IDENTIFIER, key)?;
    let Some(value) = read(&legacy)? else {
        return Ok(None);
    };
    set(key, &value)?;
    // The copy succeeded; failing to remove the old entry only leaves a stale duplicate.
    let _ = legacy.delete_credential();
    Ok(Some(value))
}

pub fn set(key: &str, value: &str) -> Result<(), String> {
    entry(key)?
        .set_password(value)
        .map_err(|e| format!("Could not store secret: {e}"))
}

pub fn delete(key: &str) -> Result<(), String> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not delete secret: {e}")),
    }
}

#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    get(&key)
}

#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    set(&key, &value)
}

#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    delete(&key)
}

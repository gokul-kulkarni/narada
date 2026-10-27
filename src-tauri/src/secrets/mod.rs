//! OS keychain access for values that must never be written to synced files.

const SERVICE: &str = "com.freepostman.app";

fn entry(key: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, key).map_err(|e| format!("Keychain unavailable: {e}"))
}

pub fn get(key: &str) -> Result<Option<String>, String> {
    match entry(key)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read secret: {e}")),
    }
}

pub fn set(key: &str, value: &str) -> Result<(), String> {
    entry(key)?.set_password(value).map_err(|e| format!("Could not store secret: {e}"))
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

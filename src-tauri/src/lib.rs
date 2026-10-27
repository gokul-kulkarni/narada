mod http;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_state = http::HttpState::new().expect("failed to initialise HTTP client");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(http_state)
        .invoke_handler(tauri::generate_handler![http::send_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

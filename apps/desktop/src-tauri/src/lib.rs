mod http;
mod mcp;
mod secrets;
mod storage;
mod sync;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_state = http::HttpState::new().expect("failed to initialise HTTP client");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(http_state)
        .manage(sync::DriveState::new())
        .manage(mcp::McpState::default())
        .setup(|app| {
            let storage = storage::StorageState::init(app.handle())?;
            app.manage(storage);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            http::send_request,
            http::cancel_request,
            mcp::mcp_connect,
            mcp::mcp_list,
            mcp::mcp_run,
            mcp::mcp_disconnect,
            storage::get_storage_dir,
            storage::set_storage_dir,
            storage::list_documents,
            storage::write_document,
            storage::delete_document,
            storage::read_local,
            storage::write_local,
            storage::export_file,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            sync::drive_status,
            sync::drive_configure,
            sync::drive_sign_in,
            sync::drive_sign_out,
            sync::drive_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

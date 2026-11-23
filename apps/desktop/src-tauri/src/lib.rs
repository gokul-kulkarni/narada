mod assist;
mod http;
mod mcp;
#[cfg(target_os = "macos")]
mod menu;
mod secrets;
mod shell_env;
mod storage;
mod sync;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http_state = http::HttpState::new().expect("failed to initialise HTTP client");
    let builder = tauri::Builder::default();
    #[cfg(target_os = "macos")]
    let builder = builder.menu(menu::build).on_menu_event(menu::on_event);
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(http_state)
        .manage(sync::DriveState::new())
        .manage(mcp::McpState::default())
        .manage(assist::AssistState::default())
        .setup(|app| {
            let storage = storage::StorageState::init(app.handle())?;
            let tls = http::tls::TlsConfig::from(&storage.settings());
            app.state::<http::HttpState>().configure_at_startup(&tls);
            app.manage(storage);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            http::send_request,
            http::cancel_request,
            http::tls::get_tls_settings,
            http::tls::set_tls_settings,
            mcp::mcp_connect,
            mcp::mcp_list,
            mcp::mcp_run,
            mcp::mcp_disconnect,
            assist::assist_detect,
            assist::assist_run,
            assist::assist_cancel,
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

use super::types::McpEvent;
use rmcp::ClientHandler;
#[allow(deprecated)]
use rmcp::model::{
    ClientCapabilities, ClientConfig, Implementation, LoggingMessageNotificationParam,
    ProgressNotificationParam, ResourceUpdatedNotificationParam,
};
use rmcp::service::{NotificationContext, RoleClient};
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;

pub type Sink = Arc<dyn Fn(McpEvent) + Send + Sync>;

/// Narada's side of an MCP session: introduces itself and forwards server notifications.
pub struct Notifier {
    sink: Sink,
}

impl Notifier {
    pub fn new(sink: Sink) -> Self {
        Self { sink }
    }

    fn forward(&self, method: &str, params: impl Serialize) {
        let params = serde_json::to_value(params).unwrap_or(Value::Null);
        (self.sink)(McpEvent::Notification {
            method: method.to_string(),
            params,
        });
    }
}

impl ClientHandler for Notifier {
    fn get_info(&self) -> ClientConfig {
        ClientConfig::new(
            ClientCapabilities::default(),
            Implementation::new("Narada", env!("CARGO_PKG_VERSION")),
        )
    }

    // Logging is deprecated in the spec (SEP-2577), but servers still send it.
    #[allow(deprecated)]
    async fn on_logging_message(
        &self,
        params: LoggingMessageNotificationParam,
        _context: NotificationContext<RoleClient>,
    ) {
        self.forward("notifications/message", params);
    }

    async fn on_progress(
        &self,
        params: ProgressNotificationParam,
        _context: NotificationContext<RoleClient>,
    ) {
        self.forward("notifications/progress", params);
    }

    async fn on_resource_updated(
        &self,
        params: ResourceUpdatedNotificationParam,
        _context: NotificationContext<RoleClient>,
    ) {
        self.forward("notifications/resources/updated", params);
    }

    async fn on_tool_list_changed(&self, _context: NotificationContext<RoleClient>) {
        self.forward("notifications/tools/list_changed", Value::Null);
    }

    async fn on_resource_list_changed(&self, _context: NotificationContext<RoleClient>) {
        self.forward("notifications/resources/list_changed", Value::Null);
    }

    async fn on_prompt_list_changed(&self, _context: NotificationContext<RoleClient>) {
        self.forward("notifications/prompts/list_changed", Value::Null);
    }
}

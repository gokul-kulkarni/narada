//! The MCP tools Narada offers to coding agents. Each is answered by the app (see bridge.rs),
//! which removes secrets from everything it returns.

use super::bridge::ToolBridge;
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerConfig};
use rmcp::{ErrorData, ServerHandler, schemars, tool, tool_handler, tool_router};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;

const INSTRUCTIONS: &str = "Narada is the user's API client (a free Postman alternative). \
Use these tools to see their saved requests, environments and recent deliveries while you work \
on the code behind an API. Secret values are replaced with [redacted] or [secret:name]; \
`{{name}}` is a Narada variable filled in when a request is sent.";

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct GetRequestArgs {
    /// The request's id, as listed by list_collections.
    pub request_id: String,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListHistoryArgs {
    /// How many recent deliveries to list, newest first (default 20, at most 200).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
}

#[derive(Clone)]
pub struct NaradaServer {
    bridge: Arc<dyn ToolBridge>,
    #[expect(dead_code, reason = "read by the #[tool_handler] macro")]
    tool_router: ToolRouter<Self>,
}

impl NaradaServer {
    pub fn new(bridge: Arc<dyn ToolBridge>) -> Self {
        Self {
            bridge,
            tool_router: Self::tool_router(),
        }
    }

    async fn forward(&self, tool: &str, arguments: Value) -> Result<CallToolResult, ErrorData> {
        Ok(match self.bridge.call(tool, arguments).await {
            Ok(value) => {
                let text = serde_json::to_string_pretty(&value)
                    .map_err(|e| ErrorData::internal_error(e.to_string(), None))?;
                CallToolResult::success(vec![ContentBlock::text(text)])
            }
            Err(message) => CallToolResult::error(vec![ContentBlock::text(message)]),
        })
    }
}

fn args(value: impl Serialize) -> Value {
    serde_json::to_value(value).unwrap_or_else(|_| json!({}))
}

#[tool_router]
impl NaradaServer {
    #[tool(
        description = "List the user's collections as a tree of folders and requests (id, name, method, URL)."
    )]
    async fn list_collections(&self) -> Result<CallToolResult, ErrorData> {
        self.forward("list_collections", json!({})).await
    }

    #[tool(
        description = "Get one saved request in full (method, URL, headers, body, auth type), with {{variables}} unresolved and secrets removed."
    )]
    async fn get_request(
        &self,
        Parameters(arguments): Parameters<GetRequestArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("get_request", args(arguments)).await
    }

    #[tool(
        description = "List the environments and which one is active, with variable names only (never values)."
    )]
    async fn list_environments(&self) -> Result<CallToolResult, ErrorData> {
        self.forward("list_environments", json!({})).await
    }

    #[tool(
        description = "Get the request open in Narada's active tab and its latest response or error, with test results. Secrets are removed."
    )]
    async fn get_last_delivery(&self) -> Result<CallToolResult, ErrorData> {
        self.forward("get_last_delivery", json!({})).await
    }

    #[tool(
        description = "List recent deliveries, newest first: method, URL, status, time and environment."
    )]
    async fn list_history(
        &self,
        Parameters(arguments): Parameters<ListHistoryArgs>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("list_history", args(arguments)).await
    }
}

#[tool_handler]
impl ServerHandler for NaradaServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("narada", env!("CARGO_PKG_VERSION")))
            .with_instructions(INSTRUCTIONS)
    }
}

//! The MCP tools and prompts Narada offers to coding agents. Each tool is answered by the app
//! (see bridge.rs), which removes secrets from what it returns and asks the user to approve
//! anything that adds to their workspace.

use super::bridge::ToolBridge;
use rmcp::handler::server::router::prompt::PromptRouter;
use rmcp::handler::server::router::tool::ToolRouter;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{
    CallToolResult, ContentBlock, Implementation, PromptMessage, Role, ServerCapabilities,
    ServerConfig,
};
use rmcp::service::RequestContext;
use rmcp::{
    ErrorData, RoleServer, ServerHandler, prompt, prompt_handler, prompt_router, schemars, tool,
    tool_handler, tool_router,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::sync::Arc;

const INSTRUCTIONS: &str = "Narada is the user's API client (a free Postman alternative). \
Use these tools to see their saved requests, environments and recent deliveries while you work \
on the code behind an API, to add requests for the routes you find, to fix a request, and to \
send one to check a change. Secret values are replaced with [redacted] or [secret:name]; \
`{{name}}` is a Narada variable filled in when a request is sent. Creating, changing and \
sending each wait for the user to approve in Narada, one at a time: make one such call, wait \
for its result, then make the next. Calls made together queue up, and you may stop waiting \
before the user reaches them. Creating only ever adds; existing requests change only through \
update_request.";

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

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
pub struct PairArg {
    pub key: String,
    pub value: String,
}

/// A request body.
#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(tag = "mode", rename_all = "lowercase")]
pub enum BodyArg {
    None,
    Raw {
        /// json (default), text, xml, html or javascript.
        #[serde(skip_serializing_if = "Option::is_none")]
        language: Option<String>,
        raw: String,
    },
    Urlencoded {
        fields: Vec<PairArg>,
    },
    Formdata {
        fields: Vec<PairArg>,
    },
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
pub struct NewRequestArg {
    /// A short name, e.g. "Create order". A taken name gets " (2)".
    pub name: String,
    /// GET (default), POST, PUT, PATCH, DELETE, HEAD or OPTIONS.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    /// Use the collection's variables, e.g. "{{baseUrl}}/orders/{{orderId}}".
    pub url: String,
    /// Never put real credentials here; use variables like "Bearer {{token}}".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<PairArg>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<BodyArg>,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
pub struct CreateRequestArgs {
    /// The collection's id or name; a new collection is made if none has this name.
    pub collection: String,
    /// Folder path inside the collection, e.g. "orders/admin"; missing folders are made.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    /// 1 to 50 requests to add.
    pub requests: Vec<NewRequestArg>,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
pub struct CreateFolderArgs {
    /// The collection's id or name; a new collection is made if none has this name.
    pub collection: String,
    /// Folder path, e.g. "orders/admin"; each missing level is made.
    pub folder: String,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
pub struct CreateCollectionArgs {
    /// A taken name gets " (2)".
    pub name: String,
    /// Collection variables such as baseUrl. Values that look secret are left empty.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variables: Option<Vec<PairArg>>,
}

/// Fields to change in a saved request; anything left out stays as it is.
#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct ChangesArg {
    /// GET, POST, PUT, PATCH, DELETE, HEAD or OPTIONS.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Headers to set by name (added if missing). Keep "[secret:name]" as you saw it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<PairArg>>,
    /// Header names to remove.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remove_headers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<BodyArg>,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRequestArgs {
    /// The saved request's id, as listed by list_collections.
    pub request_id: String,
    pub changes: ChangesArg,
}

#[derive(Deserialize, Serialize, schemars::JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestArgs {
    /// A saved request's id, as listed by list_collections. Give this or `request`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    /// A one-off request that is not saved. Give this or `requestId`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request: Option<NewRequestArg>,
}

#[derive(Deserialize, schemars::JsonSchema)]
pub struct FromCodeArgs {
    /// The collection to add the requests to; made if missing. Defaults to one named after the project.
    pub collection: Option<String>,
}

#[derive(Clone)]
pub struct NaradaServer {
    bridge: Arc<dyn ToolBridge>,
    #[allow(dead_code, reason = "read by the #[tool_handler] macro")]
    tool_router: ToolRouter<Self>,
    #[allow(dead_code, reason = "read by the #[prompt_handler] macro")]
    prompt_router: PromptRouter<Self>,
}

/// The name rmcp gives a client that never introduced itself (`Implementation::from_build_env`),
/// which is every client on stateless Streamable HTTP.
const RMCP_DEFAULT_NAME: &str = "rmcp";

/// Generic HTTP stacks, whose User-Agent says nothing about which agent is calling.
const GENERIC_AGENTS: &[&str] = &[
    "node",
    "undici",
    "python-httpx",
    "python-requests",
    "reqwest",
    "axios",
    "curl",
    "go-http-client",
];

/// "claude-code/2.1.330 (sdk-cli)" → "Claude Code"; another product name as it is; None if generic.
pub fn agent_from_user_agent(user_agent: &str) -> Option<String> {
    let product = user_agent.split(['/', ' ']).next()?.trim();
    let name = match product.to_ascii_lowercase().as_str() {
        "" => return None,
        generic if GENERIC_AGENTS.contains(&generic) => return None,
        "claude-code" => "Claude Code",
        "codex" | "codex_cli_rs" | "codex-cli" => "Codex",
        "cursor" => "Cursor",
        _ => product,
    };
    Some(name.to_owned())
}

/// Which agent is calling: the name it introduced itself with, else its HTTP User-Agent.
fn client_name(context: &RequestContext<RoleServer>) -> Option<String> {
    let introduced = context
        .peer
        .peer_info()
        .map(|info| info.client_info.name.clone())
        .filter(|name| !name.is_empty() && name != RMCP_DEFAULT_NAME);
    introduced.or_else(|| {
        let parts = context.extensions.get::<axum::http::request::Parts>()?;
        let user_agent = parts
            .headers
            .get(axum::http::header::USER_AGENT)?
            .to_str()
            .ok()?;
        agent_from_user_agent(user_agent)
    })
}

impl NaradaServer {
    pub fn new(bridge: Arc<dyn ToolBridge>) -> Self {
        Self {
            bridge,
            tool_router: Self::tool_router(),
            prompt_router: Self::prompt_router(),
        }
    }

    async fn forward(
        &self,
        tool: &str,
        arguments: Value,
        context: &RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        Ok(
            match self
                .bridge
                .call(tool, arguments, client_name(context), context.ct.clone())
                .await
            {
                Ok(value) => {
                    let text = serde_json::to_string_pretty(&value)
                        .map_err(|e| ErrorData::internal_error(e.to_string(), None))?;
                    CallToolResult::success(vec![ContentBlock::text(text)])
                }
                Err(message) => CallToolResult::error(vec![ContentBlock::text(message)]),
            },
        )
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
    async fn list_collections(
        &self,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("list_collections", json!({}), &context).await
    }

    #[tool(
        description = "Get one saved request in full (method, URL, headers, body, auth type), with {{variables}} unresolved and secrets removed."
    )]
    async fn get_request(
        &self,
        Parameters(arguments): Parameters<GetRequestArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("get_request", args(arguments), &context).await
    }

    #[tool(
        description = "List the environments and which one is active, with variable names only (never values)."
    )]
    async fn list_environments(
        &self,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("list_environments", json!({}), &context).await
    }

    #[tool(
        description = "Get the request open in Narada's active tab and its latest response or error, with test results. Secrets are removed."
    )]
    async fn get_last_delivery(
        &self,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("get_last_delivery", json!({}), &context).await
    }

    #[tool(
        description = "List recent deliveries, newest first: method, URL, status, time and environment."
    )]
    async fn list_history(
        &self,
        Parameters(arguments): Parameters<ListHistoryArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("list_history", args(arguments), &context)
            .await
    }

    #[tool(
        description = "Add 1 to 50 HTTP requests to a collection and folder (both made if missing). The user approves in Narada first; nothing existing changes. Use {{variables}} for hosts and credentials. Returns the new ids, any renames, variables to set (replacedSecrets, missingVariables)."
    )]
    async fn create_request(
        &self,
        Parameters(arguments): Parameters<CreateRequestArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("create_request", args(arguments), &context)
            .await
    }

    #[tool(
        description = "Add a folder path to a collection (made if missing). The user approves in Narada first."
    )]
    async fn create_folder(
        &self,
        Parameters(arguments): Parameters<CreateFolderArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("create_folder", args(arguments), &context)
            .await
    }

    #[tool(
        description = "Create an empty collection, optionally with variables such as baseUrl. The user approves in Narada first."
    )]
    async fn create_collection(
        &self,
        Parameters(arguments): Parameters<CreateCollectionArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("create_collection", args(arguments), &context)
            .await
    }

    #[tool(
        description = "Change a saved HTTP request's method, URL, headers or body (never auth). The user approves the exact diff in Narada first. Returns the new request (secrets removed)."
    )]
    async fn update_request(
        &self,
        Parameters(arguments): Parameters<UpdateRequestArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("update_request", args(arguments), &context)
            .await
    }

    #[tool(
        description = "Send a saved HTTP request, or a one-off one, with the active environment, scripts and auth, exactly as Narada would. The user approves first (it can change data on the server). Returns the response or error and test results, secrets removed."
    )]
    async fn send_request(
        &self,
        Parameters(arguments): Parameters<SendRequestArgs>,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResult, ErrorData> {
        self.forward("send_request", args(arguments), &context)
            .await
    }
}

#[prompt_router]
impl NaradaServer {
    #[prompt(
        name = "requests_from_code",
        description = "Add a Narada request for each HTTP route in this project."
    )]
    async fn requests_from_code(
        &self,
        Parameters(arguments): Parameters<FromCodeArgs>,
    ) -> Vec<PromptMessage> {
        let target = arguments.collection.map_or_else(
            || "a Narada collection named after this project".to_owned(),
            |name| format!("the Narada collection \"{name}\""),
        );
        let text = format!(
            "Find every HTTP route this project serves (method and path, with path parameters). \
             Then call list_collections to see what exists, and create_request to add one request \
             per route to {target}, grouped into folders by resource (for example \"orders\"). \
             Use {{{{baseUrl}}}} for the host, {{{{variables}}}} for path parameters, and a small \
             realistic JSON body for POST, PUT and PATCH. Never put real credentials in a \
             request: use variables like \"Bearer {{{{token}}}}\". Add at most 50 requests per \
             call. Afterwards, list any variables the user needs to set."
        );
        vec![PromptMessage::new_text(Role::User, text)]
    }
}

#[tool_handler(router = self.tool_router)]
#[prompt_handler(router = self.prompt_router)]
impl ServerHandler for NaradaServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_prompts()
                .build(),
        )
        .with_server_info(Implementation::new("narada", env!("CARGO_PKG_VERSION")))
        .with_instructions(INSTRUCTIONS)
    }
}

use axum::{
    response::Response,
    http::{StatusCode, header},
    Json,
};
use serde::Serialize;
use serde_json::json;

#[derive(Debug, Serialize)]
pub struct ApiResponse<T: Serialize> {
    pub ok: bool,
    #[serde(flatten)]
    pub data: T,
}

#[derive(Debug, Serialize)]
pub struct ApiError {
    pub ok: bool,
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

impl ApiError {
    pub fn new(error: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: error.into(),
            hint: None,
            id: None,
        }
    }

    pub fn with_hint(mut self, hint: impl Into<String>) -> Self {
        self.hint = Some(hint.into());
        self
    }

    pub fn with_id(mut self, id: impl Into<String>) -> Self {
        self.id = Some(id.into());
        self
    }
}

pub fn json_success<T: Serialize>(data: T) -> Json<serde_json::Value> {
    let mut value = serde_json::to_value(data).unwrap_or_default();
    if let Some(obj) = value.as_object_mut() {
        obj.insert("ok".to_string(), serde_json::Value::Bool(true));
    }
    Json(value)
}

pub fn json_error(message: impl Into<String>) -> Json<serde_json::Value> {
    Json(json!({
        "ok": false,
        "error": message.into()
    }))
}

pub fn json_error_with_id(message: impl Into<String>, id: impl Into<String>) -> Json<serde_json::Value> {
    Json(json!({
        "ok": false,
        "error": message.into(),
        "id": id.into()
    }))
}

pub fn http_response(status: StatusCode, body: serde_json::Value) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .body(body.to_string().into())
        .unwrap()
}

pub fn http_success(body: serde_json::Value) -> Response {
    http_response(StatusCode::OK, body)
}

pub fn http_error(status: StatusCode, message: impl Into<String>) -> Response {
    http_response(status, json!({
        "ok": false,
        "error": message.into()
    }))
}

pub fn http_bad_request(message: impl Into<String>) -> Response {
    http_error(StatusCode::BAD_REQUEST, message)
}

pub fn http_not_found(message: impl Into<String>) -> Response {
    http_error(StatusCode::NOT_FOUND, message)
}

pub fn http_internal_error(message: impl Into<String>) -> Response {
    http_error(StatusCode::INTERNAL_SERVER_ERROR, message)
}

pub trait IntoHttpResponse<T> {
    fn into_http_response(self) -> Response;
}

impl<T: Serialize, E: std::fmt::Display> IntoHttpResponse<T> for Result<T, E> {
    fn into_http_response(self) -> Response {
        match self {
            Ok(data) => http_success(serde_json::to_value(data).unwrap_or_default()),
            Err(e) => http_internal_error(e.to_string()),
        }
    }
}

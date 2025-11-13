use axum::{
    Json, 
    extract::{Query, RawQuery},
    response::{Response, IntoResponse},
    http::{StatusCode, header},
};
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::OnceCell;
use crate::torrent::client::Client;


#[derive(Deserialize)]
pub struct StartDownloadParams {
    pub q: String,
}


static CLIENT: OnceCell<Arc<Client>> = OnceCell::const_new();

// Url decode
fn decode_url(encoded: &str) -> String {
    let mut decoded = String::new();
    let chars = encoded.chars().collect::<Vec<_>>();
    let mut i = 0;
    
    while i < chars.len() {
        if chars[i] == '%' && i + 2 < chars.len() {
            if let Ok(byte) = u8::from_str_radix(&format!("{}{}", chars[i + 1], chars[i + 2]), 16) {
                decoded.push(byte as char);
                i += 3;
                continue;
            }
        }
        
        if chars[i] == '+' {
            decoded.push(' ');
        } else {
            decoded.push(chars[i]);
        }
        i += 1;
    }
    
    decoded
}

// Inicializa o client
async fn get_client() -> Result<Arc<Client>, anyhow::Error> {
    CLIENT
        .get_or_try_init(|| async {
            let client = Client::new().await?;
            Ok(Arc::new(client))
        })
        .await
        .map(|c| Arc::clone(c))
}

// Handler: GET /start?q=...
pub async fn start_download(RawQuery(query): RawQuery) -> Response {
    // Parseia manualmente a query string para evitar problemas com o `?` do magnet link
    let mut magnet = String::new();
    
    if let Some(query_str) = query {
        // Procura por "q=" na query string
        if let Some(pos) = query_str.find("q=") {
            magnet = query_str[pos + 2..].to_string();
        }
    }
    
    if magnet.is_empty() {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Json(json!({"ok": false, "error": "Query parameter 'q' is required"})).to_string().into())
            .unwrap();
    }
    
    tracing::info!("🔍 ANTES de decodificar: '{}'", magnet);
    
    // Se o magnet estiver URL-encoded, decodifica automaticamente
    if magnet.contains('%') {
        magnet = decode_url(&magnet);
        tracing::info!("🔓 DEPOIS de decodificar: '{}'", magnet);
    }
    
    tracing::info!("🔗 Magnet link recebido no handler: {}", magnet);
    
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Json(json!({"ok": false, "error": format!("Failed to get torrent client: {}", e)})).to_string().into())
                .unwrap();
        }
    };

    match client.start_download(&magnet).await {
        Ok(download_id) => {
            let payload = json!({
                "ok": true,
                "download_id": download_id,
                "magnet": magnet,
                "message": "Download started successfully"
            });
            Json(payload).into_response()
        }
        Err(e) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Json(json!({"ok": false, "error": format!("Failed to start download: {}", e)})).to_string().into())
            .unwrap(),
    }
}

// Handler: GET /encode?q=...
pub async fn encode_magnet(Query(params): Query<StartDownloadParams>) -> Response {
    use std::fmt::Write;
    
    let magnet = params.q.trim();
    
    // URL encode manual
    let mut encoded = String::new();
    for c in magnet.chars() {
        match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => {
                encoded.push(c);
            }
            _ => {
                for byte in c.to_string().as_bytes() {
                    let _ = write!(encoded, "%{:02X}", byte);
                }
            }
        }
    }
    
    let url = format!("http://127.0.0.1:8080/start?q={}", encoded);
    
    let payload = json!({
        "ok": true,
        "original": magnet,
        "encoded": encoded,
        "url": url,
        "message": "Magnet link encoded successfully"
    });
    
    Json(payload).into_response()
}

// Handler: GET /decode?encoded=... 
pub async fn decode_magnet_handler(Query(params): Query<DecodeParams>) -> Response {
    let encoded = params.encoded.trim();
    let decoded = decode_url(encoded);
    
    let payload = json!({
        "ok": true,
        "encoded": encoded,
        "decoded": decoded,
        "message": "Magnet link decoded successfully"
    });
    
    Json(payload).into_response()
}

// Decode params
#[derive(Deserialize)]
pub struct DecodeParams {
    pub encoded: String,
}

// status struct
#[derive(Deserialize)]
pub struct StatusParams {
    pub id: Option<String>,
    pub pretty: Option<String>,
}

// Handler: GET /status?id=...&pretty=1
pub async fn status(Query(params): Query<StatusParams>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Json(json!({"ok": false, "error": format!("Failed to get torrent client: {}", e)})).to_string().into())
                .unwrap();
        }
    };

    let pretty = params
        .pretty
        .as_deref()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let Some(download_id) = params.id else {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Json(json!({"ok": false, "error": "Query parameter 'id' is required"})).to_string().into())
            .unwrap();
    };

    match client.get_progress(&download_id).await {
        Ok(info) => {
            let payload = json!({
                "ok": true,
                "download_id": download_id,
                "progress": info.progress,
                "downloaded": info.downloaded,
                "total": info.total,
                "status": info.status,
                "download_speed": info.download_speed,
                "upload_speed": info.upload_speed,
                "eta": info.eta,
                "name": info.name,
                "message": "Status retrieved successfully"
            });

            if pretty {
                match serde_json::to_string_pretty(&payload) {
                    Ok(s) => Response::builder()
                        .status(StatusCode::OK)
                        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                        .body(s.into())
                        .unwrap(),
                    Err(e) => Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
                        .body(format!("failed to serialize: {}", e).into())
                        .unwrap(),
                }
            } else {
                Json(payload).into_response()
            }
        }
        Err(e) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Json(json!({"ok": false, "error": format!("Failed to get status: {}", e)})).to_string().into())
            .unwrap(),
    }
}

// Struct para stop_download
#[derive(Deserialize)]
pub struct StopParams {
    pub id: String,
}

// Handler: GET /stop?id=...
pub async fn stop_download(Query(params): Query<StopParams>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Json(json!({"ok": false, "error": format!("Failed to get torrent client: {}", e)})).to_string().into())
                .unwrap();
        }
    };

    match client.stop_download(&params.id).await {
        Ok(()) => {
            let payload = json!({
                "ok": true,
                "download_id": params.id,
                "message": "Download stopped successfully"
            });
            Json(payload).into_response()
        }
        Err(e) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Json(json!({"ok": false, "error": format!("Failed to stop download: {}", e)})).to_string().into())
            .unwrap(),
    }
}

// Handler: GET /progress?id=... 
pub async fn progress(Query(params): Query<StatusParams>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Json(json!({"ok": false, "error": format!("Failed to get torrent client: {}", e)})).to_string().into())
                .unwrap();
        }
    };

    let pretty = params
        .pretty
        .as_deref()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let Some(download_id) = params.id else {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Json(json!({"ok": false, "error": "Query parameter 'id' is required"})).to_string().into())
            .unwrap();
    };

    let list = client.list_downloads().await;
    
    if let Some(info) = list.iter().find(|d| d.download_id == download_id) {
        let payload = json!({
            "ok": true,
            "download": info,
            "message": "Progress retrieved successfully"
        });

        if pretty {
            match serde_json::to_string_pretty(&payload) {
                Ok(s) => Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                    .body(s.into())
                    .unwrap(),
                Err(e) => Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
                    .body(format!("failed to serialize: {}", e).into())
                    .unwrap(),
            }
        } else {
            Json(payload).into_response()
        }
    } else {
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
            .body(Json(json!({"ok": false, "error": format!("Download not found: {}", download_id)})).to_string().into())
            .unwrap()
    }
}

// Handler: GET /list_files?pretty=1
pub async fn list_files(Query(params): Query<HashMap<String, String>>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => {
            return Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(Json(json!({"ok": false, "error": format!("Failed to get torrent client: {}", e)})).to_string().into())
                .unwrap();
        }
    };

    let pretty = params
        .get("pretty")
        .as_deref()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let list = client.list_downloads().await;
    
    let payload = json!({
        "ok": true,
        "downloads": list,
        "count": list.len(),
        "message": "Active downloads retrieved successfully"
    });

    if pretty {
        match serde_json::to_string_pretty(&payload) {
            Ok(s) => Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(s.into())
                .unwrap(),
            Err(e) => Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .header(header::CONTENT_TYPE, "text/plain; charset=utf-8")
                .body(format!("failed to serialize: {}", e).into())
                .unwrap(),
        }
    } else {
        Json(payload).into_response()
    }
}


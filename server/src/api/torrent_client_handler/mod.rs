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

#[derive(Deserialize)]
pub struct StatusParams {
    pub id: Option<String>,
    pub pretty: Option<String>,
}

#[derive(Deserialize)]
pub struct StopParams {
    pub id: String,
}

#[derive(Deserialize)]
pub struct DecodeParams {
    pub encoded: String,
}

static CLIENT: OnceCell<Arc<Client>> = OnceCell::const_new();

async fn get_client() -> Result<Arc<Client>, String> {
    CLIENT
        .get_or_try_init(|| async {
            let client = Client::new().await
                .map_err(|e| format!("Erro ao criar cliente: {}", e))?;
            Ok(Arc::new(client))
        })
        .await
        .map(|c| Arc::clone(c))
        .map_err(|e: String| e)
}

/// Decodifica URL-encoded string
fn decode_url(encoded: &str) -> String {
    let mut decoded = String::new();
    let chars: Vec<char> = encoded.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '%' && i + 2 < chars.len() {
            if let Ok(byte) = u8::from_str_radix(
                &format!("{}{}", chars[i + 1], chars[i + 2]),
                16,
            ) {
                decoded.push(byte as char);
                i += 3;
                continue;
            }
        }
        
        decoded.push(if chars[i] == '+' { ' ' } else { chars[i] });
        i += 1;
    }

    decoded
}

fn is_pretty(params: &StatusParams) -> bool {
    params.pretty
        .as_deref()
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn json_response(status: StatusCode, body: serde_json::Value) -> Response {
    Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
        .body(body.to_string().into())
        .unwrap()
}

fn error_response(status: StatusCode, message: impl Into<String>) -> Response {
    json_response(status, json!({
        "ok": false,
        "error": message.into()
    }))
}

fn success_response(payload: serde_json::Value, pretty: bool) -> Response {
    if pretty {
        match serde_json::to_string_pretty(&payload) {
            Ok(s) => Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, "application/json; charset=utf-8")
                .body(s.into())
                .unwrap(),
            Err(e) => error_response(StatusCode::INTERNAL_SERVER_ERROR, format!("Erro de serialização: {}", e)),
        }
    } else {
        Json(payload).into_response()
    }
}


/// GET /start?q=magnet:?xt=urn:btih:...
pub async fn start_download(RawQuery(query): RawQuery) -> Response {
    let mut magnet = String::new();
    
    if let Some(query_str) = query {
        if let Some(pos) = query_str.find("q=") {
            magnet = query_str[pos + 2..].to_string();
        }
    }
    
    if magnet.is_empty() {
        return error_response(StatusCode::BAD_REQUEST, "Parâmetro 'q' é obrigatório");
    }
    
    if magnet.contains('%') {
        magnet = decode_url(&magnet);
    }
    
    tracing::info!("🔗 Magnet link recebido: {}", &magnet[..60.min(magnet.len())]);
    
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    };

    match client.start_download(&magnet).await {
        Ok(download_id) => {
            Json(json!({
                "ok": true,
                "download_id": download_id,
                "magnet": magnet,
                "message": "Download iniciado com sucesso"
            })).into_response()
        }
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Falha ao iniciar download: {}", e)
        ),
    }
}


// GET /status?id=...&pretty=1
pub async fn status(Query(params): Query<StatusParams>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    };

    let pretty = is_pretty(&params);

    let Some(download_id) = params.id else {
        return error_response(StatusCode::BAD_REQUEST, "Parâmetro 'id' é obrigatório");
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
                "message": "Status obtido com sucesso"
            });
            success_response(payload, pretty)
        }
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Falha ao obter status: {}", e)
        ),
    }
}

// GET /progress?id=...&pretty=1
pub async fn progress(Query(params): Query<StatusParams>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    };

    let pretty = is_pretty(&params);

    let Some(download_id) = params.id else {
        return error_response(StatusCode::BAD_REQUEST, "Parâmetro 'id' é obrigatório");
    };

    let list = client.list_downloads().await;
    
    if let Some(info) = list.iter().find(|d| d.download_id == download_id) {
        let payload = json!({
            "ok": true,
            "download": info,
            "message": "Progresso obtido com sucesso"
        });
        success_response(payload, pretty)
    } else {
        error_response(
            StatusCode::NOT_FOUND,
            format!("Download não encontrado: {}", download_id)
        )
    }
}


// GET /stop?id=...
pub async fn stop_download(Query(params): Query<StopParams>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    };

    match client.stop_download(&params.id).await {
        Ok(()) => {
            Json(json!({
                "ok": true,
                "download_id": params.id,
                "message": "Download parado com sucesso"
            })).into_response()
        }
        Err(e) => error_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Falha ao parar download: {}", e)
        ),
    }
}

// GET /list_files?pretty=1
pub async fn list_files(Query(params): Query<HashMap<String, String>>) -> Response {
    let client = match get_client().await {
        Ok(c) => c,
        Err(e) => return error_response(StatusCode::INTERNAL_SERVER_ERROR, e),
    };

    let pretty = params
        .get("pretty")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    let list = client.list_downloads().await;
    
    let payload = json!({
        "ok": true,
        "downloads": list,
        "count": list.len(),
        "message": "Downloads ativos listados com sucesso"
    });

    success_response(payload, pretty)
}


// GET /encode?q=magnet:...
pub async fn encode_magnet(Query(params): Query<StartDownloadParams>) -> Response {
    use std::fmt::Write;
    
    let magnet = params.q.trim();
    
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
    
    Json(json!({
        "ok": true,
        "original": magnet,
        "encoded": encoded,
        "url": url,
        "message": "Magnet link codificado com sucesso"
    })).into_response()
}


// GET /decode?encoded=...
pub async fn decode_magnet_handler(Query(params): Query<DecodeParams>) -> Response {
    let encoded = params.encoded.trim();
    let decoded = decode_url(encoded);
    
    Json(json!({
        "ok": true,
        "encoded": encoded,
        "decoded": decoded,
        "message": "Magnet link decodificado com sucesso"
    })).into_response()
}

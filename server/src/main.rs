mod api;
mod torrent;
mod config;

use axum::{routing::get, Router};
use tower_http::services::fs::ServeDir;
use tower_http::cors::CorsLayer;
use std::net::SocketAddr;
use crate::api::nyaa_si_handler::search;
use crate::api::torrent_client_handler::{start_download, status, stop_download, list_files, encode_magnet, decode_magnet_handler, progress};
use crate::torrent::hls_manager;
use crate::torrent::stream_manager;


#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    // Configuração de CORS permissivo
    let cors = CorsLayer::permissive();

    let app = Router::new()
        .route("/", get(|| async { "Waluna Backend" }))
        .route("/search", get(search)) // faz busca nos trackers (atualmente so tem nyaa.si)
        .route("/start", get(start_download))
        .route("/encode", get(encode_magnet))
        .route("/decode", get(decode_magnet_handler))
        .route("/status", get(status))
        .route("/progress", get(progress))
        .route("/stop", get(stop_download))
        .route("/list_files", get(list_files))
        //.route("/progressbar", get(progressbar))
        .route("/config/subtitle-template", get(config::get_default_subtitle_template))
        .route("/config/libass", get(config::get_libass_config))
        .nest_service("/cache", ServeDir::new("./cache"))
        .nest("/hls", hls_manager::router())
        .nest("/streams", stream_manager::router())
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));
    
    // Listener TCP
    let listener = tokio::net::TcpListener::bind(addr).await?;
    
    tracing::info!("🚀 Servidor rodando em http://{}/", addr);
    tracing::info!("✅ Stream Manager rodando em http://{}/streams/", addr);
    tracing::info!("✅ HLS Manager rodando em http://{}/hls/", addr);

    // Inicia o servidor
    axum::serve(listener, app).await?;

    Ok(())
}
mod api;
mod common;
mod config;
mod proxy;
mod torrent;

use axum::{routing::get, Router};
use tokio::net::TcpListener;
use tower_http::services::ServeDir;
use tower_http::cors::CorsLayer;
use crate::api::anime_fire_handler::router as anime_fire_router;
//use crate::api::tomato_handler::handlers::router as tomato_router;
use std::net::SocketAddr;
use crate::api::nyaa_si_handler::search;
use crate::api::torrent_client_handler::{start_download, status, stop_download, list_files, encode_magnet, decode_magnet_handler, progress};
use crate::torrent::hls_manager;
use crate::torrent::stream_manager;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::Instant;
type SharedCache = Arc<Mutex<HashMap<String, (String, Instant)>>>;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    // Configuração de CORS permissivo
    let cors = CorsLayer::permissive();
    let cache: SharedCache = Arc::new(Mutex::new(HashMap::new()));
    let proxy_manager = Arc::new(crate::proxy::ProxyManager::new("./validproxies.txt"));
    proxy_manager.load_proxies().await.ok();

    let app = Router::new()
        .route("/", get(|| async { "Waluna Backend" }))
        .route("/search", get(search)) // nyaa.si search
        .nest("/animefire", anime_fire_router(cache.clone()))
        //.nest("/tomato", tomato_router(cache.clone(), proxy_manager.clone()))
        .route("/start", get(start_download))
        .route("/encode", get(encode_magnet))
        .route("/decode", get(decode_magnet_handler))
        .route("/status", get(status))
        .route("/progress", get(progress))
        .route("/stop", get(stop_download))
        .route("/list_files", get(list_files))
        .route("/config/subtitle-template", get(config::get_default_subtitle_template))
        .route("/config/libass", get(config::get_libass_config))
        .nest_service("/cache", ServeDir::new("./cache"))
        .nest("/hls", hls_manager::router())
        .nest("/streams", stream_manager::router())
        .layer(cors);

    let addr = SocketAddr::from(([127, 0, 0, 1], 8080));

    tracing::info!("Servidor rodando em http://{}/", addr);
    tracing::info!("Stream Manager rodando em http://{}/streams/", addr);
    tracing::info!("HLS Manager rodando em http://{}/hls/", addr);

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;


    Ok(())
}
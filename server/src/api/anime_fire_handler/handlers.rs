use crate::api::anime_fire_handler::parser;
use axum::{
    extract::Query,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use std::time::{Duration, Instant};

type SharedCache = Arc<Mutex<HashMap<String, (String, Instant)>>>;

const CACHE_TTL: Duration = Duration::from_secs(300);

async fn get_html_with_cache(url: &str, cache: SharedCache) -> Result<String, reqwest::Error> {
    {
        let guard = cache.lock().await;
        if let Some((html, timestamp)) = guard.get(url) {
            if timestamp.elapsed() < CACHE_TTL {
                return Ok(html.clone());
            }
        }
    }
    let html = parser::fetch_html(url).await?;
    let mut guard = cache.lock().await;
    guard.insert(url.to_string(), (html.clone(), Instant::now()));
    Ok(html)
}

#[derive(Deserialize)]
struct DownloadLinksQuery {
    url: String,
}

async fn download_links(
    Query(params): Query<DownloadLinksQuery>,
    axum::extract::Extension(cache): axum::extract::Extension<SharedCache>,
) -> impl IntoResponse {
    match get_html_with_cache(&params.url, cache).await {
        Ok(html) => {
            let links = parser::extract_download_links(&html);
            Json(links).into_response()
        }
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Erro: {}", e),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

async fn search_anime(
    Query(params): Query<SearchQuery>,
    axum::extract::Extension(_cache): axum::extract::Extension<SharedCache>, // not used here
) -> impl IntoResponse {
    match parser::search_anime(&params.q).await {
        Ok(results) => Json(results).into_response(),
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Erro: {}", e),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct ProfileQuery {
    url: String,
}

async fn anime_profile(
    Query(params): Query<ProfileQuery>,
    axum::extract::Extension(cache): axum::extract::Extension<SharedCache>,
) -> impl IntoResponse {
    match get_html_with_cache(&params.url, cache).await {
        Ok(html) => match parser::parse_anime_profilepage(&html) {
            Ok(episodes) => Json(episodes).into_response(),
            Err(e) => (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                format!("Erro: {}", e),
            )
                .into_response(),
        },
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Erro: {}", e),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
struct EpisodeLinksQuery {
    url: String,
}

async fn episode_links(
    Query(params): Query<EpisodeLinksQuery>,
    axum::extract::Extension(cache): axum::extract::Extension<SharedCache>,
) -> impl IntoResponse {
    match get_html_with_cache(&params.url, cache).await {
        Ok(html) => {
            let links = parser::extract_video_links_by_quality(&html);
            Json(links).into_response()
        }
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            format!("Erro: {}", e),
        )
            .into_response(),
    }
}

pub fn router(cache: SharedCache) -> Router {
    Router::new()
        .route("/", get(|| async { "AnimeFire Handler is alive" }))
        .route("/search", get(search_anime))
        .route("/profile", get(anime_profile))
        .route("/get_download_link", get(download_links))
        .route("/get_mp4", get(episode_links))
        .layer(axum::extract::Extension(cache))
}
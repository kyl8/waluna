use axum::response::IntoResponse;
use axum::http::StatusCode;

// Template para inicialiazação de legendas via libass
pub async fn get_default_subtitle_template() -> impl IntoResponse {
    let content = include_str!("../assets/default-subtitle-template.ass");
    
    (
        StatusCode::OK,
        [("Content-Type", "text/plain; charset=utf-8")],
        content,
    )
}

// Configuração do LibASS em JSON
pub async fn get_libass_config() -> impl IntoResponse {
    let config = serde_json::json!({
        "workerUrl": "/assets/subtitles-octopus-worker.js",
        "fallbackFont": "/assets/misc/SourceHanSansCN-Bold.woff2",
        "wasmUrl": "/assets/subtitles-octopus-worker.wasm",
        "defaultFontSize": 20,
        "defaultFontName": "Arial",
        "subTemplateUrl": "/config/subtitle-template"
    });

    (
        StatusCode::OK,
        [("Content-Type", "application/json")],
        config.to_string(),
    )
}

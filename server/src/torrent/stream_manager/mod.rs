use axum::{
    extract::{Path, Query},
    routing::get,
    Router, Json, http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::str::FromStr;
use tracing::{info, warn, debug};

use crate::common::video::{
    VideoFileInfo, find_first_video_file, list_video_files as video_list_files,
    find_video_file_by_index as video_find_by_index,
};

#[derive(Debug, Deserialize)]
pub struct FilterQuery {
    filter: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VideoFilesResponse {
    pub ok: bool,
    pub download_id: String,
    pub files: Vec<VideoFileInfo>,
    pub is_multi_file: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub index: i32,
    pub codec_type: String,
    pub codec_name: String,
    pub duration: Option<f64>,
    pub bitrate: Option<i64>,
    pub language: Option<String>,
    pub title: Option<String>,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub sample_rate: Option<i32>,
    pub channels: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleStream {
    pub index: i32,
    pub codec_name: String,
    pub language: Option<String>,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleFileResponse {
    pub index: i32,
    pub codec_name: String,
    pub language: Option<String>,
    pub title: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AllStreamsResponse {
    pub streams: Vec<StreamInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubtitleFilesResponse {
    pub subtitles: Vec<SubtitleFileResponse>,
}

#[derive(Debug, Clone, Copy)]
pub enum StreamFilter {
    Video,
    Audio,
    Subtitle,
    Attachment,
    All,
}

impl FromStr for StreamFilter {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "video" => Ok(StreamFilter::Video),
            "audio" => Ok(StreamFilter::Audio),
            "subs" | "subtitle" | "subtitles" => Ok(StreamFilter::Subtitle),
            "attachment" => Ok(StreamFilter::Attachment),
            "all" => Ok(StreamFilter::All),
            _ => Err(format!("Filtro desconhecido: {}", s)),
        }
    }
}

impl StreamFilter {
    pub fn matches(&self, codec_type: &str) -> bool {
        match self {
            StreamFilter::Video => codec_type == "video",
            StreamFilter::Audio => codec_type == "audio",
            StreamFilter::Subtitle => codec_type == "subtitle",
            StreamFilter::Attachment => codec_type == "attachment",
            StreamFilter::All => true,
        }
    }
}

fn parse_composite_id(id: &str) -> (String, Option<usize>) {
    if let Some(pos) = id.rfind('_') {
        if let Ok(index) = id[pos+1..].parse::<usize>() {
            return (id[..pos].to_string(), Some(index));
        }
    }
    (id.to_string(), None)
}

pub struct StreamManager;

impl StreamManager {
    fn ffprobe_path() -> &'static str {
        static FFPROBE_PATH: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();
        *FFPROBE_PATH.get_or_init(|| {
            if fs::metadata("ffmpeg/bin/ffprobe.exe").is_ok() {
                "ffmpeg/bin/ffprobe.exe"
            } else {
                "ffprobe"
            }
        })
    }

    fn ffmpeg_path() -> &'static str {
        static FFMPEG_PATH: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();
        *FFMPEG_PATH.get_or_init(|| {
            if fs::metadata("ffmpeg/bin/ffmpeg.exe").is_ok() {
                "ffmpeg/bin/ffmpeg.exe"
            } else {
                "ffmpeg"
            }
        })
    }

    pub async fn run_ffprobe(args: &[&str]) -> Result<serde_json::Value, String> {
        let output = tokio::process::Command::new(Self::ffprobe_path())
            .args(args)
            .output()
            .await
            .map_err(|e| format!("Erro ao executar ffprobe: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Erro do ffprobe: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str(&stdout)
            .map_err(|e| format!("Erro ao parsear JSON: {}", e))
    }

    pub async fn run_ffmpeg(args: &[&str]) -> Result<String, String> {
        let output = tokio::process::Command::new(Self::ffmpeg_path())
            .args(args)
            .output()
            .await
            .map_err(|e| format!("Erro ao executar ffmpeg: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Erro do ffmpeg: {}", stderr));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    pub fn find_video_file(download_id: &str) -> Result<String, String> {
        find_first_video_file(download_id)
    }

    pub fn list_video_files(download_id: &str) -> Result<Vec<VideoFileInfo>, String> {
        video_list_files(download_id)
    }

    pub fn find_video_file_by_index(download_id: &str, index: usize) -> Result<String, String> {
        video_find_by_index(download_id, index)
    }

    pub async fn extract_streams_filtered(
        video_path: &str,
        filter: StreamFilter,
    ) -> Result<Vec<StreamInfo>, String> {
        let json = Self::run_ffprobe(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path,
        ]).await?;

        let mut streams = Vec::new();

        let streams_arr = json.get("streams")
            .and_then(|s| s.as_array())
            .ok_or("Streams não encontrados")?;

        for stream in streams_arr {
            let codec_type = stream.get("codec_type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            if !filter.matches(codec_type) {
                continue;
            }

            streams.push(Self::parse_stream_info(stream, codec_type));
        }

        Ok(streams)
    }

    fn parse_stream_info(stream: &serde_json::Value, codec_type: &str) -> StreamInfo {
        let get_tag = |key: &str| -> Option<String> {
            stream.get("tags")
                .and_then(|t| t.as_object())
                .and_then(|obj| {
                    obj.iter()
                        .find(|(k, _)| k.to_lowercase() == key.to_lowercase())
                        .and_then(|(_, v)| v.as_str())
                        .map(|s| s.to_string())
                })
        };

        StreamInfo {
            index: stream.get("index").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
            codec_type: codec_type.to_string(),
            codec_name: stream.get("codec_name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            duration: stream.get("duration")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok()),
            bitrate: stream.get("bit_rate")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok()),
            language: get_tag("language"),
            title: get_tag("title"),
            width: stream.get("width").and_then(|v| v.as_i64()).map(|i| i as i32),
            height: stream.get("height").and_then(|v| v.as_i64()).map(|i| i as i32),
            sample_rate: stream.get("sample_rate")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok()),
            channels: stream.get("channels").and_then(|v| v.as_i64()).map(|i| i as i32),
        }
    }

    pub async fn extract_subtitles_from_file(video_path: &str) -> Result<Vec<SubtitleStream>, String> {
        let json = Self::run_ffprobe(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_streams",
            video_path,
        ]).await?;

        let mut subtitles = Vec::new();

        if let Some(streams_arr) = json.get("streams").and_then(|s| s.as_array()) {
            for stream in streams_arr {
                let codec_type = stream.get("codec_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if codec_type != "subtitle" {
                    continue;
                }

                let get_tag = |key: &str| -> Option<String> {
                    stream.get("tags")
                        .and_then(|t| t.as_object())
                        .and_then(|obj| {
                            obj.iter()
                                .find(|(k, _)| k.to_lowercase() == key.to_lowercase())
                                .and_then(|(_, v)| v.as_str())
                                .map(|s| s.to_string())
                        })
                };

                subtitles.push(SubtitleStream {
                    index: stream.get("index").and_then(|v| v.as_i64()).unwrap_or(0) as i32,
                    codec_name: stream.get("codec_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string(),
                    language: get_tag("language"),
                    title: get_tag("title"),
                });
            }
        }

        Ok(subtitles)
    }

    pub fn get_cached_subtitles(download_id: &str) -> Vec<SubtitleFileResponse> {
        let subtitles_dir = format!("cache/subtitles/{}", download_id);
        
        if !fs::metadata(&subtitles_dir).map(|m| m.is_dir()).unwrap_or(false) {
            return Vec::new();
        }

        let mut responses = Vec::new();

        if let Ok(entries) = fs::read_dir(&subtitles_dir) {
            for entry in entries.flatten() {
                if let Some(resp) = Self::parse_subtitle_filename(&entry, download_id) {
                    responses.push(resp);
                }
            }
        }

        responses.sort_by_key(|s| s.index);
        responses
    }

    fn parse_subtitle_filename(entry: &fs::DirEntry, download_id: &str) -> Option<SubtitleFileResponse> {
        let path = entry.path();
        if !path.is_file() {
            return None;
        }

        let filename = path.file_name()?.to_string_lossy().to_string();
        let parts: Vec<&str> = filename.rsplitn(2, '.').collect();
        if parts.len() != 2 {
            return None;
        }
        
        let extension = parts[0];
        let name_part = parts[1];
        
        let components: Vec<&str> = name_part.splitn(3, '_').collect();
        if components.len() < 2 {
            return None;
        }

        let index = components[0].parse().ok()?;
        let language = if components[1] != "unknown" {
            Some(components[1].to_string())
        } else {
            None
        };
        let title = if components.len() > 2 && components[2] != "default" {
            Some(components[2].to_string())
        } else {
            None
        };

        let codec_name = match extension {
            "ass" | "ssa" => extension.to_string(),
            "webvtt" => "webvtt".to_string(),
            "srt" => "subrip".to_string(),
            _ => "unknown".to_string(),
        };

        Some(SubtitleFileResponse {
            index,
            codec_name,
            language,
            title,
            url: format!("/cache/subtitles/{}/{}", download_id, filename),
        })
    }

    pub async fn extract_subtitles_to_files(
        download_id: &str,
        video_path: &str,
    ) -> Result<Vec<SubtitleFileResponse>, String> {
        let subtitles_dir = format!("./cache/subtitles/{}", download_id);
        fs::create_dir_all(&subtitles_dir)
            .map_err(|e| format!("Falha ao criar diretório: {}", e))?;

        let subtitles = Self::extract_subtitles_from_file(video_path).await?;
        
        if subtitles.is_empty() {
            return Ok(Vec::new());
        }

        let mut responses = Vec::new();
        let mut seen_languages = std::collections::HashSet::new();
        let mut tasks = Vec::new();

        for sub in subtitles {
            let lang_key = sub.language.as_deref().unwrap_or("unknown");
            if seen_languages.contains(lang_key) {
                debug!("[StreamManager:{}] Pulando idioma duplicado: {}", download_id, lang_key);
                continue;
            }
            seen_languages.insert(lang_key.to_string());

            let output_filename = format!(
                "{}_{}_{}.ass",
                sub.index,
                sub.language.as_deref().unwrap_or("unknown"),
                sub.title.as_deref().unwrap_or("default")
            );
            let output_path = format!("{}/{}", subtitles_dir, output_filename);
            let video_path_clone = video_path.to_string();
            let index = sub.index;

            let task = async move {
                let args = [
                    "-i", &video_path_clone,
                    "-map", &format!("0:{}", index),
                    "-c", "ass",
                    "-y", &output_path,
                ];
                Self::run_ffmpeg(&args).await
            };
            tasks.push(task);

            responses.push(SubtitleFileResponse {
                index: sub.index,
                codec_name: sub.codec_name,
                language: sub.language,
                title: sub.title,
                url: format!("/cache/subtitles/{}/{}", download_id, output_filename),
            });
        }

        info!("[StreamManager:{}] Extraindo {} legendas em paralelo", download_id, tasks.len());
        let results = futures::future::join_all(tasks).await;
        
        for (i, result) in results.iter().enumerate() {
            if let Err(e) = result {
                warn!("[StreamManager:{}] Falha ao extrair legenda {}: {}", download_id, i, e);
            }
        }

        let verified: Vec<_> = responses.into_iter()
            .filter(|r| {
                let filename = r.url.split('/').last().unwrap_or("");
                let path = format!("{}/{}", subtitles_dir, filename);
                fs::metadata(&path).map(|m| m.len() > 0).unwrap_or(false)
            })
            .collect();

        Ok(verified)
    }
}

async fn list_video_files_handler(
    Path(id): Path<String>,
) -> Result<Json<VideoFilesResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Listando arquivos de vídeo", id);
    
    match StreamManager::list_video_files(&id) {
        Ok(files) => {
            let is_multi_file = files.len() > 1;
            info!("[StreamManager:{}] {} arquivos encontrados (multi: {})", id, files.len(), is_multi_file);
            
            Ok(Json(VideoFilesResponse {
                ok: true,
                download_id: id,
                files,
                is_multi_file,
            }))
        }
        Err(e) => {
            warn!("[StreamManager:{}] Nenhum arquivo: {}", id, e);
            Ok(Json(VideoFilesResponse {
                ok: false,
                download_id: id,
                files: vec![],
                is_multi_file: false,
            }))
        }
    }
}

async fn get_video_file_by_index_handler(
    Path((id, index)): Path<(String, usize)>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    info!("[StreamManager:{}] Buscando arquivo índice {}", id, index);
    
    let path = StreamManager::find_video_file_by_index(&id, index)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;
    
    let metadata = fs::metadata(&path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Erro: {}", e)))?;
    
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    Ok(Json(serde_json::json!({
        "download_id": id,
        "file_index": index,
        "name": name,
        "path": path,
        "size": metadata.len(),
    })))
}

async fn get_all_streams(
    Path(id): Path<String>,
    Query(params): Query<FilterQuery>,
) -> Result<Json<AllStreamsResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Extraindo streams", id);
    let (download_id, file_index) = parse_composite_id(&id);
    let video_path = if let Some(idx) = file_index {
        StreamManager::find_video_file_by_index(&download_id, idx)
            .map_err(|e| (StatusCode::NOT_FOUND, e))?
    } else {
        StreamManager::find_video_file(&download_id)
            .map_err(|e| (StatusCode::NOT_FOUND, e))?
    };

    let filter = match params.filter {
        Some(f) => StreamFilter::from_str(&f).map_err(|e| (StatusCode::BAD_REQUEST, e))?,
        None => StreamFilter::All,
    };

    let streams = StreamManager::extract_streams_filtered(&video_path, filter)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(AllStreamsResponse { streams }))
}

async fn get_subtitles(
    Path(id): Path<String>,
) -> Result<Json<SubtitleFilesResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Obtendo legendas", id);
    let (download_id, file_index) = parse_composite_id(&id);
    let cache_key = if file_index.is_some() { &id } else { &download_id };
    let cached = StreamManager::get_cached_subtitles(cache_key);
    if !cached.is_empty() {
        info!("[StreamManager:{}] Retornando {} legendas do cache", id, cached.len());
        return Ok(Json(SubtitleFilesResponse { subtitles: cached }));
    }

    let video_path = if let Some(index) = file_index {
        StreamManager::find_video_file_by_index(&download_id, index)
            .map_err(|e| (StatusCode::NOT_FOUND, format!("Arquivo índice {} não encontrado: {}", index, e)))?
    } else {
        StreamManager::find_video_file(&download_id)
            .map_err(|e| (StatusCode::NOT_FOUND, format!("Arquivo não encontrado: {}", e)))?
    };

    info!("[StreamManager:{}] Extraindo legendas do arquivo: {}", id, video_path);
    let subtitles = StreamManager::extract_subtitles_to_files(cache_key, &video_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    
    info!("[StreamManager:{}] {} legendas extraídas", id, subtitles.len());

    Ok(Json(SubtitleFilesResponse { subtitles }))
}


async fn get_subtitles_by_lang(
    Path((id, lang)): Path<(String, String)>,
) -> Result<Json<SubtitleFilesResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Buscando legendas em {}", id, lang);
    
    let (download_id, file_index) = parse_composite_id(&id);
    let cache_key = if file_index.is_some() { &id } else { &download_id };
    
    let mut cached = StreamManager::get_cached_subtitles(cache_key);
    if !cached.is_empty() {
        cached.retain(|s| {
            s.language.as_ref()
                .map(|l| l.to_lowercase().contains(&lang.to_lowercase()))
                .unwrap_or(false)
        });
        return Ok(Json(SubtitleFilesResponse { subtitles: cached }));
    }

    let video_path = if let Some(index) = file_index {
        StreamManager::find_video_file_by_index(&download_id, index)
            .map_err(|e| (StatusCode::NOT_FOUND, e))?
    } else {
        StreamManager::find_video_file(&download_id)
            .map_err(|e| (StatusCode::NOT_FOUND, e))?
    };

    let subtitles = StreamManager::extract_subtitles_to_files(cache_key, &video_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let filtered: Vec<_> = subtitles.into_iter()
        .filter(|s| {
            s.language.as_ref()
                .map(|l| l.to_lowercase().contains(&lang.to_lowercase()))
                .unwrap_or(false)
        })
        .collect();

    Ok(Json(SubtitleFilesResponse { subtitles: filtered }))
}

async fn extract_subtitles_handler(
    Path(id): Path<String>,
) -> Result<Json<SubtitleFilesResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Extraindo legendas para arquivos", id);
    let (download_id, file_index) = parse_composite_id(&id);
    let cache_key = if file_index.is_some() { &id } else { &download_id };
    
    let video_path = if let Some(index) = file_index {
        StreamManager::find_video_file_by_index(&download_id, index)
            .map_err(|e| (StatusCode::NOT_FOUND, e))?
    } else {
        StreamManager::find_video_file(&download_id)
            .map_err(|e| (StatusCode::NOT_FOUND, e))?
    };

    let subtitles = StreamManager::extract_subtitles_to_files(cache_key, &video_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(SubtitleFilesResponse { subtitles }))
}

pub fn router() -> Router {
    Router::new()
        .route("/", get(|| async { "Stream Manager is running" }))
        .route("/files/:id", get(list_video_files_handler))
        .route("/files/:id/:index", get(get_video_file_by_index_handler))
        .route("/subs/:id", get(get_subtitles))
        .route("/subs/:id/:lang", get(get_subtitles_by_lang))
        .route("/extract/:id", get(extract_subtitles_handler))
        .route("/:id", get(get_all_streams))
}

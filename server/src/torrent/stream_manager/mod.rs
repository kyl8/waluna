use axum::{
    extract::{Path, Query},
    routing::get,
    Router, Json, http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::str::FromStr;
use walkdir::WalkDir;
use tracing::{info};

#[derive(Debug, Deserialize)]
pub struct FilterQuery {
    filter: Option<String>,
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
pub struct SubtitleResponse {
    pub subtitles: Vec<SubtitleStream>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleFilesResponse {
    pub subtitles: Vec<SubtitleFileResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleByLangResponse {
    pub subtitles: Vec<SubtitleStream>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllStreamsResponse {
    pub streams: Vec<StreamInfo>,
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
            _ => Err(format!("Unknown filter: {}", s)),
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

pub struct StreamManager;

impl StreamManager {
    pub async fn run_ffprobe(args: &[&str]) -> Result<serde_json::Value, String> {
        let ffprobe_path = "ffmpeg/bin/ffprobe.exe";

        let output = if fs::metadata(ffprobe_path).is_ok() {
            tokio::process::Command::new(ffprobe_path)
                .args(args)
                .output()
                .await
                .map_err(|e| format!("Execução do ffprobe falhou {}", e))
        } else {
            tokio::process::Command::new("ffprobe")
                .args(args)
                .output()
                .await
                .map_err(|e| format!("Execução do ffprobe falhou (system PATH): {}", e))
        }?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Erro do ffprobe: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        serde_json::from_str(&stdout)
            .map_err(|e| format!("Erro ao analisar JSON: {}", e))
    }

    pub async fn run_ffmpeg(args: &[&str]) -> Result<String, String> {
        let ffmpeg_path = "ffmpeg/bin/ffmpeg.exe";

        let output = if fs::metadata(ffmpeg_path).is_ok() {
            tokio::process::Command::new(ffmpeg_path)
                .args(args)
                .output()
                .await
                .map_err(|e| format!("Execução do ffmpeg falhou (bundled): {}", e))
        } else {
            tokio::process::Command::new("ffmpeg")
                .args(args)
                .output()
                .await
                .map_err(|e| format!("Execução do ffmpeg falhou (system PATH): {}", e))
        }?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Erro do ffmpeg: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.to_string())
    }

    pub async fn extract_all_streams_filtered(
        video_path: &str,
        filter: StreamFilter,
    ) -> Result<Vec<StreamInfo>, String> {
        let json = Self::run_ffprobe(&[
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            video_path,
        ])
        .await?;

        let mut streams = Vec::new();

        if let Some(streams_arr) = json.get("streams").and_then(|s| s.as_array()) {
            for stream in streams_arr {
                let codec_type = stream
                    .get("codec_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");

                if !filter.matches(codec_type) {
                    continue;
                }

                let index = stream
                    .get("index")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;

                let codec_name = stream
                    .get("codec_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let language = stream
                    .get("tags")
                    .and_then(|t| t.get("language"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let title = stream
                    .get("tags")
                    .and_then(|tags| {
                        if let Some(obj) = tags.as_object() {
                            for (key, val) in obj.iter() {
                                if key.to_lowercase() == "title" {
                                    return val.as_str().map(|s| s.to_string());
                                }
                            }
                        }
                        None
                    });

                let duration = stream
                    .get("duration")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok());

                let bitrate = stream
                    .get("bit_rate")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<i64>().ok());

                let width = stream.get("width").and_then(|v| v.as_i64()).map(|i| i as i32);
                let height = stream.get("height").and_then(|v| v.as_i64()).map(|i| i as i32);
                let sample_rate = stream
                    .get("sample_rate")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<i32>().ok());
                let channels = stream.get("channels").and_then(|v| v.as_i64()).map(|i| i as i32);

                streams.push(StreamInfo {
                    index,
                    codec_type: codec_type.to_string(),
                    codec_name,
                    duration,
                    bitrate,
                    language,
                    title,
                    width,
                    height,
                    sample_rate,
                    channels,
                });
            }
        }

        Ok(streams)
    }

    pub async fn extract_subtitles_from_file(
        video_path: &str,
    ) -> Result<Vec<SubtitleStream>, String> {
        let json = Self::run_ffprobe(&[
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            video_path,
        ])
        .await?;

        let mut subtitles = Vec::new();

        if let Some(streams_arr) = json.get("streams").and_then(|s| s.as_array()) {
            for stream in streams_arr {
                let codec_type = stream
                    .get("codec_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if codec_type != "subtitle" {
                    continue;
                }

                let index = stream
                    .get("index")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;

                let codec_name = stream
                    .get("codec_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let language = stream
                    .get("tags")
                    .and_then(|t| t.get("language"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let title = stream
                    .get("tags")
                    .and_then(|tags| {
                        if let Some(obj) = tags.as_object() {
                            for (key, val) in obj.iter() {
                                if key.to_lowercase() == "title" {
                                    return val.as_str().map(|s| s.to_string());
                                }
                            }
                        }
                        None
                    });

                subtitles.push(SubtitleStream {
                    index,
                    codec_name,
                    language,
                    title,
                });
            }
        }

        Ok(subtitles)
    }

    pub fn find_video_file(download_id: &str) -> Result<String, String> {
        let mkv_path = format!("cache/downloads/{}.mkv", download_id);
        if fs::metadata(&mkv_path).is_ok() {
            return Ok(mkv_path);
        }

        let mp4_path = format!("cache/downloads/{}.mp4", download_id);
        if fs::metadata(&mp4_path).is_ok() {
            return Ok(mp4_path);
        }

        let avi_path = format!("cache/downloads/{}.avi", download_id);
        if fs::metadata(&avi_path).is_ok() {
            return Ok(avi_path);
        }

        let mov_path = format!("cache/downloads/{}.mov", download_id);
        if fs::metadata(&mov_path).is_ok() {
            return Ok(mov_path);
        }
        
        let direct_path = format!("cache/downloads/{}", download_id);
        if let Ok(entries) = fs::read_dir(&direct_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if matches!(
                            ext_str.as_str(),
                            "mp4" | "mkv" | "avi" | "mov" | "flv" | "wmv" | "webm"
                        ) {
                            if let Some(path_str) = path.to_str() {
                                return Ok(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }

        if let Ok(_) = fs::metadata(&direct_path) {
            for entry in WalkDir::new(&direct_path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let path = entry.path();
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        let ext_str = ext.to_string_lossy().to_lowercase();
                        if matches!(
                            ext_str.as_str(),
                            "mp4" | "mkv" | "avi" | "mov" | "flv" | "wmv" | "webm"
                        ) {
                            if let Some(path_str) = path.to_str() {
                                return Ok(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }

        Err(format!("Sem arquivo encontrando com id  {}", download_id))
    }

    pub fn get_cached_subtitle_files(download_id: &str) -> Result<Vec<SubtitleFileResponse>, String> {
        let subtitles_dir = format!("cache/subtitles/{}", download_id);
        
        if !fs::metadata(&subtitles_dir).map(|m| m.is_dir()).unwrap_or(false) {
            return Ok(Vec::new());
        }

        let mut subtitle_responses = Vec::new();

        if let Ok(entries) = fs::read_dir(&subtitles_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(filename) = path.file_name() {
                        let filename_str = filename.to_string_lossy().to_string();
                        
                        let parts: Vec<&str> = filename_str.rsplitn(2, '.').collect();
                        if parts.len() != 2 {
                            continue;
                        }
                        
                        let extension = parts[0];
                        let name_part = parts[1];
                        
                        let name_components: Vec<&str> = name_part.splitn(3, '_').collect();
                        if name_components.len() < 2 {
                            continue;
                        }

                        let index = name_components[0].parse::<i32>().unwrap_or(-1);
                        let language = if name_components[1] != "unknown" {
                            Some(name_components[1].to_string())
                        } else {
                            None
                        };
                        let title = if name_components.len() > 2 && name_components[2] != "default" {
                            Some(name_components[2].to_string())
                        } else {
                            None
                        };

                        let codec_name = match extension {
                            "ass" => "ass",
                            "ssa" => "ssa",
                            "webvtt" => "webvtt",
                            "srt" => "subrip",
                            _ => "unknown",
                        }.to_string();

                        let url = format!("/cache/subtitles/{}/{}", download_id, filename_str);

                        subtitle_responses.push(SubtitleFileResponse {
                            index,
                            codec_name,
                            language,
                            title,
                            url,
                        });
                    }
                }
            }
        }
        subtitle_responses.sort_by_key(|s| s.index);

        Ok(subtitle_responses)
    }

    pub async fn extract_subtitles_to_files(
        download_id: &str,
        video_path: &str,
    ) -> Result<Vec<SubtitleFileResponse>, String> {
        let subtitles_dir = format!("cache/subtitles/{}", download_id);
        fs::create_dir_all(&subtitles_dir)
            .map_err(|e| format!("Falha ao criar diretório de legendas: {}", e))?;

        let json = Self::run_ffprobe(&[
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            video_path,
        ])
        .await?;

        let mut subtitle_responses = Vec::new();
        let mut extract_tasks = Vec::new();
        let mut seen_languages = std::collections::HashSet::new();

        if let Some(streams_arr) = json.get("streams").and_then(|s| s.as_array()) {
            for stream in streams_arr {
                let codec_type = stream
                    .get("codec_type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                if codec_type != "subtitle" {
                    continue;
                }

                let index = stream
                    .get("index")
                    .and_then(|v| v.as_i64())
                    .unwrap_or(0) as i32;

                let codec_name = stream
                    .get("codec_name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let language = stream
                    .get("tags")
                    .and_then(|t| t.get("language"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                let title = stream
                    .get("tags")
                    .and_then(|tags| {
                        if let Some(obj) = tags.as_object() {
                            for (key, val) in obj.iter() {
                                if key.to_lowercase() == "title" {
                                    return val.as_str().map(|s| s.to_string());
                                }
                            }
                        }
                        None
                    });

                // Skip duplicate languages (keep only first occurrence)
                let lang_key = language.as_deref().unwrap_or("unknown");
                if seen_languages.contains(lang_key) {
                    info!("[StreamManager:{}] Pulando idioma duplicado: {}", download_id, lang_key);
                    continue;
                }
                seen_languages.insert(lang_key.to_string());

                let output_format = match codec_name.as_str() {
                    "ass" | "ssa" => "ass",
                    "webvtt" => "ass",  
                    "subrip" => "ass",  
                    _ => "ass",         
                };

                let output_filename = format!(
                    "{}_{}_{}.{}",
                    index,
                    language.as_deref().unwrap_or("unknown"),
                    title.as_deref().unwrap_or("default"),
                    output_format
                );

                let output_path = format!("{}/{}", subtitles_dir, output_filename);
                let video_path_clone = video_path.to_string();
                let codec_name_clone = codec_name.clone();


                let task = async move {
                    let args = if codec_name_clone == "ass" || codec_name_clone == "ssa" {
                        vec![
                            "-i".to_string(),
                            video_path_clone,
                            "-map".to_string(),
                            format!("0:{}", index),
                            "-c".to_string(),
                            "copy".to_string(),
                            "-y".to_string(),
                            output_path,
                        ]
                    } else {
                        // Convert to ASS format
                        vec![
                            "-i".to_string(),
                            video_path_clone,
                            "-map".to_string(),
                            format!("0:{}", index),
                            "-c".to_string(),
                            "ass".to_string(),
                            "-y".to_string(),
                            output_path,
                        ]
                    };
                    
                    Self::run_ffmpeg(&args.iter().map(|s| s.as_str()).collect::<Vec<_>>())
                    .await
                };

                extract_tasks.push(task);

                let url = format!("/cache/subtitles/{}/{}", download_id, output_filename);

                subtitle_responses.push(SubtitleFileResponse {
                    index,
                    codec_name,
                    language,
                    title,
                    url,
                });
            }
        }

        // Execute all extractions in parallel using join_all
        if extract_tasks.len() > 0 {
            info!("[StreamManager:{}] Extraindo {} idiomas de legendas em paralelo", download_id, extract_tasks.len());
            
            let results = futures::future::join_all(extract_tasks).await;
            
            // Check if any extraction failed
            for (i, result) in results.iter().enumerate() {
                if let Err(e) = result {
                    info!("[StreamManager:{}] Falha ao extrair legenda {}: {}", download_id, i, e);
                    return Err(format!("Falha ao extrair legenda {}: {}", i, e));
                } else {
                    info!("[StreamManager:{}] Legenda extraída com sucesso {}", download_id, i);
                }
            }

            // Verify that files were actually created and have content
            let mut verified_responses = Vec::new();
            for response in subtitle_responses.iter() {
                let file_path = format!("{}/{}", subtitles_dir, response.url.split('/').last().unwrap_or(""));
                match fs::metadata(&file_path) {
                    Ok(metadata) => {
                        let size = metadata.len();
                        if size > 0 {
                            info!("[StreamManager:{}] Arquivo de legenda verificado: {} ({} bytes)", download_id, response.url, size);
                            verified_responses.push(response.clone());
                        } else {
                            info!("[StreamManager:{}] AVISO: Arquivo de legenda está vazio: {}", download_id, response.url);
                        }
                    }
                    Err(e) => {
                        info!("[StreamManager:{}] AVISO: Não foi possível verificar o arquivo de legenda: {} - {}", download_id, response.url, e);
                    }
                }
            }

            if verified_responses.is_empty() {
                return Err("Nenhum arquivo de legenda válido foi extraído".to_string());
            }

            return Ok(verified_responses);
        }

        Ok(subtitle_responses)
    }
}

async fn get_all_streams_by_id(
    Path(id): Path<String>,
    Query(params): Query<FilterQuery>,
) -> Result<Json<AllStreamsResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Extraindo streams", id);
    let video_path = StreamManager::find_video_file(&id)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;

    let filter = match params.filter {
        Some(f) => StreamFilter::from_str(&f)
            .map_err(|e| (StatusCode::BAD_REQUEST, e))?,
        None => StreamFilter::All,
    };

    let streams = StreamManager::extract_all_streams_filtered(&video_path, filter)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(AllStreamsResponse { streams }))
}

async fn get_all_subs_by_id(
    Path(id): Path<String>,
) -> Result<Json<SubtitleFilesResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Extraindo legendas", id);
    
    let cached_subtitles = StreamManager::get_cached_subtitle_files(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    
    if !cached_subtitles.is_empty() {
        info!("[StreamManager:{}] Retornando legendas em cache", id);
        return Ok(Json(SubtitleFilesResponse { subtitles: cached_subtitles }));
    }

    let video_path = StreamManager::find_video_file(&id)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;

    let subtitle_stream_metadata = StreamManager::extract_subtitles_from_file(&video_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let subtitles: Vec<SubtitleFileResponse> = subtitle_stream_metadata
        .into_iter()
        .map(|s| SubtitleFileResponse {
            index: s.index,
            codec_name: s.codec_name,
            language: s.language,
            title: s.title,
            url: String::new(), 
        })
        .collect();

    Ok(Json(SubtitleFilesResponse { subtitles }))
}

async fn get_subs_by_lang(
    Path((id, lang)): Path<(String, String)>,
) -> Result<Json<SubtitleFilesResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Extraindo legendas por idioma: {}", id, lang);
    
    let mut cached_subtitles = StreamManager::get_cached_subtitle_files(&id)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;
    
    if !cached_subtitles.is_empty() {
        info!("[StreamManager:{}] Filtrando legendas em cache por idioma: {}", id, lang);
        cached_subtitles.retain(|sub| {
            sub.language
                .as_ref()
                .map(|l| l.to_lowercase().contains(&lang.to_lowercase()))
                .unwrap_or(false)
        });
        return Ok(Json(SubtitleFilesResponse { subtitles: cached_subtitles }));
    }

    let video_path = StreamManager::find_video_file(&id)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;

    let all_subtitles = StreamManager::extract_subtitles_from_file(&video_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let filtered: Vec<SubtitleFileResponse> = all_subtitles
        .into_iter()
        .filter(|sub| {
            sub.language
                .as_ref()
                .map(|l| l.to_lowercase().contains(&lang.to_lowercase()))
                .unwrap_or(false)
        })
        .map(|s| SubtitleFileResponse {
            index: s.index,
            codec_name: s.codec_name,
            language: s.language,
            title: s.title,
            url: String::new(), // Empty URL when not cached
        })
        .collect();

    Ok(Json(SubtitleFilesResponse { subtitles: filtered }))
}

async fn extract_and_serve_subtitles(
    Path(id): Path<String>,
) -> Result<Json<SubtitleFilesResponse>, (StatusCode, String)> {
    info!("[StreamManager:{}] Extraindo legendas e servindo", id);
    let video_path = StreamManager::find_video_file(&id)
        .map_err(|e| (StatusCode::NOT_FOUND, e))?;

    let subtitles = StreamManager::extract_subtitles_to_files(&id, &video_path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok(Json(SubtitleFilesResponse { subtitles }))
}

pub fn router() -> Router {
    Router::new()
        .route("/subs/:id/:lang", get(get_subs_by_lang))
        .route("/subs/:id", get(get_all_subs_by_id))
        .route("/extract/:id", get(extract_and_serve_subtitles))
        .route("/:id", get(get_all_streams_by_id))
}
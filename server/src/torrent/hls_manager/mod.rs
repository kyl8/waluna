use std::fs::{self, File};
use std::io::{BufReader, BufRead};
use std::collections::HashMap;
use std::sync::Arc;
use std::path::PathBuf;
use axum::{
    extract::{Path, Query},
    routing::get,
    response::Response,
    Router, Json, http::StatusCode,
};
use serde::{Deserialize, Serialize};
use tokio::sync::{oneshot, RwLock, OnceCell};
use tokio::process::Command;
use tracing::{info, warn, error};

use crate::torrent::stream_manager::StreamManager;
const SEGMENT_DURATION: f64 = 1.0;
const HLS_CACHE_DIR: &str = "./cache/hls";
fn ffmpeg_path() -> &'static str {
    static PATH: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();
    PATH.get_or_init(|| {
        if fs::metadata("ffmpeg/bin/ffmpeg.exe").is_ok() {
            "ffmpeg/bin/ffmpeg.exe"
        } else {
            "ffmpeg"
        }
    })
}

fn ffprobe_path() -> &'static str {
    static PATH: std::sync::OnceLock<&'static str> = std::sync::OnceLock::new();
    PATH.get_or_init(|| {
        if fs::metadata("ffmpeg/bin/ffprobe.exe").is_ok() {
            "ffmpeg/bin/ffprobe.exe"
        } else {
            "ffprobe"
        }
    })
}

#[derive(Debug, Clone, Serialize)]
pub struct HLSConversion {
    pub id: String,
    pub input_file: String,
    pub output_dir: String,
    pub status: String,
    pub progress: f64,
    pub duration: f64,
}

#[derive(Debug, Deserialize)]
pub struct HLSConversionQuery {
    file_index: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct HLSStatusResponse {
    pub id: String,
    pub status: String,
    pub segments_count: usize,
    pub segments: Vec<String>,
    pub playlist_url: String,
    pub segment_duration: f64,
    pub is_complete: bool,
    pub total_duration: f64,
    pub duration: f64,
}

pub struct HLSManager {
    conversions: HashMap<String, HLSConversion>,
    cancellations: HashMap<String, oneshot::Sender<()>>,
}

impl HLSManager {
    fn new() -> Self {
        Self {
            conversions: HashMap::new(),
            cancellations: HashMap::new(),
        }
    }

    pub async fn get_manager() -> Arc<RwLock<Self>> {
        static MANAGER: OnceCell<Arc<RwLock<HLSManager>>> = OnceCell::const_new();
        MANAGER.get_or_init(|| async {
            Arc::new(RwLock::new(HLSManager::new()))
        }).await.clone()
    }

    pub async fn start_conversion(id: String, input_file: String) -> Result<(), String> {
        let output_dir = format!("{}/{}", HLS_CACHE_DIR, id);
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Erro ao criar diretório: {}", e))?;

        let duration = Self::get_video_duration(&input_file).await.unwrap_or(0.0);
        info!("[HLS:{}] Duração do vídeo: {:.2}s", id, duration);
        
        let (cancel_tx, cancel_rx) = oneshot::channel();
        {
            let manager = Self::get_manager().await;
            let mut mgr = manager.write().await;
            
            mgr.conversions.insert(id.clone(), HLSConversion {
                id: id.clone(),
                input_file: input_file.clone(),
                output_dir: output_dir.clone(),
                status: if duration <= 0.0 { "waiting_file" } else { "converting" }.to_string(),
                progress: 0.0,
                duration,
            });
            mgr.cancellations.insert(id.clone(), cancel_tx);
        }

        let id_clone = id.clone();
        tokio::spawn(async move {
            Self::run_ffmpeg_conversion(id_clone, input_file, output_dir, duration, cancel_rx).await;
        });

        Ok(())
    }

    pub async fn get_video_duration(input_file: &str) -> Option<f64> {
        info!("[HLS] Detectando duração do arquivo: {}", input_file);
        
        let mut attempts = 0;
        const MAX_DURATION_ATTEMPTS: u32 = 15;
        
        loop {
            let output = Command::new(ffprobe_path())
                .args(&[
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    input_file,
                ])
                .output()
                .await
                .ok()?;

            let duration_str = String::from_utf8_lossy(&output.stdout);
            let duration = duration_str.trim().parse::<f64>().ok();
            
            if let Some(dur) = duration {
                if dur > 0.0 {
                    info!("[HLS] Duração detectada: {:.2}s ({:.2}min)", dur, dur / 60.0);
                    return Some(dur);
                }
            }
            
            attempts += 1;
            
            if attempts >= MAX_DURATION_ATTEMPTS {
                warn!("[HLS] Não foi possível detectar duração após {} tentativas", MAX_DURATION_ATTEMPTS);
                return None;
            }
            
            if attempts % 3 == 0 {
                warn!("[HLS] Duração ainda não detectada (tentativa {}/{}), aguardando arquivo...", 
                      attempts, MAX_DURATION_ATTEMPTS);
            }
            
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
    }

    async fn detect_audio_codec(input_file: &str) -> String {
        let output = Command::new(ffprobe_path())
            .args(&[
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_name",
                "-of", "csv=p=0",
                input_file,
            ])
            .output()
            .await;

        match output {
            Ok(out) => {
                let codec = String::from_utf8_lossy(&out.stdout).trim().to_string();
                info!("[HLS] Codec de áudio detectado: {}", codec);
                codec
            }
            Err(_) => String::new(),
        }
    }

    async fn detect_video_info(input_file: &str) -> (String, i32, i32) {
        let output = Command::new(ffprobe_path())
            .args(&[
                "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=codec_name,width,height",
                "-of", "csv=p=0",
                input_file,
            ])
            .output()
            .await;

        match output {
            Ok(out) => {
                let info = String::from_utf8_lossy(&out.stdout).trim().to_string();
                let parts: Vec<&str> = info.split(',').collect();
                if parts.len() >= 3 {
                    let codec = parts[0].to_string();
                    let width = parts[1].parse().unwrap_or(1920);
                    let height = parts[2].parse().unwrap_or(1080);
                    info!("[HLS] Vídeo detectado: {} {}x{}", codec, width, height);
                    (codec, width, height)
                } else {
                    ("unknown".to_string(), 1920, 1080)
                }
            }
            Err(_) => ("unknown".to_string(), 1920, 1080),
        }
    }

    async fn is_input_readable(input_file: &str) -> bool {
        match Command::new(ffprobe_path())
            .args(&[
                "-v",
                "error",
                "-show_entries",
                "format=format_name",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                input_file,
            ])
            .output()
            .await
        {
            Ok(output) => output.status.success(),
            Err(_) => false,
        }
    }

    async fn run_ffmpeg_conversion(
        id: String,
        input_file: String,
        output_dir: String,
        duration: f64,
        mut cancel_rx: oneshot::Receiver<()>,
    ) {
        info!("[HLS:{}] Iniciando conversão FFmpeg", id);

        Self::update_status(&id, "waiting_file").await;

        let mut input_ready = false;
        let mut wait_attempts = 0;
        const MAX_WAIT_ATTEMPTS: u32 = 120;
        const MIN_FILE_SIZE: u64 = 50 * 1024 * 1024; // 50MB mínimo
    
        while wait_attempts < MAX_WAIT_ATTEMPTS && !input_ready {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
            
            match tokio::fs::metadata(&input_file).await {
                Ok(metadata) => {
                    let file_size = metadata.len();
                    
                    if file_size >= MIN_FILE_SIZE {
                        if Self::is_input_readable(&input_file).await {
                            input_ready = true;
                            info!("[HLS:{}] Input está pronto ({}MB)", id, file_size / 1024 / 1024);
                        } else {
                            wait_attempts += 1;
                            if wait_attempts % 6 == 0 {
                                warn!("[HLS:{}] Input existe ({}/50MB) mas ffprobe não consegue ler (tentativa {}/{})", 
                                      id, file_size / 1024 / 1024, wait_attempts, MAX_WAIT_ATTEMPTS);
                            }
                        }
                    } else {
                        wait_attempts += 1;
                        if wait_attempts % 10 == 0 {
                            warn!("[HLS:{}] Arquivo insuficiente ({}MB/50MB) - aguardando (tentativa {}/{})", 
                                  id, file_size / 1024 / 1024, wait_attempts, MAX_WAIT_ATTEMPTS);
                        }
                    }
                }
                Err(_) => {
                    wait_attempts += 1;
                    if wait_attempts % 10 == 0 {
                        warn!("[HLS:{}] Input não encontrado (tentativa {}/{})", 
                          id, wait_attempts, MAX_WAIT_ATTEMPTS);
                    }
                }
            }

            if let Ok(_) = cancel_rx.try_recv() {
                info!("[HLS:{}] Cancelamento solicitado durante espera por arquivo", id);
                Self::update_status(&id, "cancelled").await;
                return;
            }
        }

        if !input_ready {
            error!("[HLS:{}] Input file nunca ficou pronto ({}s esperado)", 
                   id, MAX_WAIT_ATTEMPTS / 2);
            Self::update_status(&id, "error").await;
            return;
        }

        info!("[HLS:{}] Arquivo pronto, iniciando conversão", id);
        Self::update_status(&id, "converting").await;

        let audio_codec = Self::detect_audio_codec(&input_file).await;
        let (video_codec, width, height) = Self::detect_video_info(&input_file).await;
        
        let audio_args: Vec<&str> = if audio_codec == "aac" {
            info!("[HLS:{}] Áudio AAC detectado, copiando stream", id);
            vec!["-c:a", "copy"]
        } else {
            info!("[HLS:{}] Áudio {} detectado, convertendo para AAC", id, audio_codec);
            vec!["-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "48000"]
        };

        let needs_transcode = video_codec != "h264" || video_codec.contains("hevc") || video_codec.contains("h265");
        
        let video_bitrate = if height >= 1080 { "4000k" } 
                           else if height >= 720 { "2500k" } 
                           else { "1500k" };
        
        let max_bitrate = if height >= 1080 { "5000k" } 
                         else if height >= 720 { "3000k" } 
                         else { "2000k" };
        
        let bufsize = if height >= 1080 { "8000k" } 
                     else if height >= 720 { "5000k" } 
                     else { "3000k" };

        let playlist_path = format!("{}/playlist.m3u8", output_dir);
        let segment_pattern = format!("{}/segment_%05d.ts", output_dir);
        let progress_file = format!("{}/progress.txt", output_dir);

        let keyint = "48";
        let min_keyint = "24";

        let mut args = vec![
            "-hide_banner",
            "-loglevel", "warning",
            "-i", &input_file,
            "-map", "0:v:0",
            "-map", "0:a:0?",
        ];

        if needs_transcode {
            info!("[HLS:{}] Transcodificando {} para H.264", id, video_codec);
            args.extend_from_slice(&[
                "-c:v", "libx264",
                "-preset", "fast",
                "-profile:v", "high",
                "-level", "4.1",
                "-pix_fmt", "yuv420p",
                "-b:v", video_bitrate,
                "-maxrate", max_bitrate,
                "-bufsize", bufsize,
                "-g", keyint,
                "-keyint_min", min_keyint,
                "-sc_threshold", "0",
                "-flags", "+cgop",
                "-movflags", "+faststart",
            ]);
        } else {
            info!("[HLS:{}] Vídeo H.264 detectado, copiando stream", id);
            args.extend_from_slice(&["-c:v", "copy"]);
        }

        args.extend_from_slice(&audio_args);
        
        args.extend_from_slice(&[
            "-f", "hls",
            "-hls_time", "4",
            "-hls_list_size", "0",
            "-hls_segment_filename", &segment_pattern,
            "-hls_flags", "independent_segments+delete_segments+append_list",
            "-hls_segment_type", "mpegts",
            "-hls_allow_cache", "1",
            "-start_number", "0",
            "-progress", &progress_file,
            "-y",
            &playlist_path,
        ]);

        info!("[HLS:{}] Comando: ffmpeg {}", id, args.join(" "));
        
        let mut child = match Command::new(ffmpeg_path())
            .args(&args)
            .current_dir(".")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
        {
            Ok(child) => child,
            Err(e) => {
                error!("[HLS:{}] Erro ao iniciar FFmpeg: {}", id, e);
                Self::update_status(&id, "error").await;
                return;
            }
        };

        let id_clone = id.clone();
        let progress_file_clone = progress_file.clone();
        let (stall_tx, mut stall_rx) = tokio::sync::mpsc::unbounded_channel();
        let monitor = tokio::spawn(async move {
            Self::monitor_progress(&id_clone, &progress_file_clone, duration, stall_tx).await;
        });

        let mut stderr_handle = child.stderr.take();
        let mut finished = false;
        let max_duration_timeout = (duration * 3.0).max(300.0);
        let start_time = std::time::Instant::now();
        
        while !finished {
            tokio::select! {
                _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                    if let Ok(Some(status)) = child.try_wait() {
                        monitor.abort();
                        if status.success() {
                            info!("[HLS:{}] Conversão concluída com sucesso", id);
                            Self::update_status(&id, "completed").await;
                            Self::update_progress(&id, 100.0).await;
                        } else {
                            if let Some(mut stderr) = stderr_handle.take() {
                                use tokio::io::AsyncReadExt;
                                let mut err_output = Vec::new();
                                if let Ok(_) = stderr.read_to_end(&mut err_output).await {
                                    let err_str = String::from_utf8_lossy(&err_output);
                                    if !err_str.is_empty() {
                                        error!("[HLS:{}] FFmpeg stderr: {}", id, err_str);
                                    }
                                }
                            }
                            error!("[HLS:{}] FFmpeg saiu com código: {:?}", id, status.code());
                            Self::update_status(&id, "error").await;
                        }
                        finished = true;
                    }
                    
                    if start_time.elapsed().as_secs_f64() > max_duration_timeout {
                        error!("[HLS:{}] Timeout global de conversão ({}s)", id, max_duration_timeout);
                        let _ = child.kill().await;
                        monitor.abort();
                        Self::update_status(&id, "error").await;
                        finished = true;
                    }
                }
                _ = stall_rx.recv() => {
                    error!("[HLS:{}] Processo FFmpeg travou (sem progresso). Matando...", id);
                    if let Some(mut stderr) = stderr_handle.take() {
                        use tokio::io::AsyncReadExt;
                        let mut err_output = Vec::new();
                        let _ = tokio::time::timeout(
                            tokio::time::Duration::from_secs(2),
                            stderr.read_to_end(&mut err_output)
                        ).await;
                        let err_str = String::from_utf8_lossy(&err_output);
                        if !err_str.is_empty() {
                            error!("[HLS:{}] FFmpeg stderr antes do stall: {}", id, err_str);
                        }
                    }
                    let _ = child.kill().await;
                    monitor.abort();
                    Self::update_status(&id, "error").await;
                    finished = true;
                }
                _ = &mut cancel_rx => {
                    info!("[HLS:{}] Cancelamento solicitado pelo usuário", id);
                    let _ = child.kill().await;
                    monitor.abort();
                    Self::update_status(&id, "cancelled").await;
                    finished = true;
                }
            }
        }

        {
            let manager = Self::get_manager().await;
            let mut mgr = manager.write().await;
            mgr.cancellations.remove(&id);
        }

        let _ = fs::remove_file(&progress_file);
    }

    async fn monitor_progress(id: &str, progress_file: &str, duration: f64, stall_tx: tokio::sync::mpsc::UnboundedSender<()>) {
        let mut last_time_ms: i64 = 0;
        let mut stall_counter = 0;
        let stall_limit = 180; // 90 segundos sem progresso (180 x 500ms) - mais tolerante

        loop {
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

            if let Ok(file) = File::open(progress_file) {
                let reader = BufReader::new(file);
                let mut current_time_ms: i64 = 0;

                for line in reader.lines().flatten() {
                    if line.starts_with("out_time_ms=") {
                        if let Ok(ms) = line.trim_start_matches("out_time_ms=").parse::<i64>() {
                            current_time_ms = ms;
                        }
                    }
                }

                if duration > 0.0 {
                    let current_time = current_time_ms as f64 / 1_000_000.0;
                    let progress = (current_time / duration * 100.0).min(100.0);
                    
                    // Detecta stall com base no tempo absoluto (não porcentagem)
                    // Diferença menor que 100ms = sem progresso real
                    if (current_time_ms - last_time_ms).abs() < 100_000 {
                        stall_counter += 1;
                        if stall_counter % 30 == 0 {  // Log a cada 15 segundos
                            warn!("[HLS:{}] Progresso preso em {:.2}% ({:.1}s) por {}s", 
                                  id, progress, current_time, stall_counter / 2);
                        }
                        if stall_counter >= stall_limit {
                            error!("[HLS:{}] FFmpeg travou (sem progresso por 90s em {:.1}s). Abortando...", 
                                   id, current_time);
                            let _ = stall_tx.send(());
                            break;
                        }
                    } else {
                        stall_counter = 0;
                        last_time_ms = current_time_ms;
                    }
                    
                    Self::update_progress(id, progress).await;
                }
            }
        }
    }

    async fn update_status(id: &str, status: &str) {
        let manager = Self::get_manager().await;
        let mut mgr = manager.write().await;
        if let Some(conv) = mgr.conversions.get_mut(id) {
            conv.status = status.to_string();
        }
    }

    async fn update_progress(id: &str, progress: f64) {
        let manager = Self::get_manager().await;
        let mut mgr = manager.write().await;
        if let Some(conv) = mgr.conversions.get_mut(id) {
            conv.progress = progress;
        }
    }
}

async fn start_hls_conversion(
    Path(id): Path<String>,
    Query(params): Query<HLSConversionQuery>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let file_index = params.file_index;
    
    let input_file = if let Some(index) = file_index {
        info!("[HLS:{}] Buscando arquivo índice {}", id, index);
        match StreamManager::find_video_file_by_index(&id, index) {
            Ok(path) => path,
            Err(e) => {
                error!("[HLS:{}] Arquivo não encontrado: {}", id, e);
                return Ok(Json(serde_json::json!({
                    "ok": false,
                    "error": e,
                    "hint": "Use /streams/files/:id para listar arquivos",
                    "id": id
                })));
            }
        }
    } else {
        match StreamManager::find_video_file(&id) {
            Ok(path) => path,
            Err(e) => {
                if let Ok(files) = StreamManager::list_video_files(&id) {
                    if files.len() > 1 {
                        return Ok(Json(serde_json::json!({
                            "ok": false,
                            "error": "Torrent com múltiplos arquivos. Especifique file_index.",
                            "hint": "Adicione ?file_index=N à URL",
                            "available_files": files,
                            "is_multi_file": true,
                            "id": id
                        })));
                    }
                }
                return Ok(Json(serde_json::json!({
                    "ok": false,
                    "error": e,
                    "id": id
                })));
            }
        }
    };

    info!("[HLS:{}] Arquivo: {}", id, input_file);

    let conversion_id = if let Some(index) = file_index {
        format!("{}_{}", id, index)
    } else {
        id.clone()
    };

    match HLSManager::start_conversion(conversion_id.clone(), input_file).await {
        Ok(_) => Ok(Json(serde_json::json!({
            "ok": true,
            "message": "Conversão HLS iniciada",
            "id": conversion_id,
            "original_id": id,
            "file_index": file_index,
            "status": "processing"
        }))),
        Err(e) => {
            error!("[HLS:{}] Erro ao iniciar: {}", id, e);
            Ok(Json(serde_json::json!({
                "ok": false,
                "error": e,
                "id": id
            })))
        }
    }
}

async fn get_hls_status(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    let manager = HLSManager::get_manager().await;
    let mgr = manager.read().await;

    let hls_id = if mgr.conversions.contains_key(&id) {
        id.clone()
    } else if !id.contains('_') {
        let id_with_suffix = format!("{}_0", id);
        if mgr.conversions.contains_key(&id_with_suffix) {
            id_with_suffix
        } else {
            id.clone()
        }
    } else {
        id.clone()
    };

    if let Some(conv) = mgr.conversions.get(&hls_id) {
        let is_running = mgr.cancellations.contains_key(&hls_id);
        
        Ok(Json(serde_json::json!({
            "id": conv.id,
            "input_file": conv.input_file,
            "output_dir": conv.output_dir,
            "status": conv.status,
            "progress": conv.progress,
            "duration": conv.duration,
            "is_running": is_running
        })))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

async fn get_hls_segments(Path(id): Path<String>) -> Response {
    info!("[HLS:{}] Requisição de status", id);
    
    let hls_id = resolve_hls_id(&id);
    let hls_dir = format!("{}/{}", HLS_CACHE_DIR, hls_id);
    
    if !std::path::Path::new(&hls_dir).exists() {
        info!("[HLS:{}] Diretório não existe, tentando conversão automática", id);
        
        // Extrair file_index do id (formato: download_id_fileindex)
        let (download_id, file_index) = if let Some(pos) = id.rfind('_') {
            if let Ok(idx) = id[pos+1..].parse::<usize>() {
                (&id[..pos], Some(idx))
            } else {
                (id.as_str(), None)
            }
        } else {
            (id.as_str(), None)
        };
        
        let input_file_result = if let Some(idx) = file_index {
            StreamManager::find_video_file_by_index(download_id, idx)
        } else {
            StreamManager::find_video_file(&id)
        };
        
        if let Ok(input_file) = input_file_result {
            let conversion_id = if hls_id == id {
                format!("{}_0", id)
            } else {
                hls_id.clone()
            };
            
            if let Err(e) = HLSManager::start_conversion(conversion_id.clone(), input_file).await {
                return json_error_response(404, &id, format!("Erro ao iniciar: {}", e));
            }
            
            // Aguardar segmentos
            tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            return build_segments_response(&conversion_id).await;
        }
        
        return json_error_response(404, &id, "Arquivo não encontrado".to_string());
    }
    
    build_segments_response(&hls_id).await
}

fn resolve_hls_id(id: &str) -> String {
    if id.contains('_') {
        let parts: Vec<&str> = id.rsplitn(2, '_').collect();
        if parts.len() == 2 && parts[0].parse::<usize>().is_ok() {
            return id.to_string();
        }
    }
    
    let hls_dir_0 = format!("{}/{}_0", HLS_CACHE_DIR, id);
    if std::path::Path::new(&hls_dir_0).exists() {
        format!("{}_0", id)
    } else {
        id.to_string()
    }
}

async fn build_segments_response(id: &str) -> Response {
    let hls_dir = PathBuf::from(HLS_CACHE_DIR).join(id);
    let playlist_path = hls_dir.join("playlist.m3u8");
    let is_complete = fs::read_to_string(&playlist_path)
        .map(|c| c.contains("#EXT-X-ENDLIST"))
        .unwrap_or(false);
    
    let mut segments = Vec::new();
    if let Ok(entries) = fs::read_dir(&hls_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("ts") {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    segments.push(name.to_string());
                }
            }
        }
    }
    segments.sort();
    
    let segments_count = segments.len();
    if segments_count == 0 {
        let manager = HLSManager::get_manager().await;
        let mgr = manager.read().await;
        if mgr.conversions.get(id).is_none() {
            return json_error_response(404, id, "HLS não encontrado".to_string());
        }
    }

    let mut duration = {
        let manager = HLSManager::get_manager().await;
        let mgr = manager.read().await;
        mgr.conversions.get(id).map(|c| c.duration).unwrap_or(0.0)
    };
    
    if duration <= 0.0 {
        let download_id = if let Some(pos) = id.rfind('_') {
            if id[pos+1..].parse::<usize>().is_ok() {
                &id[..pos]
            } else {
                id
            }
        } else {
            id
        };
        
        // Extrair file_index do hls_id (formato: download_id_fileindex)
        let file_index = if let Some(pos) = id.rfind('_') {
            id[pos+1..].parse::<usize>().ok()
        } else {
            None
        };
        
        let video_path_result = if let Some(idx) = file_index {
            StreamManager::find_video_file_by_index(download_id, idx)
        } else {
            StreamManager::find_video_file(download_id)
        };
        
        if let Ok(video_path) = video_path_result {
            if let Some(dur) = HLSManager::get_video_duration(&video_path).await {
                duration = dur;
                info!("[HLS:{}] Duração obtida do arquivo: {:.2}s", id, duration);
                let manager = HLSManager::get_manager().await;
                let mut mgr = manager.write().await;
                if let Some(conv) = mgr.conversions.get_mut(id) {
                    conv.duration = duration;
                }
            }
        }
    }
    
    let response = HLSStatusResponse {
        id: id.to_string(),
        status: if is_complete { "completed".to_string() } else { "converting".to_string() },
        segments_count,
        segments,
        playlist_url: format!("http://127.0.0.1:8080/hls/playlist/{}", id),
        segment_duration: SEGMENT_DURATION,
        is_complete,
        total_duration: if duration > 0.0 { duration } else { segments_count as f64 * SEGMENT_DURATION },
        duration,
    };
    
    info!("[HLS:{}] Status: {} | Segmentos: {} | Duração: {:.2}s | Completo: {}", 
        id, response.status, segments_count, duration, is_complete);
    
    json_success_response(response)
}

async fn serve_playlist(Path(id): Path<String>) -> Response {
    if id.ends_with(".ts") {
        return json_error_response(400, &id, "Acesso a segmento deve usar /hls/segments/:id/:segment".to_string());
    }
    
    let playlist_path = format!("{}/{}/playlist.m3u8", HLS_CACHE_DIR, id);
    
    match fs::read_to_string(&playlist_path) {
        Ok(content) => {
            let rewritten_content = content
                .lines()
                .map(|line| {
                    if line.ends_with(".ts") && !line.starts_with('#') {
                        format!("{}/{}", id, line)
                    } else {
                        line.to_string()
                    }
                })
                .collect::<Vec<_>>()
                .join("\n");
            
            Response::builder()
                .status(200)
                .header("Content-Type", "application/vnd.apple.mpegurl")
                .header("Access-Control-Allow-Origin", "*")
                .header("Cache-Control", "no-cache")
                .body(rewritten_content.into())
                .unwrap()
        }
        Err(_) => {
            json_error_response(404, &id, "Playlist não encontrada".to_string())
        }
    }
}

async fn serve_segment(Path((id, segment)): Path<(String, String)>) -> Response {
    let segment_path = format!("{}/{}/{}", HLS_CACHE_DIR, id, segment);
    
    match fs::read(&segment_path) {
        Ok(data) => {
            Response::builder()
                .status(200)
                .header("Content-Type", "video/mp2t")
                .header("Access-Control-Allow-Origin", "*")
                .header("Cache-Control", "max-age=31536000")
                .body(data.into())
                .unwrap()
        }
        Err(_) => {
            warn!("[HLS:{}] Segmento não encontrado: {}", id, segment);
            Response::builder()
                .status(404)
                .body("Segmento não encontrado".into())
                .unwrap()
        }
    }
}

async fn stop_hls_conversion(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    let manager = HLSManager::get_manager().await;
    let mut mgr = manager.write().await;
    
    if let Some(sender) = mgr.cancellations.remove(&id) {
        let _ = sender.send(());
        
        if let Some(conv) = mgr.conversions.get_mut(&id) {
            conv.status = "cancelling".to_string();
        }
        
        Ok(Json(serde_json::json!({
            "ok": true,
            "message": "Cancelamento solicitado",
            "id": id
        })))
    } else {
        Ok(Json(serde_json::json!({
            "ok": false,
            "message": "Conversão não encontrada ou já finalizada",
            "id": id
        })))
    }
}

async fn resume_hls_conversion(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    let manager = HLSManager::get_manager().await;
    let mgr = manager.read().await;
    
    if let Some(conv) = mgr.conversions.get(&id) {
        if mgr.cancellations.contains_key(&id) {
            return Ok(Json(serde_json::json!({
                "ok": false,
                "message": "Conversão já está em execução",
                "id": id
            })));
        }

        let input = conv.input_file.clone();
        drop(mgr);

        if !std::path::Path::new(&input).exists() {
            return Ok(Json(serde_json::json!({
                "ok": false,
                "message": "Arquivo de entrada não encontrado",
                "id": id
            })));
        }

        match HLSManager::start_conversion(id.clone(), input).await {
            Ok(_) => Ok(Json(serde_json::json!({
                "ok": true,
                "message": "Conversão retomada",
                "id": id
            }))),
            Err(e) => Ok(Json(serde_json::json!({
                "ok": false,
                "message": format!("Falha ao retomar: {}", e),
                "id": id
            }))),
        }
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}


async fn delete_cache(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    info!("[HLS:{}] Removendo cache", id);
    
    let mut removed = Vec::new();
    let hls_dir = format!("{}/{}", HLS_CACHE_DIR, id);
    if std::path::Path::new(&hls_dir).exists() {
        if let Err(e) = fs::remove_dir_all(&hls_dir) {
            error!("[HLS:{}] Erro ao remover diretório: {}", id, e);
            return Ok(Json(serde_json::json!({
                "ok": false,
                "error": format!("Erro ao remover: {}", e),
                "id": id
            })));
        }
        removed.push("hls_dir");
    }

    let subtitle_dir = format!("./cache/subtitles/{}", id);
    if std::path::Path::new(&subtitle_dir).exists() {
        if let Ok(_) = fs::remove_dir_all(&subtitle_dir) {
            removed.push("subtitle_dir");
        }
    }

    {
        let manager = HLSManager::get_manager().await;
        let mut mgr = manager.write().await;
        if mgr.conversions.remove(&id).is_some() {
            removed.push("manager_entry");
        }
    }

    if removed.is_empty() {
        Ok(Json(serde_json::json!({
            "ok": false,
            "message": "Nenhum cache encontrado",
            "id": id
        })))
    } else {
        Ok(Json(serde_json::json!({
            "ok": true,
            "removed": removed,
            "id": id
        })))
    }
}

fn json_error_response(status: u16, id: &str, message: String) -> Response {
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(serde_json::json!({
            "id": id,
            "status": "error",
            "error": message
        }).to_string().into())
        .unwrap()
}

fn json_success_response<T: Serialize>(data: T) -> Response {
    let body = serde_json::to_string(&data).unwrap_or_default();
    Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Cache-Control", "no-cache")
        .header("Access-Control-Allow-Origin", "*")
        .body(body.into())
        .unwrap()
}

pub fn router() -> Router {
    Router::new()
        .route("/", get(|| async { "HLS Manager is running" }))
        .route("/playlist/:id", get(serve_playlist))
        .route("/playlist/:id/:segment", get(serve_segment)) // Segmentos via playlist path
        .route("/segments/:id/:segment", get(serve_segment))
        .route("/convert/:id", get(start_hls_conversion))
        .route("/start/:id", get(start_hls_conversion))
        .route("/delete/:id", get(delete_cache))
        .route("/stop_conversion/:id", get(stop_hls_conversion))
        .route("/resume_conversion/:id", get(resume_hls_conversion))
        .route("/status/:id", get(get_hls_segments))
        .route("/info/:id", get(get_hls_status))
}

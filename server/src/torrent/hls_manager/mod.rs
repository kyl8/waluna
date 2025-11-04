use axum::{
    extract::Path,
    response::Response,
    routing::get,
    Router,
    Json,
    http::StatusCode,
};
use std::fs;
use std::sync::Arc;
use tokio::sync::RwLock;
use std::collections::HashMap;
use tracing::{info, error, warn, debug};
use std::process::Command;


static HLS_MANAGER: tokio::sync::OnceCell<Arc<RwLock<HLSManager>>> = tokio::sync::OnceCell::const_new();

#[derive(Clone, Debug, serde::Serialize)]
pub struct HLSConversion {
    pub id: String,
    pub input_file: String,
    pub output_dir: String,
    pub status: String,
    pub progress: f64,
    pub duration: f64,  //duração do arquivo em segundos
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct AudioCodecInfo {
    pub codec_name: String,
    pub sample_rate: Option<u32>,
    pub channels: Option<u32>,
    pub bit_rate: Option<u32>,
    pub needs_conversion: bool,
}

pub struct HLSManager {
    conversions: HashMap<String, HLSConversion>,
    cancellations: HashMap<String, tokio::sync::oneshot::Sender<()>>,
}

impl Clone for HLSManager {
    fn clone(&self) -> Self {
        Self {
            conversions: self.conversions.clone(),
            cancellations: HashMap::new(),
        }
    }
}

impl HLSManager {
    pub fn new() -> Self {
        Self {
            conversions: HashMap::new(),
            cancellations: HashMap::new(),
        }
    }

    async fn get_manager() -> Arc<RwLock<HLSManager>> {
        HLS_MANAGER
            .get_or_init(|| async {
                Arc::new(RwLock::new(HLSManager::new()))
            })
            .await
            .clone()
    }

    // Inicia a conversão de um arquivo para HLS
    pub async fn start_conversion(
        id: String,
        input_file: String,
    ) -> anyhow::Result<String> {
        let output_dir = format!("./cache/hls/{}", id);
        
        // Criar diretório se não existir
        std::fs::create_dir_all(&output_dir)?;
        info!("[HLS:{}] 📁 Diretório criado: {}", id, output_dir);
        
        // Detectar duração do arquivo
        let duration = match Self::detect_duration(&input_file) {
            Ok(dur) => dur,
            Err(e) => {
                warn!("[HLS:{}] ⚠️  Erro ao detectar duração: {}", id, e);
                0.0
            }
        };
        
        let manager = Self::get_manager().await;
        {
            let mut mgr = manager.write().await;
            
            let conversion = HLSConversion {
                id: id.clone(),
                input_file: input_file.clone(),
                output_dir: output_dir.clone(),
                status: "converting".to_string(),
                progress: 0.0,
                duration,
            };
            
            mgr.conversions.insert(id.clone(), conversion);
        }
        
        // Spawnar processo FFmpeg em background with cancellation support
        let id_clone = id.clone();
        let output_dir_clone = output_dir.clone();
        let input_file_clone = input_file.clone();
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        {
            let mut mgr = manager.write().await;
            mgr.cancellations.insert(id.clone(), tx);
        }

        tokio::spawn(async move {
            if let Err(e) = Self::run_ffmpeg(
                &id_clone,
                &input_file_clone,
                &output_dir_clone,
                rx,
            ).await {
                error!("[HLS:{}] 💥 Erro na conversão: {}", id_clone, e);

                let manager = Self::get_manager().await;
                let mut mgr = manager.write().await;
                if let Some(conv) = mgr.conversions.get_mut(&id_clone) {
                    conv.status = format!("erro: {}", e);
                }
            }
        });
        
        info!(
            "[HLS:{}] 🚀 Conversão iniciada\n  Entrada: {}\n  Duração: {:.2}s\n  Saída: {}",
            id,
            input_file,
            duration,
            output_dir
        );
        Ok(id)
    }

    /// Executa FFmpeg para converter para HLS
    async fn run_ffmpeg(
        id: &str,
        input_file: &str,
        output_dir: &str,
        mut cancel_rx: tokio::sync::oneshot::Receiver<()>,
    ) -> anyhow::Result<()> {
        // Detecta codec de áudio primeiro
        let audio_codec_info = match Self::detect_audio_codec(input_file) {
            Ok(info) => info,
            Err(e) => {
                warn!("[HLS:{}] ⚠️  Não foi possível detectar codec: {}", id, e);
                AudioCodecInfo {
                    codec_name: "unknown".to_string(),
                    sample_rate: None,
                    channels: None,
                    bit_rate: None,
                    needs_conversion: false,
                }
            }
        };

        // Usa caminhos absolutos
        let output_dir_abs = std::path::PathBuf::from(output_dir);
        let playlist_path = output_dir_abs.join("playlist.m3u8");
        let segment_pattern = output_dir_abs.join("segment_%03d.ts");
        
        let playlist_str = playlist_path.to_string_lossy().to_string();
        let segment_str = segment_pattern.to_string_lossy().to_string();
        
        let codec_name_clone = audio_codec_info.codec_name.clone();
        let needs_conversion = audio_codec_info.needs_conversion;
        
        use std::path::PathBuf;
        use std::process::Stdio;

        // Pega caminho do projeto dinamicamente
        let project_root = std::env::current_dir()
            .ok()
            .and_then(|cwd| {
                let path_str = cwd.to_string_lossy();
                if path_str.contains("target") {
                    cwd.parent().map(|p| p.to_path_buf())
                } else {
                    Some(cwd)
                }
            })
            .unwrap_or_else(|| PathBuf::from("."));

        let ffmpeg_path = if cfg!(windows) {
            project_root.join("ffmpeg/bin/ffmpeg.exe")
        } else {
            project_root.join("ffmpeg/bin/ffmpeg")
        };

        info!(
            "[HLS:{}] 🎬 FFmpeg iniciando\n  Caminho: {}\n  Entrada: {}\n  Codec de áudio: {} (precisa conversão: {})\n  Saída: {}\n  Segmentos: {}",
            id,
            ffmpeg_path.display(),
            input_file,
            codec_name_clone,
            needs_conversion,
            playlist_str,
            segment_str
        );

        let mut cmd = tokio::process::Command::new(&ffmpeg_path);

        cmd.args(&[
            "-copyts",
            "-start_at_zero",
            "-i", input_file,
            "-async", "1",
            "-vsync", "1",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-tune", "zerolatency",
            "-b:v", "2500k",
            "-maxrate", "2500k",
            "-bufsize", "5000k",
            "-g", "48",
            "-keyint_min", "48",
            "-sc_threshold", "0",
            "-force_key_frames", "expr:gte(t,n_forced*1)",
            "-x264-params", "nal-hrd=cbr:force-cfr=1",
        ]);

        if needs_conversion {
            cmd.args(&[
                "-c:a", "aac",
                "-b:a", "192k",
                "-ac", "2",
            ]);
        } else {
            cmd.args(&[
                "-c:a", "aac",
                "-b:a", "128k",
            ]);
        }

        cmd.args(&[
            "-hls_time", "1",
            "-hls_flags", "delete_segments+append_list+omit_endlist",
            "-hls_segment_type", "mpegts",
            "-hls_playlist_type", "event",
            "-hls_segment_filename", &segment_str,
            &playlist_str,
        ]);

        cmd.stdout(Stdio::null());
        cmd.stderr(Stdio::null());

        match cmd.spawn() {
            Ok(mut child) => {
                loop {
                    tokio::select! {
                        status = child.wait() => {
                            match status {
                                Ok(exit) => {
                                    if exit.success() {
                                        info!("[HLS:{}] ✅ Conversão completa", id);
                                        let manager = Self::get_manager().await;
                                        let mut mgr = manager.write().await;
                                        if let Some(conv) = mgr.conversions.get_mut(id) {
                                            conv.progress = 100.0;
                                            conv.status = "completed".to_string();
                                        }
                                        mgr.cancellations.remove(id);
                                    } else {
                                        error!("[HLS:{}] ❌ Conversão finalizada com código: {}", id, exit);
                                        let manager = Self::get_manager().await;
                                        let mut mgr = manager.write().await;
                                        if let Some(conv) = mgr.conversions.get_mut(id) {
                                            conv.status = format!("error: {}", exit);
                                        }
                                        mgr.cancellations.remove(id);
                                    }
                                }
                                Err(e) => {
                                    error!("[HLS:{}] ⚠️  Erro ao aguardar processo FFmpeg: {}", id, e);
                                }
                            }
                            break; 
                        }
                        _ = &mut cancel_rx => {
                            info!("[HLS:{}] 🛑 Cancel requested, killing ffmpeg process", id);
                            if let Err(e) = child.kill().await {
                                error!("[HLS:{}] ❌ Falha ao matar processo FFmpeg: {}", id, e);
                            } else {
                                info!("[HLS:{}] ✅ Processo FFmpeg morto", id);
                            }
                            let manager = Self::get_manager().await;
                            let mut mgr = manager.write().await;
                            if let Some(conv) = mgr.conversions.get_mut(id) {
                                conv.status = "cancelled".to_string();
                            }
                            mgr.cancellations.remove(id);
                            break; 
                        }
                        _ = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {
                            let mut segments_count = 0usize;
                            if let Ok(entries) = std::fs::read_dir(output_dir) {
                                for entry in entries.flatten() {
                                    let path = entry.path();
                                    if path.extension().and_then(|s| s.to_str()) == Some("ts") {
                                        segments_count += 1;
                                    }
                                }
                            }

                            let segment_duration = 1.0_f64; 
                            let manager = Self::get_manager().await;
                            let conv_duration = manager.read().await.conversions.get(id).map(|c| c.duration).unwrap_or(0.0);

                            let mut progress = if conv_duration > 0.0 {
                                let total_secs = segments_count as f64 * segment_duration;
                                (total_secs / conv_duration) * 100.0
                            } else {
                                (segments_count as f64 * segment_duration).min(100.0)
                            };
                            if progress.is_nan() || progress.is_infinite() {
                                progress = 0.0;
                            }
                            if progress > 100.0 { progress = 100.0; }

                            let manager = Self::get_manager().await;
                            let mut mgr = manager.write().await;
                            if let Some(conv) = mgr.conversions.get_mut(id) {
                                conv.progress = progress;
                                if conv.status == "iniciando" || conv.status == "" {
                                    conv.status = "converting".to_string();
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("[HLS:{}] ⚠️  Erro ao executar FFmpeg: {}\n  Caminho: {}\n  Verifique se o arquivo existe: {}", id, e, ffmpeg_path.display(), input_file);
            }
        }
        
        // Atualizar status
        let manager = Self::get_manager().await;
        let mut mgr = manager.write().await;
        if let Some(conv) = mgr.conversions.get_mut(id) {
            conv.status = "cancelled".to_string();
            conv.progress = None.unwrap_or(-1.0);
        }
        
        info!("[HLS:{}] ✅ Status atualizado para 'cancelado'", id);
        Ok(())
    }

    /// Obter status da conversão
    #[allow(dead_code)]
    pub async fn get_status(id: &str) -> Option<HLSConversion> {
        let manager = Self::get_manager().await;
        let mgr = manager.read().await;
        mgr.conversions.get(id).cloned()
    }

    /// Detecta codec de áudio usando ffprobe
    fn detect_audio_codec(input_file: &str) -> anyhow::Result<AudioCodecInfo> {
        use std::path::PathBuf;
        use std::process::Stdio;

        let project_root = std::env::current_dir()
            .ok()
            .and_then(|cwd| {
                let path_str = cwd.to_string_lossy();
                if path_str.contains("target") {
                    cwd.parent().map(|p| p.to_path_buf())
                } else {
                    Some(cwd)
                }
            })
            .unwrap_or_else(|| PathBuf::from("."));

        let ffprobe_path = if cfg!(windows) {
            project_root.join("ffmpeg/bin/ffprobe.exe")
        } else {
            project_root.join("ffmpeg/bin/ffprobe")
        };

        debug!("🔍 Detectando codec de áudio em: {}", input_file);

        let output = Command::new(&ffprobe_path)
            .args([
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_name,sample_rate,channels,bit_rate",
                "-of", "default=noprint_wrappers=1:nokey=1:nokey=0",
                input_file,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()?;

        let probe_output = String::from_utf8_lossy(&output.stdout);
        let lines: Vec<&str> = probe_output.lines().collect();
        let codec_name = if let Some(line) = lines.first() {
            line.to_string()
        } else {
            "unknown".to_string()
        };

        let sample_rate = lines.get(1).and_then(|s| s.parse::<u32>().ok());
        let channels = lines.get(2).and_then(|s| s.parse::<u32>().ok());
        let bit_rate = lines.get(3).and_then(|s| s.parse::<u32>().ok());

        // Codecs que NÃO são suportados por players HTML5 via HLS
        let incompatible_codecs = ["eac3", "ac3", "truehd", "dts", "flac"];
        let needs_conversion = incompatible_codecs
            .iter()
            .any(|&codec| codec_name.to_lowercase().contains(codec));

        let codec_info = AudioCodecInfo {
            codec_name: codec_name.clone(),
            sample_rate,
            channels,
            bit_rate,
            needs_conversion,
        };

        if needs_conversion {
            warn!(
                "⚠️  Codec de áudio não compatível detectado: {} | Será convertido para AAC",
                codec_name
            );
        } else {
            info!("✅ Codec de áudio compatível: {}", codec_name);
        }

        Ok(codec_info)
    }

    /// Detecta a duração do arquivo usando ffprobe
    fn detect_duration(input_file: &str) -> anyhow::Result<f64> {
        use std::path::PathBuf;
        use std::process::Stdio;

        let project_root = std::env::current_dir()
            .ok()
            .and_then(|cwd| {
                let path_str = cwd.to_string_lossy();
                if path_str.contains("target") {
                    cwd.parent().map(|p| p.to_path_buf())
                } else {
                    Some(cwd)
                }
            })
            .unwrap_or_else(|| PathBuf::from("."));

        let ffprobe_path = if cfg!(windows) {
            project_root.join("ffmpeg/bin/ffprobe.exe")
        } else {
            project_root.join("ffmpeg/bin/ffprobe")
        };

        debug!("⏱️  Detectando duração em: {}", input_file);

        let output = Command::new(&ffprobe_path)
            .args([
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                input_file,
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()?;

        let probe_output = String::from_utf8_lossy(&output.stdout);
        let duration_str = probe_output.trim();

        match duration_str.parse::<f64>() {
            Ok(duration) => {
                info!("⏱️  Duração detectada: {:.2}s ({:.2}min)", duration, duration / 60.0);
                Ok(duration)
            }
            Err(_) => {
                warn!("⚠️  Não foi possível detectar duração, usando valor padrão");
                Ok(0.0)
            }
        }
    }
}

async fn serve_playlist(Path(id): Path<String>) -> Response {
    let path = format!("./cache/hls/{}/playlist.m3u8", id);
    match fs::read_to_string(&path) {
        Ok(content) => {
            // Obter duration do HLSManager
            let manager = HLSManager::get_manager().await;
            let mgr = manager.read().await;
            let duration = mgr.conversions
                .get(&id)
                .map(|conv| conv.duration)
                .unwrap_or(0.0);
            drop(mgr);
            
            // Processar linhas e injetar duration no final
            let lines: Vec<&str> = content.lines().collect();
            let mut modified_lines = Vec::new();
            
            for line in lines.iter() {
                // Reescrever URLs de segmentos (relativas → absolutas)
                if line.ends_with(".ts") && !line.starts_with("#") && !line.starts_with("http") {
                    modified_lines.push(format!("http://127.0.0.1:8080/hls/segments/{}/{}", id, line));
                } else {
                    modified_lines.push(line.to_string());
                }
            }
            
            // Injetar #EXT-X-DURATION antes de #EXT-X-ENDLIST (se existir)
            if let Some(endlist_pos) = modified_lines.iter().position(|line| line == "#EXT-X-ENDLIST") {
                modified_lines.insert(endlist_pos, format!("#EXT-X-DURATION:{:.2}", duration));
            }
            
            let modified_content = modified_lines.join("\n");
            
            info!("[HLS:{}] 📡 Servindo playlist M3U8 com URLs reescritas e duration injetada no final: {:.2}s", id, duration);
            debug!("[HLS:{}] Playlist reescrita:\n{}", id, modified_content);
            
            Response::builder()
                .status(200)
                .header("Content-Type", "application/vnd.apple.mpegurl")
                .header("Cache-Control", "no-cache, no-store, must-revalidate")
                .body(modified_content.into())
                .unwrap()
        },
        Err(_) => {
            error!("[HLS:{}] ❌ Playlist não encontrado", id);
            Response::builder()
                .status(404)
                .body("playlist not found".into())
                .unwrap()
        }
    }
}

async fn serve_segment(Path((id, segment)): Path<(String, String)>) -> Response {
    let path = format!("./cache/hls/{}/{}", id, segment);
    match fs::read(&path) {
        Ok(data) => {
            debug!("[HLS:{}] 📹 Servindo segment: {}", id, segment);
            Response::builder()
                .status(200)
                .header("Content-Type", "video/MP2T")
                .header("Cache-Control", "public, max-age=3600")
                .body(data.into())
                .unwrap()
        },
        Err(_) => {
            warn!("[HLS:{}] ⚠️  Segment não encontrado: {}", id, segment);
            Response::builder()
                .status(404)
                .body("segment not found".into())
                .unwrap()
        }
    }
}

async fn start_hls_conversion(
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    use std::path::Path as StdPath;
    
    // Primeiro, procura em ./cache/downloads/ por qualquer arquivo
    let downloads_dir = "./cache/downloads";
    
    let mut input_file = None;
    
    // Tenta encontrar direto com o ID
    let direct_path = format!("{}/{}", downloads_dir, id);
    if StdPath::new(&direct_path).exists() && StdPath::new(&direct_path).is_file() {
        input_file = Some(direct_path);
    }
    
    // Se não encontrar, procura por um arquivo que contenha o ID no nome ou listar tudo
    if input_file.is_none() {
        if let Ok(entries) = std::fs::read_dir(downloads_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    // Se o arquivo contém o ID no nome, usar ele
                    if path.to_string_lossy().contains(&id) {
                        input_file = Some(path.to_string_lossy().to_string());
                        break;
                    }
                }
            }
        }
    }
    
    // Se ainda não encontrou, tenta com simples caminhos alternativos
    if input_file.is_none() {
        let possible_paths = vec![
            format!("./cache/{}", id),
            format!("./{}", id),
        ];
        
        for path in possible_paths {
            if StdPath::new(&path).exists() && StdPath::new(&path).is_file() {
                input_file = Some(path);
                break;
            }
        }
    }
    
    let input_file = match input_file {
        Some(f) => {
            info!("[HLS:{}] 📁 Arquivo encontrado: {}", id, f);
            f
        },
        None => {
            error!("[HLS:{}] ❌ Arquivo não encontrado", id);
            
            // Listar arquivos disponíveis para debug
            let mut available_files = Vec::new();
            if let Ok(entries) = std::fs::read_dir(downloads_dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.file_name().to_str() {
                        available_files.push(name.to_string());
                    }
                }
            }
            
            let error_msg = format!("Arquivo '{}' não encontrado em ./cache/downloads", id);
            error!("[HLS:{}] 📂 Arquivos disponíveis: {:?}", id, available_files);
            return Ok(Json(serde_json::json!({
                "ok": false,
                "error": error_msg,
                "hint": "O librqbit salva com o nome original do arquivo, não com o download_id",
                "available_files": available_files,
                "possivel_motivo": "Download ainda em andamento ou não encontrado",
                "id": id
            })));
        }
    };
    
    match HLSManager::start_conversion(id.clone(), input_file).await {
        Ok(_) => Ok(Json(serde_json::json!({
            "ok": true,
            "message": "HLS conversion started",
            "id": id,
            "status": "processing"
        }))),
        Err(e) => {
            error!("Failed to start HLS conversion: {}", e);
            Ok(Json(serde_json::json!({
                "ok": false,
                "error": format!("Falha na conversão: {}", e),
                "id": id
            })))
        }
    }
}

async fn get_hls_status(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    let manager = HLSManager::get_manager().await;
    let mgr = manager.read().await;

    if let Some(conv) = mgr.conversions.get(&id) {
        let is_stopped = if mgr.cancellations.contains_key(&id) { "no" } else { "yes" };

        let resp = serde_json::json!({
            "id": conv.id,
            "input_file": conv.input_file,
            "output_dir": conv.output_dir,
            "status": conv.status,
            "progress": conv.progress,
            "duration": conv.duration,
            "isStopped": is_stopped
        });

        Ok(Json(resp))
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}

#[derive(serde::Serialize)]
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

async fn get_hls_segments(Path(id): Path<String>) -> Response {
    use std::path::Path as StdPath;
    
    info!("[HLS:{}] 📊 Requisição de status recebida", id);
    
    let hls_dir = format!("./cache/hls/{}", id);
    let hls_path = StdPath::new(&hls_dir);
    
    // Se o diretório não existe, tenta iniciar conversão
    if !hls_path.exists() {
        info!("[HLS:{}] 📂 Diretório não encontrado, procurando arquivo para converter...", id);
        
        let downloads_dir = "./cache/downloads";
        let mut input_file = None;
        
        // Procura arquivo
        if let Ok(entries) = std::fs::read_dir(downloads_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                    let is_video = path.extension()
                        .and_then(|ext| ext.to_str())
                        .map(|ext| {
                            let ext_lower = ext.to_lowercase();
                            ["mkv", "mp4", "webm", "avi", "mov", "flv", "wmv", "m4v"]
                                .contains(&ext_lower.as_str())
                        })
                        .unwrap_or(false);
                    
                    if file_name.starts_with(&id) && is_video {
                        input_file = Some(path.to_string_lossy().to_string());
                        info!("[HLS:{}] 📁 Arquivo encontrado: {}", id, input_file.as_ref().unwrap());
                        break;
                    }
                }
            }
        }
        
        match input_file {
            Some(file) => {
                info!("[HLS:{}] 🚀 Iniciando conversão automática", id);
                if let Err(e) = HLSManager::start_conversion(id.clone(), file).await {
                    error!("[HLS:{}] ❌ Erro ao iniciar conversão: {}", id, e);
                    return error_response(&id, 500, format!("Falha ao iniciar: {}", e));
                }
                
                // Aguarda um pouco para segmentos começarem a ser criados
                info!("[HLS:{}] ⏳ Aguardando criação de segmentos...", id);
                tokio::time::sleep(tokio::time::Duration::from_millis(2000)).await;

                // Agora lista os segmentos criados
                return list_hls_segments(&id).await;
            }
            None => {
                error!("[HLS:{}] ❌ Arquivo não encontrado", id);
                return error_response(&id, 404, format!("Arquivo não encontrado"));
            }
        }
    }
    
    // Diretório existe, retorna status atual
    list_hls_segments(&id).await
}

async fn list_hls_segments(id: &str) -> Response {
    use std::path::PathBuf;
    
    // Usar caminhos absolutos para não ter problemas com CWD
    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let hls_dir = current_dir.join("cache/hls").join(id);
    let hls_dir_str = hls_dir.to_string_lossy().to_string();
    
    debug!("[HLS:{}] 🔍 Procurando segmentos em: {}", id, hls_dir_str);
    
    // Le playlist
    let playlist_path = hls_dir.join("playlist.m3u8");
    let is_complete = if let Ok(content) = fs::read_to_string(&playlist_path) {
        let complete = content.contains("#EXT-X-ENDLIST");
        debug!("[HLS:{}] 📋 Playlist encontrada, completo: {}", id, complete);
        complete
    } else {
        debug!("[HLS:{}] ⚠️  Playlist não encontrada em: {}", id, playlist_path.display());
        false
    };
    
    // Conta segmentos
    let mut segments = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&hls_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("ts") {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    segments.push(name.to_string());
                    debug!("[HLS:{}] ✓ Encontrado segmento: {}", id, name);
                }
            }
        }
    } else {
        warn!("[HLS:{}] ⚠️  Não foi possível ler diretório: {}", id, hls_dir_str);
    }
    
    segments.sort();
    let segments_count = segments.len();

    info!("[HLS:{}] 📁 Total de segmentos encontrados: {}", id, segments_count);

    // Se não há segmentos e não existe uma conversão registrada para esse id,
    // provavelmente é uma pasta obsoleta/temporária em ./cache/hls. Evitar
    // devolver um status 'fantasma' no endpoint da API — retornar 404.
    if segments_count == 0 {
        let manager = HLSManager::get_manager().await;
        let mgr = manager.read().await;
        if mgr.conversions.get(id).is_none() {
            warn!("[HLS:{}] ⚠️  Diretório existe mas sem segmentos e sem conversão ativa — tratando como não encontrado", id);
            return error_response(id, 404, "HLS não encontrado".to_string());
        }
        // Caso exista uma conversão em andamento, continuamos e retornamos 0 segmentos
    }
    
    // Obter duração do arquivo original
    let duration = {
        let manager = HLSManager::get_manager().await;
        let mgr = manager.read().await;
        mgr.conversions
            .get(id)
            .map(|conv| conv.duration)
            .unwrap_or(0.0)
    };
    
    // Calcula duração dos segmentos
    let segment_duration = 1.0;  // 1 segundo por segmento (configurado no FFmpeg)
    let total_duration = segments_count as f64 * segment_duration;
    
    let response = HLSStatusResponse {
        id: id.to_string(),
        status: if is_complete { "completed".to_string() } else { "converting".to_string() },
        segments_count,
        segments,
        playlist_url: format!("http://127.0.0.1:8080/hls/playlist/{}", id),
        segment_duration,
        is_complete,
        total_duration,
        duration,
    };
    
    info!(
        "[HLS:{}] 📊 Status: {} | Segmentos: {} | Duração original: {:.2}s | Duração calculada: {:.0}s | Completo: {}",
        id,
        response.status,
        segments_count,
        duration,
        total_duration,
        is_complete
    );
    
    let json_body = serde_json::to_string(&response)
        .unwrap_or_else(|_| r#"{"error":"serialization failed"}"#.to_string());
    
    Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, OPTIONS")
        .header("Access-Control-Allow-Headers", "Content-Type")
        .body(json_body.into())
        .unwrap()
}

fn error_response(id: &str, status: u16, message: String) -> Response {
    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(
            serde_json::json!({
                "id": id,
                "status": "error",
                "error": message
            })
            .to_string()
            .into(),
        )
        .unwrap()
}


async fn stop_hls_conversion(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    let manager = HLSManager::get_manager().await;
    let mut mgr = manager.write().await;
    let is_running = mgr.cancellations.contains_key(&id);
    let is_stopped = if is_running { "no" } else { "yes" };

    if let Some(sender) = mgr.cancellations.remove(&id) {
        match sender.send(()) {
            Ok(_) => {
                info!("[HLS:{}] 🛑 Cancelamento solicitado", id);
            }
            Err(_) => {
                warn!("[HLS:{}] ⚠️  Cancelamento já foi solicitado", id);
            }
        }

        if let Some(conv) = mgr.conversions.get_mut(&id) {
            conv.status = "cancelling".to_string();
        }

        return Ok(Json(serde_json::json!({
            "ok": true,
            "message": "Cancellation requested",
            "id": id,
            "isStopped": "yes"
        })));
    }

    if mgr.conversions.contains_key(&id) {
        return Ok(Json(serde_json::json!({
            "ok": false,
            "message": "No cancellation handle for this id; conversion may be finishing or already finished",
            "id": id,
            "isStopped": is_stopped
        })));
    }

    Ok(Json(serde_json::json!({
        "ok": false,
        "message": "Conversion id not found",
        "id": id,
        "isStopped": is_stopped
    })))
}

async fn resume_hls_conversion(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    let manager = HLSManager::get_manager().await;
    {
        let mgr = manager.read().await;
        if let Some(conv) = mgr.conversions.get(&id) {
            if mgr.cancellations.contains_key(&id) {
                return Ok(Json(serde_json::json!({
                    "ok": false,
                    "message": "Conversion already running",
                    "id": id
                })));
            }

            let input = conv.input_file.clone();
            drop(mgr);

            if !std::path::Path::new(&input).exists() {
                return Ok(Json(serde_json::json!({
                    "ok": false,
                    "message": "Input file not found",
                    "input_file": input,
                    "id": id
                })));
            }

            match HLSManager::start_conversion(id.clone(), input).await {
                Ok(_) => {
                    return Ok(Json(serde_json::json!({
                        "ok": true,
                        "message": "Resume started",
                        "id": id
                    })));
                }
                Err(e) => {
                    return Ok(Json(serde_json::json!({
                        "ok": false,
                        "message": format!("Failed to resume: {}", e),
                        "id": id
                    })));
                }
            }
        }
    }
    Err(StatusCode::NOT_FOUND)
}


/// Remove o cache HLS (diretório em ./cache/hls/<id>) e arquivos relacionados em ./cache/downloads
async fn delete_cache(Path(id): Path<String>) -> Result<Json<serde_json::Value>, StatusCode> {
    use std::path::Path as StdPath;

    info!("[HLS:{}] 🧹 Pedido de remoção de cache recebido", id);

    let mut removed = Vec::new();

    let hls_dir = format!("./cache/hls/{}", id);
    if StdPath::new(&hls_dir).exists() {
        match std::fs::remove_dir_all(&hls_dir) {
            Ok(_) => {
                info!("[HLS:{}] ✅ Diretório HLS removido: {}", id, hls_dir);
                removed.push("hls_dir".to_string());
            }
            Err(e) => {
                error!("[HLS:{}] ❌ Falha ao remover diretório HLS: {} | Erro: {}", id, hls_dir, e);
                return Ok(Json(serde_json::json!({
                    "ok": false,
                    "error": format!("Falha ao remover diretório hls: {}", e),
                    "id": id
                })));
            }
        }
    } else {
        debug!("[HLS:{}] ℹ️  Diretório HLS não existe: {}", id, hls_dir);
    }

    let downloads_dir = "./cache/downloads";
    let direct_file = format!("{}/{}", downloads_dir, id);
    if StdPath::new(&direct_file).exists() && StdPath::new(&direct_file).is_file() {
        match std::fs::remove_file(&direct_file) {
            Ok(_) => {
                info!("[HLS:{}] ✅ Arquivo removido: {}", id, direct_file);
                removed.push("download_file_exact".to_string());
            }
            Err(e) => {
                error!("[HLS:{}] ❌ Falha ao remover arquivo: {} | Erro: {}", id, direct_file, e);
                return Ok(Json(serde_json::json!({
                    "ok": false,
                    "error": format!("Falha ao remover arquivo de downloads: {}", e),
                    "id": id
                })));
            }
        }
    }

    if let Ok(entries) = std::fs::read_dir(downloads_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.contains(&id) {
                        if let Err(e) = std::fs::remove_file(&path) {
                            error!("[HLS:{}] ❌ Falha ao remover arquivo encontrado em downloads: {} | Erro: {}", id, path.display(), e);
                            return Ok(Json(serde_json::json!({
                                "ok": false,
                                "error": format!("Falha ao remover arquivo de downloads: {}", e),
                                "id": id
                            })));
                        } else {
                            info!("[HLS:{}] ✅ Arquivo removido (match parcial): {}", id, path.display());
                            removed.push(format!("download_file:{}", name));
                        }
                    }
                }
            }
        }
    }

    let manager = HLSManager::get_manager().await;
    let mut mgr = manager.write().await;
    if mgr.conversions.remove(&id).is_some() {
        info!("[HLS:{}] 🧾 Entrada de conversão removida do HLSManager", id);
        removed.push("manager_entry".to_string());
    }

    if removed.is_empty() {
        info!("[HLS:{}] ⚠️  Nenhum arquivo ou diretório removido (não encontrado)", id);
        return Ok(Json(serde_json::json!({
            "ok": false,
            "message": "Nenhum cache encontrado para o id",
            "id": id,
        })));
    }

    Ok(Json(serde_json::json!({
        "ok": true,
        "removed": removed,
        "id": id
    })))
}

pub fn router() -> Router {
    Router::new()
        .route("/playlist/:id", get(serve_playlist))
        .route("/segments/:id/:segment", get(serve_segment))
        .route("/convert/:id", get(start_hls_conversion))
        .route("/delete/:id", get(delete_cache))
        .route("/stop_conversion/:id", get(stop_hls_conversion))
        .route("/resume_conversion/:id", get(resume_hls_conversion))
        .route("/status/:id", get(get_hls_segments))
        .route("/info/:id", get(get_hls_status))
}



use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use tracing::{info, debug};
use walkdir::WalkDir;

pub const VIDEO_EXTENSIONS: &[&str] = &["mkv", "mp4", "avi", "mov", "flv", "wmv", "webm", "m4v"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub index: usize,
}

pub fn is_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn normalize_path(path: &str) -> String {
    path.replace('\\', "/")
}

pub fn find_video_files_in_dir(dir_path: &str) -> Vec<String> {
    let mut files = Vec::new();
    
    for entry in WalkDir::new(dir_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        let path = entry.path();
        if is_video_file(path) {
            files.push(normalize_path(&path.to_string_lossy()));
        }
    }
    
    files.sort();
    files
}

pub fn find_video_files_with_info(dir_path: &str) -> Vec<VideoFileInfo> {
    let mut files = Vec::new();
    
    for entry in WalkDir::new(dir_path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_file())
    {
        let path = entry.path();
        if is_video_file(path) {
            let name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();
            let size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
            
            files.push(VideoFileInfo {
                name,
                path: normalize_path(&path.to_string_lossy()),
                size,
                index: 0, // hardcoded index 0
            });
        }
    }
    
    files.sort_by(|a, b| a.name.cmp(&b.name));
    for (i, file) in files.iter_mut().enumerate() {
        file.index = i;
    }
    
    files
}

pub fn load_torrent_mapping(download_id: &str) -> Option<String> {
    let meta_file = format!("cache/downloads/{}.meta", download_id);
    
    let content = fs::read_to_string(&meta_file).ok()?;
    let json: serde_json::Value = serde_json::from_str(&content).ok()?;
    
    json.get("torrent_name")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

pub const DOWNLOADS_DIR: &str = "cache/downloads";

pub fn find_download_path(download_id: &str) -> Option<String> {
    if let Some(torrent_name) = load_torrent_mapping(download_id) {
        let path = format!("{}/{}", DOWNLOADS_DIR, torrent_name);
        if Path::new(&path).exists() {
            return Some(path);
        }
    }
    
    for ext in VIDEO_EXTENSIONS {
        let path = format!("{}/{}.{}", DOWNLOADS_DIR, download_id, ext);
        if Path::new(&path).exists() {
            return Some(path);
        }
    }
    
    let dir_path = format!("{}/{}", DOWNLOADS_DIR, download_id);
    if Path::new(&dir_path).is_dir() {
        return Some(dir_path);
    }
    
    None
}

pub fn find_first_video_file(download_id: &str) -> Result<String, String> {
    find_video_file_with_retry(download_id, 3)
}

fn find_video_file_with_retry(download_id: &str, max_attempts: u32) -> Result<String, String> {
    for attempt in 1..=max_attempts {
        if let Some(torrent_name) = load_torrent_mapping(download_id) {
            let file_path = format!("{}/{}", DOWNLOADS_DIR, torrent_name);
            
            if Path::new(&file_path).is_file() && is_video_file(Path::new(&file_path)) {
                info!("[Video] Arquivo encontrado (tentativa {}): {}", attempt, file_path);
                return Ok(file_path);
            }
            
            if Path::new(&file_path).is_dir() {
                let files = find_video_files_in_dir(&file_path);
                if let Some(first) = files.first() {
                    info!("[Video] Arquivo em pasta encontrado (tentativa {}): {}", attempt, first);
                    return Ok(first.clone());
                }
            }
        }
        
        for ext in VIDEO_EXTENSIONS {
            let path = format!("{}/{}.{}", DOWNLOADS_DIR, download_id, ext);
            if Path::new(&path).exists() {
                info!("[Video] Arquivo por extensão (tentativa {}): {}", attempt, path);
                return Ok(path);
            }
        }
        
        let dir_path = format!("{}/{}", DOWNLOADS_DIR, download_id);
        if Path::new(&dir_path).is_dir() {
            let files = find_video_files_in_dir(&dir_path);
            if let Some(first) = files.first() {
                info!("[Video] Arquivo em pasta (tentativa {}): {}", attempt, first);
                return Ok(first.clone());
            }
        }
        
        if attempt < max_attempts {
            debug!("[Video] Arquivo não encontrado (tentativa {}/{}), aguardando 500ms...", attempt, max_attempts);
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    
    Err(format!(
        "Nenhum arquivo de vídeo encontrado para id: {} após {} tentativas",
        download_id, max_attempts
    ))
}

pub fn list_video_files(download_id: &str) -> Result<Vec<VideoFileInfo>, String> {
    list_video_files_with_retry(download_id, 1)
}

fn list_video_files_with_retry(download_id: &str, max_attempts: u32) -> Result<Vec<VideoFileInfo>, String> {
    for attempt in 1..=max_attempts {
        if let Some(torrent_name) = load_torrent_mapping(download_id) {
            let file_path = format!("{}/{}", DOWNLOADS_DIR, torrent_name);
            if let Ok(metadata) = fs::metadata(&file_path) {
                if metadata.is_file() && is_video_file(Path::new(&file_path)) {
                    return Ok(vec![VideoFileInfo {
                        name: torrent_name.clone(),
                        path: file_path,
                        size: metadata.len(),
                        index: 0,
                    }]);
                }
            }
            
            let files = find_video_files_with_info(&file_path);
            if !files.is_empty() {
                return Ok(files);
            }
        }
        
        let dir_path = format!("{}/{}", DOWNLOADS_DIR, download_id);
        let files = find_video_files_with_info(&dir_path);
        if !files.is_empty() {
            return Ok(files);
        }
        
        for ext in VIDEO_EXTENSIONS {
            let path = format!("{}/{}.{}", DOWNLOADS_DIR, download_id, ext);
            if let Ok(metadata) = fs::metadata(&path) {
                return Ok(vec![VideoFileInfo {
                    name: format!("{}.{}", download_id, ext),
                    path,
                    size: metadata.len(),
                    index: 0,
                }]);
            }
        }
        
        if attempt < max_attempts {
            debug!("[Video] Arquivos não encontrados (tentativa {}/{}), aguardando 500ms...", attempt, max_attempts);
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    
    Ok(vec![])
}

pub fn find_video_file_by_index(download_id: &str, index: usize) -> Result<String, String> {
    let files = list_video_files(download_id)?;
    
    files.get(index)
        .map(|f| f.path.clone())
        .ok_or_else(|| format!(
            "Arquivo com índice {} não encontrado. Total: {}",
            index,
            files.len()
        ))
}

use std::path::PathBuf;
use std::sync::Arc;
use std::collections::HashMap;
use anyhow::Result;
use serde::Serialize;
use tokio::sync::RwLock;
use librqbit::{Session, AddTorrent};
use librqbit::api::{TorrentStats, TorrentIdOrHash};
use librqbit::SessionOptions;
use librqbit::PeerConnectionOptions;

use tracing::{info, debug, warn, error};
use walkdir::WalkDir;
use std::time::Duration;

type DownloadsMap = Arc<RwLock<HashMap<String, ActiveDownload>>>;

// client bittorent simples usando librqbit
pub struct Client {
    session: Arc<Session>,
    dht_session: Arc<tokio::sync::RwLock<Option<Arc<Session>>>>,
    active_downloads: DownloadsMap,
}

#[derive(Serialize, Clone, Debug)]
pub struct DownloadInfo {
    pub download_id: String,
    pub magnet_url: String,
    pub progress: f64,
    pub status: String,
    pub downloaded: u64,
    pub total: u64,
    pub name: String,
    pub download_speed: u64,  // bytes por segundo
    pub upload_speed: u64,    // bytes por segundo
    pub eta: Option<u64>,     // segundos restantes
}

#[derive(Serialize, Clone, Debug)]
pub struct PeerInfo {
    pub addr: String,
    pub connected: bool,
}

/// Informações sobre um arquivo de vídeo dentro de um torrent
#[derive(Serialize, Clone, Debug)]
pub struct TorrentFileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub index: usize,
}

struct ActiveDownload {
    torrent_id: usize,
    torrent_name: String,  // Nome real do torrent da librqbit
    info: DownloadInfo,
    last_update: std::time::Instant,
    last_downloaded: u64,
    last_uploaded: u64,
}

impl Client {
    // Cria instancia do librqbit
    #[tracing::instrument]
    pub async fn new() -> Result<Self> {
        let downloads_dir = PathBuf::from("./cache/downloads");
        tokio::fs::create_dir_all(&downloads_dir).await?;
        info!(downloads_dir = ?downloads_dir, "Inicializando cliente BitTorrent");

        // Criar sessão com DHT desativado (inicialização rápida)
        // DHT será ativado dinamicamente quando necessário
        let mut options = SessionOptions::default();
        options.disable_dht = true;  // dht desativado
        options.disable_dht_persistence = false;
        options.enable_upnp_port_forwarding = false;
        let peer_opts = PeerConnectionOptions {
            connect_timeout: Some(Duration::from_secs(10)),
            read_write_timeout: Some(Duration::from_secs(30)),
            keep_alive_interval: Some(Duration::from_secs(15)),
        };
        options.peer_opts = Some(peer_opts);
        let session = Session::new_with_opts(downloads_dir.clone(), options).await?;
        info!("Sessão librqbit inicializada (DHT desativado, será ativado sob demanda)");

        Ok(Self {
            session,
            dht_session: Arc::new(tokio::sync::RwLock::new(None)),
            active_downloads: Arc::new(RwLock::new(HashMap::new())),
        })
    }

    // Inicia download a partir de um parametro (magnet link)
    #[tracing::instrument(skip(self, magnet_url))]
    pub async fn start_download(&self, magnet_url: &str) -> Result<String> {
        let start_time = std::time::Instant::now();    
        let download_id = self.extract_info_hash(magnet_url)
            .unwrap_or_else(|| format!("dl_{}", std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs()));
        
        debug!(download_id = %download_id, "Download ID gerado");

        // Adiciona download a session do librqbit (primeira tentativa sem DHT)
        info!("[{}] Adicionando torrent ao librqbit (tentando sem DHT)...", download_id);
        let add_torrent = AddTorrent::from_url(magnet_url);
        
        let response = match self.session.add_torrent(add_torrent, None).await {
            Ok(resp) => {
                info!("[{}] Torrent adicionado com sucesso (sem DHT)", download_id);
                resp
            }
            Err(e) => {
                // Se falhou sem DHT, criar nova sessão COM DHT e tentar novamente
                warn!("[{}] Falha sem DHT: '{}'. Ativando DHT e tentando novamente...", download_id, e);
                
                let downloads_dir = PathBuf::from("./cache/downloads");
                let mut dht_options = SessionOptions::default();
                dht_options.disable_dht = false;  
                dht_options.disable_dht_persistence = false;
                dht_options.enable_upnp_port_forwarding = false;
                let peer_opts = PeerConnectionOptions {
                    connect_timeout: Some(Duration::from_secs(10)),
                    read_write_timeout: Some(Duration::from_secs(30)),
                    keep_alive_interval: Some(Duration::from_secs(15)),
                };
                dht_options.peer_opts = Some(peer_opts);
                
                info!("[{}] Criando nova sessão com DHT...", download_id);
                let dht_session = Session::new_with_opts(downloads_dir, dht_options).await?;
                let add_torrent_retry = AddTorrent::from_url(magnet_url);
                
                match dht_session.add_torrent(add_torrent_retry, None).await {
                    Ok(resp) => {
                        // Armazenar a sessão DHT para manter o torrent gerenciado
                        let mut dht_sess = self.dht_session.write().await;
                        *dht_sess = Some(dht_session);
                        drop(dht_sess);  // Liberar o lock
                        
                        info!("[{}] Torrent adicionado COM DHT em {:.2}s", download_id, start_time.elapsed().as_secs_f64());
                        resp
                    }
                    Err(e2) => {
                        error!("[{}] Falhas em ambas tentativas - Sem DHT: '{}', Com DHT: '{}'", download_id, e, e2);
                        return Err(anyhow::anyhow!("Falha sem DHT: {}. Falha com DHT: {}", e, e2));
                    }
                }
            }
        };
        
        // Extrai id de resposta podendo ser: adicionado, ja gerenciado (adicionado) ou somente leitura (erro)
        let torrent_id = match response {
            librqbit::AddTorrentResponse::Added(id, _) => id,
            librqbit::AddTorrentResponse::AlreadyManaged(id, _) => id,
            librqbit::AddTorrentResponse::ListOnly(_) => {
                return Err(anyhow::anyhow!("Torrent adicionado em modo somente leitura"));
            }
        };
        
        info!(download_id = %download_id, torrent_id = torrent_id, "Torrent adicionado em {:.2}s", start_time.elapsed().as_secs_f64());

        // Obter nome do torrent real da librqbit usando o metadata
        let torrent_name = {
            let mut name = download_id.clone();
            
            // Aguardar os metadados ficarem prontos
            for _ in 0..50 {
                if let Some(handle) = self.session.get(TorrentIdOrHash::Id(torrent_id)) {
                    // Tentar obter o nome do metadata do torrent
                    if let Some(metadata) = handle.metadata.load_full() {
                        if let Some(torrent_name) = &metadata.name {
                            name = torrent_name.clone();
                            info!(download_id = %download_id, "Nome do torrent obtido: {}", name);
                            break;
                        }
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
            }
            
            name
        };

        // Info inicial do download, usado para monitoramento
        let initial_info = DownloadInfo {
            download_id: download_id.clone(),
            magnet_url: magnet_url.to_string(),
            progress: 0.0,
            status: "downloading".to_string(),
            downloaded: 0,
            total: 0,
            name: torrent_name.clone(),
            download_speed: 0,
            upload_speed: 0,
            eta: None,
        };

        // Registra do vetor de downloads ativos
        {
            let mut downloads = self.active_downloads.write().await;
            downloads.insert(
                download_id.clone(),
                ActiveDownload {
                    torrent_id,
                    torrent_name: torrent_name.clone(),
                    info: initial_info,
                    last_update: std::time::Instant::now(),
                    last_downloaded: 0,
                    last_uploaded: 0,
                },
            );
        }

        // Inicia function de monitoramento, se tudo deu certo
        self.start_progress_monitoring(download_id.clone()).await;

        Ok(download_id)
    }

    // Function que roda em "background" atualizando o progresso do download
    // Basicamente gira em torno da flag de progresso (active_dl.info.progress), se chegar a 100% ou der erro, para o loop
    #[tracing::instrument(skip(self))]
    async fn start_progress_monitoring(&self, download_id: String) {
        let downloads = self.active_downloads.clone();
        let session = self.session.clone();
        
        info!(download_id = %download_id, "Iniciando monitoramento de progresso");

        tokio::spawn(async move {
            let mut file_renamed = false;
            let start = std::time::Instant::now();
            let rename_attempt_time = std::time::Instant::now();
            
            loop {
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                
                let should_continue = {
                    let mut downloads_map = downloads.write().await;
                    
                    if let Some(active_dl) = downloads_map.get_mut(&download_id) {
                        // Primeiro, atualizar as informações do torrent (para obter nome correto)
                        match Self::update_torrent_info_static(&session, active_dl.torrent_id, active_dl).await {
                            Ok(()) => {
                                // Tentar criar mapeamento após 1 segundo (salva arquivo .meta que mapeia download_id -> pasta)
                                if !file_renamed && rename_attempt_time.elapsed().as_secs() > 1 {
                                    let torrent_name = active_dl.torrent_name.clone();
                                    match Self::create_download_mapping(&download_id, &torrent_name).await {
                                        Ok(_) => {
                                            file_renamed = true;
                                            info!(download_id = %download_id, torrent_name = %torrent_name, "Mapeamento criado");
                                        }
                                        Err(e) => {
                                            warn!(download_id = %download_id, error = %e, "Erro ao criar mapeamento");
                                        }
                                    }
                                }
                                
                                // Log a cada 10 segundos apenas para não poluir
                                if start.elapsed().as_secs() % 10 == 0 && active_dl.info.progress > 0.0 {
                                    info!(
                                        download_id = %download_id,
                                        progress = format!("{:.1}%", active_dl.info.progress),
                                        speed = format!("{:.2} MB/s", active_dl.info.download_speed as f64 / 1_000_000.0),
                                        elapsed = format!("{:.0}s", start.elapsed().as_secs_f64()),
                                        "Progresso do download"
                                    );
                                }
                                
                                if active_dl.info.progress >= 100.0 {
                                    active_dl.info.status = "completed".to_string();
                                    info!(download_id = %download_id, total_time = format!("{:.2}s", start.elapsed().as_secs_f64()), "Download completo");
                                    false
                                } else if active_dl.info.progress == 0.0 && start.elapsed().as_secs() > 30 {
                                    warn!(download_id = %download_id, elapsed = format!("{:.0}s", start.elapsed().as_secs_f64()), "Ainda aguardando metadata/peers (30+ segundos)");
                                    true
                                } else {
                                    true
                                }
                            }
                            Err(e) => {
                                error!(download_id = %download_id, error = %e, "Erro ao atualizar");
                                active_dl.info.status = "error".to_string();
                                false
                            }
                        }
                    } else {
                        warn!(download_id = %download_id, "Download não encontrado");
                        false
                    }
                };

                if !should_continue {
                    break;
                }
            }
        });
    }

    // Atualiza info do download (progresso, status, etc) usando TorrentStats da librqbit
    // Usa os dados pré-calculados disponíveis em TorrentStats::live quando disponível
    #[tracing::instrument(skip(session, active_dl))]
    async fn update_torrent_info_static(
        session: &Session,
        torrent_id: usize,
        active_dl: &mut ActiveDownload,
    ) -> Result<()> {
        let handle = session
            .get(TorrentIdOrHash::Id(torrent_id))
            .ok_or_else(|| anyhow::anyhow!("Torrent não encontrado"))?;

        // Obtém TorrentStats completo com todos os dados pré-calculados da librqbit
        let stats: TorrentStats = handle.stats();
        
        // Calcula progresso percentual direto dos valores pré-calculados
        let progress = if stats.total_bytes > 0 {
            (stats.progress_bytes as f64 / stats.total_bytes as f64) * 100.0
        } else {
            0.0
        };

        // Usa cálculo manual para speeds (mais confiável que LiveStats por enquanto)
        let (download_speed, upload_speed, eta) = Self::calculate_speeds_from_deltas(&stats, active_dl);

        // Atualiza o struct DownloadInfo com os dados
        active_dl.info.progress = progress.min(100.0);
        active_dl.info.downloaded = stats.progress_bytes;
        active_dl.info.total = stats.total_bytes;
        active_dl.info.status = Self::format_torrent_state(stats.state, stats.finished);
        active_dl.info.download_speed = download_speed;
        active_dl.info.upload_speed = upload_speed;
        active_dl.info.eta = eta;

        // Atualiza valores para próxima iteração
        active_dl.last_update = std::time::Instant::now();
        active_dl.last_downloaded = stats.progress_bytes;
        active_dl.last_uploaded = stats.uploaded_bytes;

        Ok(())
    }

    // Calcula speeds baseado na diferença entre chamadas (delta de bytes / delta de tempo)
    // Usa os valores pré-calculados de TorrentStats
    fn calculate_speeds_from_deltas(
        stats: &TorrentStats,
        active_dl: &ActiveDownload,
    ) -> (u64, u64, Option<u64>) {
        let now = std::time::Instant::now();
        let elapsed = now.duration_since(active_dl.last_update).as_secs_f64();

        // Calcula a diferença de bytes desde a última atualização
        let downloaded_delta = stats.progress_bytes.saturating_sub(active_dl.last_downloaded);
        let uploaded_delta = stats.uploaded_bytes.saturating_sub(active_dl.last_uploaded);

        debug!(
            elapsed = elapsed,
            downloaded_delta = downloaded_delta,
            uploaded_delta = uploaded_delta,
            current_progress = stats.progress_bytes,
            current_uploaded = stats.uploaded_bytes,
            last_progress = active_dl.last_downloaded,
            last_uploaded = active_dl.last_uploaded,
            "Calculando velocidades"
        );

        // Converte para velocidade (bytes por segundo)
        // Garante pelo menos 0.1 segundos para evitar divisões muito grandes
        let time_divisor = elapsed.max(0.1);
        
        let download_speed = if downloaded_delta > 0 {
            (downloaded_delta as f64 / time_divisor) as u64
        } else {
            0
        };

        let upload_speed = if uploaded_delta > 0 {
            (uploaded_delta as f64 / time_divisor) as u64
        } else {
            0
        };

        debug!(
            download_speed = download_speed,
            upload_speed = upload_speed,
            "Velocidades calculadas"
        );

        // ETA: calcula baseado na velocidade de download
        let eta = if download_speed > 0 && stats.total_bytes > stats.progress_bytes {
            let remaining_bytes = stats.total_bytes - stats.progress_bytes;
            let eta_secs = remaining_bytes / download_speed;
            debug!(
                remaining_bytes = remaining_bytes,
                eta_secs = eta_secs,
                "ETA calculado"
            );
            Some(eta_secs)
        } else {
            None
        };

        (download_speed, upload_speed, eta)
    }

    // Formata o estado do torrent em string legivel usando TorrentStatsState
    fn format_torrent_state(state: librqbit::TorrentStatsState, finished: bool) -> String {
        let state_str = format!("{:?}", state);
        if finished {
            format!("{} (finished)", state_str)
        } else {
            state_str
        }
    }

    // Consulta o progresso de um download ativo q esta dentro do vetor active_downloads, se n tiver la, retorna erro, é basicamente um getter e util pra ver o progresso
    #[tracing::instrument(skip(self))]
    pub async fn get_progress(&self, download_id: &str) -> Result<DownloadInfo> {
        debug!(download_id = %download_id, "Consultando progresso");
        
        // Força atualização dos valores do vetor DownloadInfo antes de retornar 
        {
            let mut downloads = self.active_downloads.write().await;
            if let Some(active_dl) = downloads.get_mut(download_id) {
                // Tenta primeiro com a sessão normal
                let result = Self::update_torrent_info_static(&self.session, active_dl.torrent_id, active_dl).await;
                
                // Se falhou com sessão normal e temos DHT session, tenta com DHT
                if result.is_err() {
                    let dht_sess = self.dht_session.read().await;
                    if let Some(dht_session) = dht_sess.as_ref() {
                        if let Ok(()) = Self::update_torrent_info_static(dht_session, active_dl.torrent_id, active_dl).await {
                            debug!(download_id = %download_id, "Atualização com DHT session bem-sucedida");
                            return downloads
                                .get(download_id)
                                .map(|dl| dl.info.clone())
                                .ok_or_else(|| anyhow::anyhow!("Download não encontrado"));
                        }
                    }
                }
                
                result?;
            }
        }

        // Retorna a info atualizada, ou erro se n tiver nenhun download com esse id no vetor active_downloads
        let downloads = self.active_downloads.read().await;
        downloads
            .get(download_id)
            .map(|dl| dl.info.clone())
            .ok_or_else(|| {
                warn!(download_id = %download_id, "Download não encontrado");
                anyhow::anyhow!("Download não encontrado: {}", download_id)
            })
    }

    // Auto-explicativo: so faz um map no vetor active_downloads e retorna um vetor com as infos
    #[tracing::instrument(skip(self))]
    pub async fn list_downloads(&self) -> Vec<DownloadInfo> {
        debug!("Listando downloads");
        let downloads = self.active_downloads.read().await;
        let list: Vec<DownloadInfo> = downloads.values().map(|dl| dl.info.clone()).collect();
        info!(count = list.len(), "Total de downloads");
        list
    }

    // Auto-explicativo: para/remove um download da sessao usando o torrent id com .delete() do metodo Session
    #[tracing::instrument(skip(self))]
    pub async fn stop_download(&self, download_id: &str) -> Result<()> {
        use librqbit::api::TorrentIdOrHash;
        
        let mut downloads = self.active_downloads.write().await;
        
        if let Some(active_dl) = downloads.remove(download_id) {
            self.session
                .delete(TorrentIdOrHash::Id(active_dl.torrent_id), false)
                .await?;
            info!(download_id = %download_id, "Download parado");
            Ok(())
        } else {
            warn!(download_id = %download_id, "Download não encontrado");
            Err(anyhow::anyhow!("Download não encontrado: {}", download_id))
        }
    }

    // Extrai info hash de um magnet link, usado pra gerar o download_id
    // Basicamente pega a parte do link que vem depois de "btih:" e antes do proximo '&' ou fim da string
    pub fn extract_info_hash(&self, magnet_url: &str) -> Option<String> {
        magnet_url
            .split("btih:")
            .nth(1)?
            .split('&')
            .next()
            .map(|s| s.to_lowercase())
    }

    /// Retorna o nome real do torrent (pasta ou arquivo) para um download_id
    /// Útil para encontrar arquivos quando o torrent baixa com nome original
    #[tracing::instrument(skip(self))]
    pub async fn get_torrent_name(&self, download_id: &str) -> Option<String> {
        let downloads = self.active_downloads.read().await;
        downloads.get(download_id).map(|dl| dl.torrent_name.clone())
            .or_else(|| Self::get_torrent_name_from_mapping(download_id))
    }

    /// Lista todos os arquivos de vídeo em um torrent (para torrents com múltiplos arquivos)
    /// Retorna Vec<(nome_arquivo, caminho_completo, tamanho)>
    #[tracing::instrument(skip(self))]
    pub async fn list_torrent_files(&self, download_id: &str) -> Result<Vec<TorrentFileInfo>> {
        use std::fs;
        use walkdir::WalkDir;
        
        let downloads_dir = PathBuf::from("./cache/downloads");
        
        // Primeiro, tenta obter o nome real do torrent
        let torrent_name = self.get_torrent_name(download_id).await;
        
        let mut video_files = Vec::new();
        let video_extensions = ["mp4", "mkv", "avi", "mov", "flv", "wmv", "webm", "m4v"];
        
        // Função auxiliar para verificar se é arquivo de vídeo
        let is_video_file = |path: &std::path::Path| -> bool {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| video_extensions.contains(&ext.to_lowercase().as_str()))
                .unwrap_or(false)
        };
        
        // Tenta encontrar arquivos por diferentes métodos
        let search_paths = vec![
            // 1. Caminho direto com download_id
            downloads_dir.join(download_id),
            // 2. Caminho com nome do torrent
            torrent_name.as_ref().map(|n| downloads_dir.join(n)).unwrap_or_default(),
        ];
        
        for base_path in search_paths {
            if !base_path.exists() {
                continue;
            }
            
            if base_path.is_file() && is_video_file(&base_path) {
                // É um arquivo único
                let file_name = base_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("unknown")
                    .to_string();
                let file_size = fs::metadata(&base_path).map(|m| m.len()).unwrap_or(0);
                
                video_files.push(TorrentFileInfo {
                    name: file_name,
                    path: base_path.to_string_lossy().to_string(),
                    size: file_size,
                    index: 0,
                });
                break;
            } else if base_path.is_dir() {
                // É uma pasta com múltiplos arquivos
                for (index, entry) in WalkDir::new(&base_path)
                    .into_iter()
                    .filter_map(|e| e.ok())
                    .filter(|e| e.path().is_file() && is_video_file(e.path()))
                    .enumerate()
                {
                    let path = entry.path();
                    let file_name = path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let file_size = fs::metadata(path).map(|m| m.len()).unwrap_or(0);
                    
                    video_files.push(TorrentFileInfo {
                        name: file_name,
                        path: path.to_string_lossy().to_string(),
                        size: file_size,
                        index,
                    });
                }
                
                if !video_files.is_empty() {
                    break;
                }
            }
        }
        
        // Se ainda não encontrou, procura qualquer coisa que contenha o download_id ou torrent_name
        if video_files.is_empty() {
            if let Ok(entries) = fs::read_dir(&downloads_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let name = path.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    
                    let matches = name.contains(download_id) || 
                        torrent_name.as_ref().map(|tn| name.contains(tn)).unwrap_or(false);
                    
                    if !matches {
                        continue;
                    }
                    
                    if path.is_file() && is_video_file(&path) {
                        let file_size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                        video_files.push(TorrentFileInfo {
                            name,
                            path: path.to_string_lossy().to_string(),
                            size: file_size,
                            index: 0,
                        });
                    } else if path.is_dir() {
                        for (index, entry) in WalkDir::new(&path)
                            .into_iter()
                            .filter_map(|e| e.ok())
                            .filter(|e| e.path().is_file() && is_video_file(e.path()))
                            .enumerate()
                        {
                            let file_path = entry.path();
                            let file_name = file_path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("unknown")
                                .to_string();
                            let file_size = fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
                            
                            video_files.push(TorrentFileInfo {
                                name: file_name,
                                path: file_path.to_string_lossy().to_string(),
                                size: file_size,
                                index,
                            });
                        }
                    }
                }
            }
        }
        
        // Ordena por nome para consistência
        video_files.sort_by(|a, b| a.name.cmp(&b.name));
        
        // Reindexar após ordenação
        for (i, file) in video_files.iter_mut().enumerate() {
            file.index = i;
        }
        
        info!(download_id = %download_id, files_count = video_files.len(), "Arquivos de vídeo encontrados");
        
        Ok(video_files)
    }

    // Encontra um arquivo de vídeo específico pelo índice em um torrent com múltiplos arquivos
    #[tracing::instrument(skip(self))]
    pub async fn get_video_file_by_index(&self, download_id: &str, file_index: usize) -> Result<TorrentFileInfo> {
        let files = self.list_torrent_files(download_id).await?;
        
        files.get(file_index)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!(
                "Arquivo de vídeo com índice {} não encontrado. Total de arquivos: {}", 
                file_index, 
                files.len()
            ))
    }

    // Renomeia o arquivo baixado para usar o download_id como nome
    // Obtém o nome do torrent da librqbit, procura esse arquivo na pasta e renomeia para download_id
    async fn rename_download_file_with_session(_session: &Arc<Session>, _torrent_id: usize, download_id: &str, torrent_name: &str) -> Result<()> {
        use std::fs;
        use std::path::PathBuf;
        use std::time::Duration;
        
        let downloads_dir = PathBuf::from("./cache/downloads");
        
        info!(download_id = %download_id, torrent_name = %torrent_name, "Procurando arquivo do torrent para renomear");
        
        // Verificar se diretório existe
        if !downloads_dir.exists() {
            warn!(dir = ?downloads_dir, "Diretório não existe");
            return Ok(());
        }
        
        // Verificar se já existe arquivo ou pasta com download_id
        if let Ok(entries) = fs::read_dir(&downloads_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(filename) = path.file_name() {
                    let name = filename.to_string_lossy().to_string();
                    if name.starts_with(download_id) {
                        info!(download_id = %download_id, existing_item = %name, "Arquivo/pasta já existe com download_id");
                        return Ok(());
                    }
                }
            }
        }
        
        // Procurar pelo arquivo ou pasta do torrent
        if let Ok(entries) = fs::read_dir(&downloads_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                
                if let Some(filename) = path.file_name() {
                    let name = filename.to_string_lossy().to_string();
                    
                    // Verificar se é o arquivo ou pasta do torrent (comparar nome)
                    if name == torrent_name || name.starts_with(&torrent_name) {
                        if path.is_file() {
                            // ===== ARQUIVO ÚNICO =====
                            info!(download_id = %download_id, torrent_name = %torrent_name, found_file = %name, "Arquivo do torrent encontrado");
                            
                            // Extrair extensão do arquivo original
                            let extension = path
                                .extension()
                                .and_then(|ext| ext.to_str())
                                .unwrap_or("");

                            // Criar novo nome com download_id + extensão
                            let new_filename = if extension.is_empty() {
                                download_id.to_string()
                            } else {
                                format!("{}.{}", download_id, extension)
                            };
                            
                            let new_path = downloads_dir.join(&new_filename);
                            
                            info!(download_id = %download_id, old_file = %name, new_file = %new_filename, "Tentando renomear arquivo...");
                            
                            // Tenta renomar o arquivo com retry
                            match Self::rename_with_retry(&path, &new_path, download_id, &name, &new_filename).await {
                                Ok(_) => {
                                    info!(
                                        download_id = %download_id,
                                        old_name = %name,
                                        new_name = %new_filename,
                                        extension = %extension,
                                        "Arquivo renomeado com sucesso!"
                                    );
                                    return Ok(());
                                }
                                Err(e) => {
                                    error!(
                                        download_id = %download_id,
                                        old_name = %name,
                                        error = %e,
                                        "Falha ao renomear arquivo"
                                    );
                                    return Err(anyhow::anyhow!(e));
                                }
                            }
                        } else if path.is_dir() {
                            // ===== PASTA (MULTI-ARQUIVO) =====
                            info!(download_id = %download_id, torrent_name = %torrent_name, found_dir = %name, "Pasta do torrent multi-arquivo encontrada");
                            
                            let new_dirname = download_id.to_string();
                            let new_path = downloads_dir.join(&new_dirname);
                            
                            // Só renomeia se o novo path não existe
                            if new_path.exists() {
                                info!(download_id = %download_id, "Pasta com download_id já existe, pulando renomeação");
                                return Ok(());
                            }
                            
                            info!(download_id = %download_id, old_dir = %name, new_dir = %new_dirname, "Tentando renomear pasta...");
                            
                            // Tenta renomar a pasta com retry
                            match Self::rename_with_retry(&path, &new_path, download_id, &name, &new_dirname).await {
                                Ok(_) => {
                                    info!(
                                        download_id = %download_id,
                                        old_name = %name,
                                        new_name = %new_dirname,
                                        "Pasta renomeada com sucesso! (multi-arquivo)"
                                    );
                                    return Ok(());
                                }
                                Err(e) => {
                                    error!(
                                        download_id = %download_id,
                                        old_name = %name,
                                        error = %e,
                                        "Falha ao renomear pasta"
                                    );
                                    return Err(anyhow::anyhow!(e));
                                }
                            }
                        }
                    }
                }
            }
        }
        
        warn!(download_id = %download_id, torrent_name = %torrent_name, "Arquivo/pasta do torrent não encontrado na pasta downloads");
        Ok(())
    }

    // Cria arquivo de mapeamento download_id -> torrent_name (sem renomear a pasta)
    // Isso permite encontrar a pasta/arquivo pelo download_id sem renomear
    async fn create_download_mapping(download_id: &str, torrent_name: &str) -> Result<()> {
        use std::fs;
        use std::path::PathBuf;
        
        let downloads_dir = PathBuf::from("./cache/downloads");
        let meta_file = downloads_dir.join(format!("{}.meta", download_id));
        
        // Se já existe, não precisa criar novamente
        if meta_file.exists() {
            return Ok(());
        }
        
        // Verifica se a pasta/arquivo do torrent existe
        let torrent_path = downloads_dir.join(torrent_name);
        if !torrent_path.exists() {
            // Tenta encontrar por nome parcial
            if let Ok(entries) = fs::read_dir(&downloads_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with(torrent_name) || torrent_name.starts_with(&name) {
                        // Encontrou, salva o mapeamento
                        let content = serde_json::json!({
                            "download_id": download_id,
                            "torrent_name": name,
                            "created_at": chrono::Utc::now().to_rfc3339()
                        });
                        fs::write(&meta_file, serde_json::to_string_pretty(&content)?)?;
                        info!(download_id = %download_id, mapped_to = %name, "Mapeamento salvo em arquivo .meta");
                        return Ok(());
                    }
                }
            }
            return Err(anyhow::anyhow!("Pasta/arquivo do torrent não encontrado: {}", torrent_name));
        }
        
        // Salva o mapeamento
        let content = serde_json::json!({
            "download_id": download_id,
            "torrent_name": torrent_name,
            "created_at": chrono::Utc::now().to_rfc3339()
        });
        fs::write(&meta_file, serde_json::to_string_pretty(&content)?)?;
        info!(download_id = %download_id, torrent_name = %torrent_name, "Mapeamento salvo em arquivo .meta");
        
        Ok(())
    }

    /// Lê o mapeamento download_id -> torrent_name do arquivo .meta
    pub fn get_torrent_name_from_mapping(download_id: &str) -> Option<String> {
        use std::fs;
        use std::path::PathBuf;
        
        let downloads_dir = PathBuf::from("./cache/downloads");
        let meta_file = downloads_dir.join(format!("{}.meta", download_id));
        
        if let Ok(content) = fs::read_to_string(&meta_file) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                return json.get("torrent_name")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
            }
        }
        
        None
    }

    // Função auxiliar para renomear com retry (aguarda liberação de recursos)
    #[allow(dead_code)]
    async fn rename_with_retry(
        old_path: &std::path::Path,
        new_path: &std::path::Path,
        download_id: &str,
        old_name: &str,
        new_name: &str,
    ) -> Result<(), String> {
        use std::fs;
        use std::time::Duration;
        
        let max_retries = 5;
        let mut attempt = 0;
        
        loop {
            attempt += 1;
            
            match fs::rename(old_path, new_path) {
                Ok(_) => {
                    info!(download_id = %download_id, attempt = attempt, "Renomeação bem-sucedida na tentativa {}", attempt);
                    return Ok(());
                }
                Err(e) if attempt < max_retries => {
                    warn!(
                        download_id = %download_id,
                        attempt = attempt,
                        error = %e,
                        "Falha na tentativa {} de renomear, aguardando 2s...",
                        attempt
                    );
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
                Err(e) => {
                    error!(download_id = %download_id, attempt = attempt, error = %e, "Falha na {} tentativa (final)", attempt);
                    return Err(format!("Falha ao renomear após {} tentativas: {}", attempt, e));
                }
            }
        }
    }
}


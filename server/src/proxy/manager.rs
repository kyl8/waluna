use std::sync::{Arc, Mutex};
use std::collections::{VecDeque, HashMap};
use std::path::Path;
use tokio::fs;
use crate::proxy::client::ProxyClient;
use tracing::{info, warn};

pub struct ProxyManager {
    proxies: Arc<Mutex<VecDeque<String>>>,
    current_index: Arc<Mutex<usize>>,
    valid_proxies_file: String,
    failed_proxies_file: String,
    failure_counts: Arc<Mutex<HashMap<String, u32>>>,
}

struct ProxyManagerAsync {
    proxies: Arc<Mutex<VecDeque<String>>>,
    current_index: Arc<Mutex<usize>>,
    valid_proxies_file: String,
    failed_proxies_file: String,
    failure_counts: Arc<Mutex<HashMap<String, u32>>>,
}

const MAX_FAILURES_BEFORE_BLACKLIST: u32 = 3; 

impl ProxyManager {
    pub fn new(valid_proxies_file: &str) -> Self {
        let failed_proxies_file = valid_proxies_file
            .replace("validproxies.txt", "failedproxies.txt");
        
        ProxyManager {
            proxies: Arc::new(Mutex::new(VecDeque::new())),
            current_index: Arc::new(Mutex::new(0)),
            valid_proxies_file: valid_proxies_file.to_string(),
            failed_proxies_file,
            failure_counts: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn load_proxies(&self) -> Result<usize, Box<dyn std::error::Error>> {
        if !Path::new(&self.valid_proxies_file).exists() {
            warn!(arquivo = %self.valid_proxies_file, "Arquivo de proxies válidos não encontrado");
            return Ok(0);
        }

        let content = fs::read_to_string(&self.valid_proxies_file).await?;
        let mut proxies_with_time: Vec<(String, u128)> = Vec::new();

        for line in content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // http://192.168.1.1:8080[500ms]
            let (proxy_url, time_ms) = if let Some(bracket_pos) = trimmed.rfind('[') {
                let proxy_part = trimmed[..bracket_pos].to_string();
                let time_part = trimmed[bracket_pos + 1..].trim_end_matches(']').trim_end_matches("ms");
                let ms = time_part.parse::<u128>().unwrap_or(u128::MAX);
                (proxy_part, ms)
            } else {
                (trimmed.to_string(), u128::MAX)
            };

            if proxy_url.starts_with("http://") || 
               proxy_url.starts_with("https://") || 
               proxy_url.starts_with("socks4://") || 
               proxy_url.starts_with("socks5://") {
                proxies_with_time.push((proxy_url, time_ms));
            }
        }
        proxies_with_time.sort_by_key(|(_, ms)| *ms);

        let mut proxies = self.proxies.lock().unwrap();
        proxies.clear();
        for (proxy_url, _) in proxies_with_time {
            proxies.push_back(proxy_url);
        }

        let count = proxies.len();
        info!(quantidade = count, "Proxies carregados do arquivo em ordem de velocidade");
        Ok(count)
    }

    pub fn add_proxy(&self, proxy: String) {
        let mut proxies = self.proxies.lock().unwrap();
        if !proxies.contains(&proxy) {
            proxies.push_back(proxy);
        }
    }

    pub fn add_proxies(&self, proxies: Vec<String>) {
        let mut locked = self.proxies.lock().unwrap();
        for proxy in proxies {
            if !locked.contains(&proxy) {
                locked.push_back(proxy);
            }
        }
    }

    // rotação round-robin
    pub fn get_next_proxy(&self) -> Option<String> {
        let mut proxies = self.proxies.lock().unwrap();
        
        if proxies.is_empty() {
            return None;
        }

        let proxy = proxies.pop_front().unwrap();
        proxies.push_back(proxy.clone());
        Some(proxy)
    }

    pub fn mark_proxy_failed(&self, proxy: &str) {
        let mut failure_counts = self.failure_counts.lock().unwrap();
        let count = failure_counts.entry(proxy.to_string()).or_insert(0);
        *count += 1;
        let failure_count = *count;
        let is_socks4 = proxy.starts_with("socks4://");
        drop(failure_counts);
        
        warn!(proxy = %proxy, falhas = failure_count, eh_socks4 = is_socks4, "Proxy marcado como falhado");
        
        if failure_count >= MAX_FAILURES_BEFORE_BLACKLIST {
            let mut proxies = self.proxies.lock().unwrap();
            proxies.retain(|p| p != proxy);
            drop(proxies);
            warn!(proxy = %proxy, falhas = failure_count, "Proxy removido da fila: atingiu limite de falhas");
            let manager_self = self.clone_for_async();
            let proxy_str = proxy.to_string();
            tokio::spawn(async move {
                if let Err(e) = manager_self.save_failed_proxy(&proxy_str).await {
                    tracing::error!(proxy = %proxy_str, erro = %e, "Falha ao salvar proxy em failedproxies.txt");
                }
                
                if let Err(e) = manager_self.remove_proxy_from_file(&proxy_str).await {
                    tracing::error!(proxy = %proxy_str, erro = %e, "Falha ao remover proxy de validproxies.txt");
                }
            });
        } else {
            let mut proxies = self.proxies.lock().unwrap();
            if let Some(front_proxy) = proxies.pop_front() {
                if front_proxy == proxy {
                    proxies.push_back(front_proxy);
                } else {
                    proxies.push_front(front_proxy);
                }
            }
        }
    }

    fn clone_for_async(&self) -> ProxyManagerAsync {
        ProxyManagerAsync {
            proxies: self.proxies.clone(),
            current_index: self.current_index.clone(),
            valid_proxies_file: self.valid_proxies_file.clone(),
            failed_proxies_file: self.failed_proxies_file.clone(),
            failure_counts: self.failure_counts.clone(),
        }
    }

    pub fn get_current_proxy(&self) -> Option<String> {
        let proxies = self.proxies.lock().unwrap();
        proxies.front().cloned()
    }

    pub fn remove_proxy(&self, proxy: &str) -> bool {
        let mut proxies = self.proxies.lock().unwrap();
        let initial_len = proxies.len();
        proxies.retain(|p| p != proxy);
        proxies.len() < initial_len
    }

    pub fn clear_proxies(&self) {
        let mut proxies = self.proxies.lock().unwrap();
        proxies.clear();
        let mut failures = self.failure_counts.lock().unwrap();
        failures.clear();
    }

    pub fn remove_failing_socks4(&self) -> usize {
        let failure_counts = self.failure_counts.lock().unwrap();
        let mut proxies = self.proxies.lock().unwrap();
        
        let initial_count = proxies.len();
        
        proxies.retain(|proxy| {
            if proxy.starts_with("socks4://") {
                let failures = failure_counts.get(proxy).copied().unwrap_or(0);
                if failures >= MAX_FAILURES_BEFORE_BLACKLIST {
                    warn!(proxy = %proxy, falhas = failures, "Removendo SOCKS4 com muitas falhas");
                    return false;
                }
            }
            true
        });
        
        let removed = initial_count - proxies.len();
        if removed > 0 {
            info!(removidos = removed, "Proxies SOCKS4 ruins removidos");
        }
        removed
    }

    pub fn get_failure_stats(&self) -> Vec<(String, u32)> {
        let failures = self.failure_counts.lock().unwrap();
        let mut stats: Vec<_> = failures
            .iter()
            .map(|(k, v)| (k.clone(), *v))
            .collect();
        stats.sort_by_key(|(_,count)| std::cmp::Reverse(*count));
        stats
    }

    pub fn proxy_count(&self) -> usize {
        let proxies = self.proxies.lock().unwrap();
        proxies.len()
    }

    pub fn list_proxies(&self) -> Vec<String> {
        let proxies = self.proxies.lock().unwrap();
        proxies.iter().cloned().collect()
    }

    pub async fn save_proxies(&self) -> Result<(), Box<dyn std::error::Error>> {
        let proxies = self.proxies.lock().unwrap();
        let content = proxies.iter().map(|p| p.as_str()).collect::<Vec<_>>().join("\n");
        fs::write(&self.valid_proxies_file, content).await?;
        info!(quantidade = proxies.len(), arquivo = %self.valid_proxies_file, "Proxies salvos no arquivo");
        Ok(())
    }

    pub fn create_client(&self) -> Result<ProxyClient, Box<dyn std::error::Error>> {
        match self.get_next_proxy() {
            Some(proxy) => ProxyClient::with_proxy(&proxy),
            None => ProxyClient::new().map_err(|e| Box::new(e) as Box<dyn std::error::Error>),
        }
    }
}

impl Default for ProxyManager {
    fn default() -> Self {
        ProxyManager::new("server/validproxies.txt")
    }
}

impl ProxyManagerAsync {
    pub async fn save_failed_proxy(&self, proxy: &str) -> Result<(), Box<dyn std::error::Error>> {
        let failure_count = {
            let failure_counts = self.failure_counts.lock().unwrap();
            failure_counts.get(proxy).copied().unwrap_or(0)
        };
        let entry = format!("{}[failed={}]\n", proxy, failure_count);
        
        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.failed_proxies_file)
            .await?;
        
        use tokio::io::AsyncWriteExt;
        file.write_all(entry.as_bytes()).await?;
        
        info!(proxy = %proxy, falhas = failure_count, arquivo = %self.failed_proxies_file, "Proxy salvo em failedproxies.txt");
        Ok(())
    }

    pub async fn remove_proxy_from_file(&self, proxy: &str) -> Result<(), Box<dyn std::error::Error>> {
        if !Path::new(&self.valid_proxies_file).exists() {
            return Ok(());
        }

        let content = fs::read_to_string(&self.valid_proxies_file).await?;
        let filtered_lines: Vec<&str> = content
            .lines()
            .filter(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return false;
                }
                let proxy_part = if let Some(bracket_pos) = trimmed.rfind('[') {
                    &trimmed[..bracket_pos]
                } else {
                    trimmed
                };
                proxy_part != proxy
            })
            .collect();

        let new_content = filtered_lines.join("\n");
        fs::write(&self.valid_proxies_file, new_content).await?;
        
        info!(proxy = %proxy, arquivo = %self.valid_proxies_file, "Proxy removido de validproxies.txt");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_manager_creation() {
        let manager = ProxyManager::new("test_proxies.txt");
        assert_eq!(manager.proxy_count(), 0);
    }

    #[test]
    fn test_add_and_get_proxy() {
        let manager = ProxyManager::new("test_proxies.txt");
        manager.add_proxy("http://proxy1.com:8080".to_string());
        assert_eq!(manager.proxy_count(), 1);
        assert_eq!(manager.get_current_proxy(), Some("http://proxy1.com:8080".to_string()));
    }

    #[test]
    fn test_proxy_rotation() {
        let manager = ProxyManager::new("test_proxies.txt");
        manager.add_proxies(vec![
            "http://proxy1.com:8080".to_string(),
            "http://proxy2.com:8080".to_string(),
        ]);

        let first = manager.get_next_proxy();
        let second = manager.get_next_proxy();
        let third = manager.get_next_proxy();

        assert_eq!(first, Some("http://proxy1.com:8080".to_string()));
        assert_eq!(second, Some("http://proxy2.com:8080".to_string()));
        assert_eq!(third, Some("http://proxy1.com:8080".to_string()));
    }

    #[test]
    fn test_remove_proxy() {
        let manager = ProxyManager::new("test_proxies.txt");
        manager.add_proxy("http://proxy1.com:8080".to_string());
        assert_eq!(manager.proxy_count(), 1);
        assert!(manager.remove_proxy("http://proxy1.com:8080"));
        assert_eq!(manager.proxy_count(), 0);
    }
}

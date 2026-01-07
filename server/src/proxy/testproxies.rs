use reqwest::Client;
use std::time::Duration;
use tokio::fs;
use tokio::task;
use std::path::Path;
use std::time::Instant;
use super::socks_client::SocksHttpClient;
use tracing::{debug, info, warn};

pub struct ProxyTester {
    test_url: String,
    timeout: Duration,
}

impl ProxyTester {
    pub fn new(test_url: &str) -> Self {
        ProxyTester {
            test_url: test_url.to_string(),
            timeout: Duration::from_secs(5),
        }
    }

    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    pub async fn test_proxy_with_time(&self, proxy_url: &str) -> Option<(String, u128)> {
        debug!(proxy = %proxy_url, "Iniciando teste de proxy");
        
        let start = Instant::now();
        
        // HTTP, HTTPS, SOCKS4 e SOCKS5
        let result = if proxy_url.starts_with("socks4://") || proxy_url.starts_with("socks5://") {
            // Para SOCKS, usa o cliente com suporte SOCKS
            Self::test_socks_proxy(proxy_url, &self.test_url, self.timeout).await
        } else {
            // Para HTTP/HTTPS, usa o método padrão do reqwest
            Self::test_http_proxy(proxy_url, &self.test_url, self.timeout).await
        };

        if let Some(true) = result {
            let elapsed = start.elapsed().as_millis();
            info!(proxy = %proxy_url, tempo_ms = elapsed, "Proxy testado com sucesso");
            return Some((proxy_url.to_string(), elapsed));
        } else if let Some(false) = result {
            warn!(proxy = %proxy_url, "Falha na conexão do proxy");
        } else {
            warn!(proxy = %proxy_url, "URL de proxy inválida");
        }
        None
    }

    async fn test_http_proxy(proxy_url: &str, test_url: &str, timeout: Duration) -> Option<bool> {
        match reqwest::Proxy::all(proxy_url) {
            Ok(proxy) => {
                match Client::builder()
                    .proxy(proxy)
                    .timeout(timeout)
                    .build()
                {
                    Ok(client) => {
                        match client.get(test_url).send().await {
                            Ok(response) => Some(response.status().is_success()),
                            Err(_) => Some(false),
                        }
                    }
                    Err(_) => Some(false),
                }
            }
            Err(_) => None,
        }
    }

    async fn test_socks_proxy(proxy_url: &str, test_url: &str, timeout: Duration) -> Option<bool> {
        let url_part = if proxy_url.starts_with("socks5://") {
            &proxy_url[9..]
        } else if proxy_url.starts_with("socks4://") {
            &proxy_url[9..]
        } else {
            return None;
        };

        let parts: Vec<&str> = url_part.split(':').collect();
        if parts.len() < 2 {
            return None;
        }

        match SocksHttpClient::new(proxy_url, timeout) {
            Ok(client) => {
                let headers = reqwest::header::HeaderMap::new();
                match tokio::time::timeout(
                    timeout,
                    client.get(test_url, &headers)
                ).await {
                    Ok(Ok(_response)) => Some(true),
                    Ok(Err(e)) => {
                        warn!(erro = %e, "Erro ao testar proxy SOCKS");
                        Some(false)
                    },
                    Err(_) => Some(false), 
                }
            }
            Err(e) => {
                warn!(erro = %e, "Falha ao criar cliente SOCKS");
                Some(false)
            }
        }
    }

    pub async fn test_proxy(&self, proxy_url: &str) -> bool {
        self.test_proxy_with_time(proxy_url).await.is_some()
    }

    pub async fn test_proxies_parallel(
        &self,
        proxies: Vec<String>,
        concurrency: usize,
    ) -> Vec<String> {
        let mut valid_proxies = Vec::new();
        let mut handles = Vec::new();

        for proxy in proxies.iter().take(concurrency) {
            let proxy_clone = proxy.clone();
            let test_url = self.test_url.clone();
            let timeout = self.timeout;

            let handle = task::spawn(async move {
                Self::_test_proxy_internal(&proxy_clone, &test_url, timeout).await
            });

            handles.push((proxy.clone(), handle));
        }

        for (proxy, handle) in handles {
            match handle.await {
                Ok(is_valid) if is_valid => {
                    valid_proxies.push(proxy);
                }
                _ => {}
            }
        }

        valid_proxies
    }

    async fn _test_proxy_internal(proxy_url: &str, test_url: &str, timeout: Duration) -> bool {
        match reqwest::Proxy::all(proxy_url) {
            Ok(proxy) => {
                match Client::builder()
                    .proxy(proxy)
                    .timeout(timeout)
                    .build()
                {
                    Ok(client) => {
                        match client.get(test_url).send().await {
                            Ok(response) => response.status().is_success(),
                            Err(_) => false,
                        }
                    }
                    Err(_) => false,
                }
            }
            Err(_) => false,
        }
    }

    pub async fn test_proxies_from_file(
        &self,
        input_file: &str,
        output_file: &str,
    ) -> Result<(usize, usize), Box<dyn std::error::Error>> {
        if !Path::new(input_file).exists() {
            return Err(format!("Arquivo não encontrado: {}", input_file).into());
        }

        let content = fs::read_to_string(input_file).await?;
        let proxies: Vec<String> = content
            .lines()
            .map(|line| {
                let trimmed = line.trim().to_string();
                if !trimmed.is_empty() && 
                   !trimmed.starts_with("http://") && 
                   !trimmed.starts_with("https://") && 
                   !trimmed.starts_with("socks4://") && 
                   !trimmed.starts_with("socks5://") &&
                   trimmed.contains(':') {
                    format!("http://{}", trimmed)
                } else {
                    trimmed
                }
            })
            .filter(|line| !line.is_empty() && 
                          (line.starts_with("http://") || 
                           line.starts_with("https://") || 
                           line.starts_with("socks4://") || 
                           line.starts_with("socks5://")))
            .collect();

        let total = proxies.len();
        info!(total = total, "Iniciando teste de proxies");
        let mut valid_proxies = Vec::new();
        for proxy in proxies {
            if self.test_proxy(&proxy).await {
                valid_proxies.push(proxy);
            }
        }

        let valid_count = valid_proxies.len();
        info!(validos = valid_count, total = total, "Teste de proxies concluído");
        let output_content = valid_proxies.join("\n");
        fs::write(output_file, output_content).await?;
        info!(arquivo = %output_file, "Proxies válidos salvos");

        Ok((valid_count, total))
    }
}

impl Default for ProxyTester {
    fn default() -> Self {
        ProxyTester::new("https://httpbin.org/ip")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_proxy_tester_creation() {
        let tester = ProxyTester::new("https://httpbin.org/ip");
        assert_eq!(tester.test_url, "https://httpbin.org/ip");
    }

    #[tokio::test]
    async fn test_invalid_proxy() {
        let tester = ProxyTester::new("https://httpbin.org/ip");
        let is_valid = tester.test_proxy("http://invalid.proxy:9999").await;
        assert!(!is_valid);
    }
}

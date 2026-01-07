use reqwest::{Client, Proxy};
pub struct ProxyClient {
    client: Client,
    current_proxy: Option<String>,
}

impl ProxyClient {
    pub fn new() -> Result<Self, reqwest::Error> {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        Ok(ProxyClient {
            client,
            current_proxy: None,
        })
    }

    pub fn with_proxy(proxy_url: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // Valida o formato do proxy
        if !Self::is_valid_proxy_format(proxy_url) {
            return Err(format!("Formato de proxy inválido (use HTTP/HTTPS): {}", proxy_url).into());
        }

        let proxy = Proxy::all(proxy_url)?;
        let client = Client::builder()
            .proxy(proxy)
            .timeout(std::time::Duration::from_secs(10))
            .build()?;

        Ok(ProxyClient {
            client,
            current_proxy: Some(proxy_url.to_string()),
        })
    }

    fn is_valid_proxy_format(proxy_url: &str) -> bool {
        proxy_url.starts_with("http://") ||
        proxy_url.starts_with("https://")
    }

    pub fn client(&self) -> &Client {
        &self.client
    }

    pub fn current_proxy(&self) -> Option<&str> {
        self.current_proxy.as_deref()
    }

    pub fn set_proxy(&mut self, proxy_url: &str) -> Result<(), Box<dyn std::error::Error>> {
        if !Self::is_valid_proxy_format(proxy_url) {
            return Err(format!("Formato de proxy inválido (use HTTP/HTTPS): {}", proxy_url).into());
        }

        let proxy = Proxy::all(proxy_url)?;
        self.client = Client::builder()
            .proxy(proxy)
            .timeout(std::time::Duration::from_secs(10))
            .build()?;
        self.current_proxy = Some(proxy_url.to_string());
        Ok(())
    }

    pub fn remove_proxy(&mut self) -> Result<(), reqwest::Error> {
        self.client = Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()?;
        self.current_proxy = None;
        Ok(())
    }
}

impl Default for ProxyClient {
    fn default() -> Self {
        Self::new().expect("Falha ao criar ProxyClient padrão")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_client_creation() {
        let client = ProxyClient::new();
        assert!(client.is_ok());
    }

    #[test]
    fn test_proxy_client_default() {
        let client = ProxyClient::default();
        assert!(client.current_proxy().is_none());
    }
}

use reqwest::header::HeaderMap;
use std::time::Duration;
use tokio_socks::tcp::{Socks5Stream, Socks4Stream};
use tokio::io::{AsyncReadExt, AsyncWriteExt, AsyncRead, AsyncWrite};
use tokio_native_tls::native_tls;
use std::pin::Pin;
use std::task::{Context, Poll};
use tracing::{debug, info, error};

enum SocksStreamType {
    Socks4(Socks4Stream<tokio::net::TcpStream>),
    Socks5(Socks5Stream<tokio::net::TcpStream>),
}

impl AsyncRead for SocksStreamType {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        match &mut *self {
            Self::Socks4(stream) => Pin::new(stream).poll_read(cx, buf),
            Self::Socks5(stream) => Pin::new(stream).poll_read(cx, buf),
        }
    }
}

impl AsyncWrite for SocksStreamType {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match &mut *self {
            Self::Socks4(stream) => Pin::new(stream).poll_write(cx, buf),
            Self::Socks5(stream) => Pin::new(stream).poll_write(cx, buf),
        }
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match &mut *self {
            Self::Socks4(stream) => Pin::new(stream).poll_flush(cx),
            Self::Socks5(stream) => Pin::new(stream).poll_flush(cx),
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match &mut *self {
            Self::Socks4(stream) => Pin::new(stream).poll_shutdown(cx),
            Self::Socks5(stream) => Pin::new(stream).poll_shutdown(cx),
        }
    }
}

impl SocksStreamType {
    async fn write_all(&mut self, buf: &[u8]) -> std::io::Result<()> {
        match self {
            Self::Socks4(stream) => stream.write_all(buf).await,
            Self::Socks5(stream) => stream.write_all(buf).await,
        }
    }

    async fn flush(&mut self) -> std::io::Result<()> {
        match self {
            Self::Socks4(stream) => stream.flush().await,
            Self::Socks5(stream) => stream.flush().await,
        }
    }

    async fn read_to_end(&mut self, buf: &mut Vec<u8>) -> std::io::Result<usize> {
        match self {
            Self::Socks4(stream) => stream.read_to_end(buf).await,
            Self::Socks5(stream) => stream.read_to_end(buf).await,
        }
    }
}

enum SocksStream {
    Plain(SocksStreamType),
    Tls(tokio_native_tls::TlsStream<SocksStreamType>),
}

impl SocksStream {
    async fn write_all(&mut self, buf: &[u8]) -> std::io::Result<()> {
        match self {
            Self::Plain(stream) => stream.write_all(buf).await,
            Self::Tls(stream) => stream.write_all(buf).await,
        }
    }

    async fn flush(&mut self) -> std::io::Result<()> {
        match self {
            Self::Plain(stream) => stream.flush().await,
            Self::Tls(stream) => stream.flush().await,
        }
    }

    async fn read_to_end(&mut self, buf: &mut Vec<u8>) -> std::io::Result<usize> {
        match self {
            Self::Plain(stream) => stream.read_to_end(buf).await,
            Self::Tls(stream) => stream.read_to_end(buf).await,
        }
    }
}

pub struct SocksHttpClient {
    socks_host: String,
    socks_port: u16,
    timeout: Duration,
    is_socks4: bool,
}

impl SocksHttpClient {
    pub fn new(socks_url: &str, timeout: Duration) -> Result<Self, Box<dyn std::error::Error>> {
        let parts: Vec<&str> = socks_url.split("://").collect();
        if parts.len() != 2 {
            return Err("URL SOCKS inválida".into());
        }
        
        let is_socks4 = parts[0] == "socks4";
        
        let addr_parts: Vec<&str> = parts[1].split(':').collect();
        if addr_parts.len() != 2 {
            return Err("Formato host:port inválido".into());
        }
        
        let host = addr_parts[0].to_string();
        let port: u16 = addr_parts[1].parse()?;
        
        Ok(SocksHttpClient {
            socks_host: host,
            socks_port: port,
            timeout,
            is_socks4,
        })
    }

    pub async fn get(
        &self,
        url: &str,
        headers: &HeaderMap,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let parsed_url = reqwest::Url::parse(url)?;
        let host = parsed_url.host_str().ok_or("Host inválido")?;
        let port = parsed_url.port().unwrap_or(if parsed_url.scheme() == "https" { 443 } else { 80 });
        let is_https = parsed_url.scheme() == "https";
        
        let socks_type = if self.is_socks4 { "SOCKS4" } else { "SOCKS5" };
        debug!(proxy_tipo = socks_type, url = url, "Iniciando requisição GET via SOCKS");
        let socks_addr = format!("{}:{}", self.socks_host, self.socks_port);
        debug!(proxy_endereco = %socks_addr, "Conectando ao proxy SOCKS");
        
        let tcp_stream = if self.is_socks4 {
            match tokio::time::timeout(
                self.timeout,
                Socks4Stream::connect(socks_addr.as_str(), (host, port)),
            )
            .await {
                Ok(Ok(stream)) => {
                    debug!(protocolo = "SOCKS4", "Conexão bem-sucedida com proxy");
                    SocksStreamType::Socks4(stream)
                }
                Ok(Err(e)) => {
                    error!(protocolo = "SOCKS4", err = %e, "Falha na conexão com proxy");
                    return Err(format!("Falha ao conectar via SOCKS4: {}", e).into());
                }
                Err(e) => {
                    debug!(connection = "timeout", err = %e);
                    return Err(format!("Timeout ao conectar via SOCKS4: {}", e).into());
                }
            }
        } else {
            match tokio::time::timeout(
            self.timeout,
            Socks5Stream::connect(socks_addr.as_str(), (host, port)),
        )
        .await {
            Ok(Ok(stream)) => {
                    debug!(connection = "successful");
                    SocksStreamType::Socks5(stream)
            }
            Ok(Err(e)) => {
                    debug!(connection = "failed", err = %e);
                    return Err(format!("Falha ao conectar via SOCKS5: {}", e).into());
            }
            Err(e) => {
                    debug!(connection = "timeout", err = %e);
                    return Err(format!("Timeout ao conectar via SOCKS5: {}", e).into());
                }
            }
        };

        let mut stream = if is_https {
            debug!(host = host, "Iniciando TLS handshake");
            match native_tls::TlsConnector::builder()
                .danger_accept_invalid_certs(true)  
                .build() {
                Ok(connector) => {
                    let async_connector = tokio_native_tls::TlsConnector::from(connector);
                    match async_connector.connect(host, tcp_stream).await {
                        Ok(tls_stream) => {
                            info!("TLS handshake bem-sucedido");
                            SocksStream::Tls(tls_stream)
                        }
                        Err(e) => {
                            error!(err = %e, "Falha no TLS handshake");
                            return Err(format!("Falha no TLS handshake: {}", e).into());
                        }
                    }
                }
                Err(e) => {
                    error!(err = %e, "Erro ao criar TLS connector");
                    return Err(format!("Erro ao criar TLS connector: {}", e).into());
                }
            }
        } else {
            SocksStream::Plain(tcp_stream)
        };

        let mut request = format!(
            "GET {} HTTP/1.1\r\nHost: {}\r\n",
            parsed_url.path(),
            host
        );

        for (name, value) in headers.iter() {
            request.push_str(&format!(
                "{}: {}\r\n",
                name,
                value.to_str().unwrap_or("")
            ));
        }
        request.push_str("Connection: close\r\n\r\n");
        if let Err(e) = stream.write_all(request.as_bytes()).await {
            error!(erro = %e, "Erro ao enviar requisição");
            return Err(format!("Erro ao enviar request: {}", e).into());
        }
        
        if let Err(e) = stream.flush().await {
            error!(erro = %e, "Erro ao fazer flush");
            return Err(format!("Erro ao fazer flush: {}", e).into());
        }

        let mut response = Vec::new();
        match stream.read_to_end(&mut response).await {
            Ok(_) => {
                debug!(bytes = response.len(), "Resposta recebida");
                Ok(String::from_utf8_lossy(&response).to_string())
            }
            Err(e) => {
                error!(erro = %e, "Erro ao ler resposta");
                Err(format!("Erro ao ler resposta: {}", e).into())
            }
        }
    }

    pub async fn post(
        &self,
        url: &str,
        headers: &HeaderMap,
        body: &str,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let parsed_url = reqwest::Url::parse(url)?;
        let host = parsed_url.host_str().ok_or("Host inválido")?;
        let port = parsed_url.port().unwrap_or(if parsed_url.scheme() == "https" { 443 } else { 80 });
        let is_https = parsed_url.scheme() == "https";
        
        let socks_type = if self.is_socks4 { "SOCKS4" } else { "SOCKS5" };
        debug!("Iniciando requisição POST via {}: {}://{}:{}{}", socks_type, parsed_url.scheme(), host, port, parsed_url.path());
    
        let socks_addr = format!("{}:{}", self.socks_host, self.socks_port);
        debug!(proxy = %socks_addr, "Conectando ao proxy SOCKS");
        
        let tcp_stream = if self.is_socks4 {
            match tokio::time::timeout(
                self.timeout,
                Socks4Stream::connect(socks_addr.as_str(), (host, port)),
            )
            .await {
                Ok(Ok(stream)) => {
                    debug!(protocolo = "SOCKS4", "Conexão bem-sucedida com proxy");
                    SocksStreamType::Socks4(stream)
                }
                Ok(Err(e)) => {
                    error!(protocolo = "SOCKS4", err = %e, "Falha na conexão com proxy");
                    return Err(format!("Falha ao conectar via SOCKS4: {}", e).into());
                }
                Err(e) => {
                    debug!(connection = "timeout", err = %e);
                    return Err(format!("Timeout ao conectar via SOCKS4: {}", e).into());
                }
            }
        } else {
            match tokio::time::timeout(
            self.timeout,
            Socks5Stream::connect(socks_addr.as_str(), (host, port)),
        )
        .await {
            Ok(Ok(stream)) => {
                    debug!(connection = "successful");
                    SocksStreamType::Socks5(stream)
            }
            Ok(Err(e)) => {
                    debug!(connection = "failed", err = %e);
                    return Err(format!("Falha ao conectar via SOCKS5: {}", e).into());
            }
            Err(e) => {
                    debug!(connection = "timeout", err = %e);
                    return Err(format!("Timeout ao conectar via SOCKS5: {}", e).into());
                }
            }
        };

        let mut stream = if is_https {
            debug!(host = host, "Iniciando TLS handshake");
            match native_tls::TlsConnector::builder()
                .danger_accept_invalid_certs(true)  
                .build() {
                Ok(connector) => {
                    let async_connector = tokio_native_tls::TlsConnector::from(connector);
                    match async_connector.connect(host, tcp_stream).await {
                        Ok(tls_stream) => {
                            info!("TLS handshake bem-sucedido");
                            SocksStream::Tls(tls_stream)
                        }
                        Err(e) => {
                            error!(erro = %e, "Falha no TLS handshake");
                            return Err(format!("Falha no TLS handshake: {}", e).into());
                        }
                    }
                }
                Err(e) => {
                    error!(erro = %e, "Erro ao criar TLS connector");
                    return Err(format!("Erro ao criar TLS connector: {}", e).into());
                }
            }
        } else {
            SocksStream::Plain(tcp_stream)
        };

        let mut request = format!(
            "POST {} HTTP/1.1\r\nHost: {}\r\nContent-Length: {}\r\n",
            parsed_url.path(),
            host,
            body.len()
        );

        for (name, value) in headers.iter() {
            request.push_str(&format!(
                "{}: {}\r\n",
                name,
                value.to_str().unwrap_or("")
            ));
        }
        request.push_str("Connection: close\r\n\r\n");

        if let Err(e) = stream.write_all(request.as_bytes()).await {
            error!(erro = %e, "Erro ao enviar headers");
            return Err(format!("Erro ao enviar headers: {}", e).into());
        }
        
        if let Err(e) = stream.write_all(body.as_bytes()).await {
            error!(erro = %e, "Erro ao enviar body");
            return Err(format!("Erro ao enviar body: {}", e).into());
        }
        
        if let Err(e) = stream.flush().await {
            error!(erro = %e, "Erro ao fazer flush");
            return Err(format!("Erro ao fazer flush: {}", e).into());
        }

        let mut response = Vec::new();
        match stream.read_to_end(&mut response).await {
            Ok(_) => {
                debug!(bytes = response.len(), "Resposta recebida");
                Ok(String::from_utf8_lossy(&response).to_string())
            }
            Err(e) => {
                error!(erro = %e, "Erro ao ler resposta");
                Err(format!("Erro ao ler resposta: {}", e).into())
            }
        }
    }
}

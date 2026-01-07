use waluna_back::proxy::ProxyTester;
use std::time::Duration;
use tokio::fs;
use tracing::{error, info, warn};

#[tokio::main]
async fn main() {
    let tester = ProxyTester::new("https://httpbin.org/ip")
        .with_timeout(Duration::from_secs(5));

    let proxy_file = "./proxylist.txt";

    // Verifica se o arquivo existe
    if !std::path::Path::new(proxy_file).exists() {
        error!(arquivo = %proxy_file, "Arquivo de proxies não encontrado");
        return;
    }

    // Lê e testa proxies do arquivo
    match test_proxies(&tester, proxy_file).await {
        Ok((total, valid)) => {
            println!("\n📊 Resultado final:");
            println!("  Total de proxies: {}", total);
            println!("  Proxies válidas: {}", valid.len());
            println!("  Taxa de sucesso: {:.2}%", (valid.len() as f64 / total as f64) * 100.0);

            if !valid.is_empty() {
                // Salva as proxies válidas em validproxies.txt
                let mut valid_vec: Vec<String> = valid
                    .into_iter()
                    .map(|(proxy, ms)| format!("{}[{}ms]", proxy, ms))
                    .collect();
                valid_vec.sort();

                match fs::write("./validproxies.txt", valid_vec.join("\n")).await {
                    Ok(_) => println!("✅ Proxies válidas salvas em validproxies.txt"),
                    Err(e) => error!(erro = %e, "Erro ao salvar proxies válidas"),
                }
            }
        }
        Err(e) => error!(erro = %e, "Erro ao testar proxies"),
    }
}

async fn test_proxies(
    tester: &ProxyTester,
    file: &str,
) -> Result<(usize, Vec<(String, u128)>), Box<dyn std::error::Error>> {
    let content = fs::read_to_string(file).await?;
    let proxies: Vec<String> = content
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            // Remove o tempo se existir: http://192.168.1.1:8080[25ms] -> http://192.168.1.1:8080
            if let Some(bracket_pos) = trimmed.rfind('[') {
                trimmed[..bracket_pos].to_string()
            } else {
                trimmed.to_string()
            }
        })
        .filter(|line| !line.is_empty())
        .collect();

    let total = proxies.len();
    println!("🔍 Testando {} proxies de {}...\n", total, file);

    let mut valid_proxies = Vec::new();

    for (index, proxy) in proxies.iter().enumerate() {
        // Detecta e normaliza o tipo de proxy
        let full_proxy = if proxy.starts_with("http://") || 
                           proxy.starts_with("https://") || 
                           proxy.starts_with("socks4://") || 
                           proxy.starts_with("socks5://") {
            proxy.clone()
        } else {
            // Se não tem protocolo, tenta inferir pelo formato ou assume HTTP
            if proxy.starts_with("socks4") {
                format!("socks4://{}", proxy)
            } else if proxy.starts_with("socks5") {
                format!("socks5://{}", proxy)
            } else {
                format!("http://{}", proxy)
            }
        };

        if let Some((proxy_url, ms)) = tester.test_proxy_with_time(&full_proxy).await {
            valid_proxies.push((proxy_url, ms));
            print!("✅");
        } else {
            print!("❌");
        }

        if (index + 1) % 50 == 0 {
            println!(" [{}/{}]", index + 1, total);
        }
    }

    if (total % 50) != 0 {
        println!(" [{}/{}]", total, total);
    }

    // Ordena por tempo de resposta (menor primeiro)
    valid_proxies.sort_by_key(|(_, ms)| *ms);

    Ok((total, valid_proxies))
}


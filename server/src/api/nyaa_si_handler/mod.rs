use axum::{Json, extract::Query, response::{Response, IntoResponse}, http::StatusCode};
use nyaa_si::{Client, NyaaClient, QueryBuilder, Sort, NyaaCategory};
use nyaa_si::query::Filter;
use serde_json::{json, Value};
use std::error::Error;
use std::collections::HashMap;

// Client
pub struct NyaaService {
    client: NyaaClient,
}

// Service
impl NyaaService {
    pub fn new() -> Self {
        Self {
            client: NyaaClient::new(),
        }
    }

    // Método search que faz a busca e retorna os resultados na forma de Vec<Value>
    pub async fn search(&self, query: &str) -> Result<Vec<Value>, Box<dyn Error>> {
        let search_query = QueryBuilder::new()
            .search(query)
            .category(NyaaCategory::Anime)
            //.filter(Filter::TrustedOnly)
            .sort(Sort::Seeders)
            .page(1)
            .build();

        let results = self.client.get(&search_query).await?;
        
        //Formata p json
        let formatted_results: Vec<Value> = results
            .iter()
            .map(|torrent| {
                json!({
                    "title": torrent.title,
                    "link": torrent.link,
                    "magnet": torrent.magnet_url,
                    "size": format!("{:?}", torrent.size),
                    "seeders": torrent.seeders,
                    "leechers": torrent.leechers,
                    "downloads": torrent.downloads,
                    "date": format!("{:?}", torrent.date)
                })
            })
            .collect();

        Ok(formatted_results)
    }
}

// Handler da API
// Suporte para query params: q (string), pretty (bool)
// q: Termo de busca (ex: ?q=One+Piece)
// pretty: Formatação bonita do JSON (ex: ?pretty=1)
pub async fn search(Query(params): Query<HashMap<String, String>>) -> Response {
    let service = NyaaService::new();

    let q = params.get("q").map(|s| s.as_str()).unwrap_or("Ousama Ranking");
    let pretty = params.get("pretty").map(|v| v == "1" || v.eq_ignore_ascii_case("true")).unwrap_or(false);

    match service.search(q).await {
        Ok(results) => {
            let payload = json!({
                "ok": true,
                "query": q,
                "results": results,
                "count": results.len()
            });

            if pretty {
                match serde_json::to_string_pretty(&payload) {
                    Ok(s) => Response::builder()
                        .status(StatusCode::OK)
                        .header("content-type", "application/json; charset=utf-8")
                        .body(s.into())
                        .unwrap(),
                    Err(e) => Response::builder()
                        .status(StatusCode::INTERNAL_SERVER_ERROR)
                        .body(format!("failed to serialize: {}", e).into())
                        .unwrap(),
                }
            } else {
                Json(payload).into_response()
            }
        }
        Err(e) => Response::builder()
            .status(StatusCode::INTERNAL_SERVER_ERROR)
            .header("content-type", "application/json; charset=utf-8")
            .body(json!({"ok": false, "error": e.to_string()}).to_string().into())
            .unwrap(),
    }
}
#![allow(dead_code)]
use scraper::{Html, Selector};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;
use unicode_normalization::UnicodeNormalization;
use regex::Regex;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone)]
struct UserAgent(&'static str);
impl UserAgent {
    const CHROME_WIN: &'static str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const FIREFOX_WIN: &'static str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0";
    const SAFARI_MAC: &'static str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15";

    fn chrome_win() -> Self {
        Self(Self::CHROME_WIN)
    }

    fn as_str(&self) -> &str {
        self.0
    }
}

struct RegexCache {
    suffix: Regex,
    invalid: Regex,
    multi_dash: Regex,
    space: Regex,
    quality: Regex,
}

impl RegexCache {
    fn new() -> Self {
        Self {
            suffix: Regex::new(r"\b([a-z0-9]+)-(san|kun|chan|sama|sensei|senpai)\b").unwrap(),
            invalid: Regex::new(r"[^a-z0-9\s-]").unwrap(),
            multi_dash: Regex::new(r"-+").unwrap(),
            space: Regex::new(r"\s+").unwrap(),
            quality: Regex::new(r"/(\d{3,4}p)\.mp4").unwrap(),
        }
    }
}

static REGEX_CACHE: OnceLock<RegexCache> = OnceLock::new();

fn regex_cache() -> &'static RegexCache {
    REGEX_CACHE.get_or_init(RegexCache::new)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimeSearchResult {
    pub href: String,
    pub img_src: String,
    pub anime_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnimeProfile {
    #[serde(serialize_with = "ordered_map")]
    pub episodes: HashMap<String, String>,
}

fn ordered_map<S>(value: &HashMap<String, String>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: serde::Serializer,
{
    use serde::ser::SerializeMap;
    let mut entries: Vec<_> = value.iter().collect();
    entries.sort_by(|a, b| {
        a.0.parse::<u32>().unwrap_or(0).cmp(&b.0.parse::<u32>().unwrap_or(0))
    });
    let mut map = serializer.serialize_map(Some(entries.len()))?;
    for (k, v) in entries {
        map.serialize_entry(k, v)?;
    }
    map.end()
}

pub fn slugify_anime(title: &str) -> String {
    let cache = regex_cache();
    
    let mut slug: String = title
        .to_lowercase()
        .nfd()
        .filter(|c| c.is_ascii() || !unicode_normalization::char::is_combining_mark(*c))
        .collect();
    
    slug = slug.replace([':', '/', ';'], " ");
    slug = cache.invalid.replace_all(&slug, "").to_string();
    slug = cache.suffix
        .replace_all(&slug, |caps: &regex::Captures| {
            let next_char_index = caps.get(0).unwrap().end();
            if next_char_index < slug.len() && slug[next_char_index..].starts_with('-') {
                format!("{}-{}", &caps[1], &caps[2])
            } else {
                format!("{}{}", &caps[1], &caps[2])
            }
        })
        .to_string();
    slug = cache.space.replace_all(&slug, "-").to_string();
    slug = cache.multi_dash.replace_all(&slug, "-").to_string();
    slug.trim_matches('-').to_string()
}

pub fn unslugify_anime(slug: &str) -> String {
    let cache = regex_cache();
    let suffix_re = Regex::new(r"(?i)\b([a-z0-9]+)(san|kun|chan|sama|sensei|senpai)\b").unwrap();
    
    let with_suffix_mark = suffix_re.replace_all(&slug.to_lowercase(), "$1<<SUFFIX>>$2").to_string();
    let tmp = with_suffix_mark.replace('-', " ").replace("<<SUFFIX>>", "-");
    let tmp = cache.space.replace_all(tmp.trim(), " ").to_string();
    
    const SUFFIXES: &[&str] = &["san", "kun", "chan", "sama", "sensei", "senpai"];
    
    tmp.split(' ')
        .map(|word| {
            if word.contains('-') {
                word.split('-')
                    .enumerate()
                    .map(|(i, part)| {
                        if i > 0 && SUFFIXES.contains(&part) {
                            part.to_lowercase()
                        } else {
                            _capitalize(part)
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("-")
            } else if SUFFIXES.contains(&word) {
                word.to_lowercase()
            } else {
                _capitalize(word)
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[inline]
fn _capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase(),
    }
}

static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn get_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| {
        let ua = UserAgent::chrome_win();
        Client::builder()
            .user_agent(ua.as_str())
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .expect("nao conseguiu subir o client HTTP")
    })
}

pub async fn fetch_html(url: &str) -> Result<String, reqwest::Error> {
    get_client()
        .get(url)
        .send()
        .await?
        .text()
        .await
}

pub async fn search_anime(anime_query: &str) -> Result<Vec<AnimeSearchResult>, Box<dyn Error>> {
    let slug = slugify_anime(anime_query);
    let url = format!("https://animefire.io/pesquisar/{}", slug);
    let html = fetch_html(&url).await?;
    parse_search_tags(&html)
}

pub fn parse_search_tags(html: &str) -> Result<Vec<AnimeSearchResult>, Box<dyn Error>> {
    let document = Html::parse_document(html);
    let article_selector = Selector::parse("article.card.cardUltimosEps").unwrap();
    let mut results = Vec::new();

    for article in document.select(&article_selector) {
        if let Some(result) = extract_search_result(&article) {
            results.push(result);
        }
    }

    results.retain(|r| !r.anime_title.to_lowercase().contains("dublado"));

    Ok(results)
}

fn extract_search_result(article: &scraper::ElementRef) -> Option<AnimeSearchResult> {
    let anchor = article
        .children()
        .filter_map(scraper::ElementRef::wrap)
        .find(|el| el.value().name() == "a")?;

    let href = anchor.value().attr("href")?.to_string();
    
    let img_src = anchor
        .children()
        .filter_map(scraper::ElementRef::wrap)
        .find(|el| el.value().name() == "img")
        .and_then(|img_el| {
            img_el.value().attr("src")
                .filter(|s| !s.trim().is_empty())
                .or_else(|| img_el.value().attr("data-src"))
        })?
        .to_string();

    let anime_title = anchor
        .children()
        .filter_map(scraper::ElementRef::wrap)
        .find(|el| {
            el.value().name() == "div"
                && el.value()
                    .attr("class")
                    .map_or(false, |c| c.contains("text-block") || c.contains("text block"))
        })
        .and_then(|div| {
            div.children()
                .filter_map(scraper::ElementRef::wrap)
                .find(|h3| {
                    h3.value().name() == "h3"
                        && h3.value()
                            .attr("class")
                            .map_or(false, |c| c.contains("animeTitle"))
                })
                .map(|h3| h3.text().collect::<String>().trim().to_string())
        })?;

    Some(AnimeSearchResult {
        href,
        img_src,
        anime_title,
    })
}

pub fn parse_anime_profilepage(html: &str) -> Result<AnimeProfile, Box<dyn Error>> {
    let document = Html::parse_document(html);
    let mut episodes = HashMap::new();

    let div_selector = Selector::parse("div.div_video_list").unwrap();
    let a_selector = Selector::parse("a").unwrap();

    if let Some(div) = document.select(&div_selector).next() {
        for a in div.select(&a_selector) {
            if let Some((episode_num, href)) = extract_episode_link(&a) {
                episodes.insert(episode_num, href);
            }
        }
    }



    Ok(AnimeProfile {
        episodes
    })
}

fn extract_episode_link(a: &scraper::ElementRef) -> Option<(String, String)> {
    let href = a.value().attr("href")?.to_string();
    let text = a.text().collect::<String>();
    let num = text.split_whitespace().last()?;
    let key = num.trim_start_matches("Episódio").trim();
    
    if !key.is_empty() && key.chars().all(|c| c.is_ascii_digit()) {
        Some((key.to_string(), href))
    } else {
        None
    }
}

pub fn extract_download_links(html: &str) -> Vec<String> {
    let document = Html::parse_document(html);
    let a_selector = Selector::parse("a[download]").unwrap();
    let id_dw_selector = Selector::parse(r#"a[id="dw"]"#).unwrap();
    let mut links: Vec<String> = document
        .select(&a_selector)
        .filter_map(|a| a.value().attr("href").map(String::from))
        .collect();

    for a in document.select(&id_dw_selector) {
        if let Some(href) = a.value().attr("href") {
            if !links.contains(&href.to_string()) {
                links.push(href.to_string());
            }
        }
    }

    links
}

pub fn extract_video_links_by_quality(html: &str) -> HashMap<String, String> {
    let document = Html::parse_document(html);
    let a_selector = Selector::parse("a[download]").unwrap();
    let cache = regex_cache();
    let mut map = HashMap::new();

    for a in document.select(&a_selector) {
        if let Some(href) = a.value().attr("href") {
            let label = a.text().collect::<String>().trim().to_uppercase();
            if let Some(cap) = cache.quality.captures(href) {
                let quality = cap.get(1).unwrap().as_str().to_string();
                map.insert(quality, href.to_string());
            }
            if matches!(label.as_str(), "SD" | "HD" | "F-HD") {
                map.insert(label, href.to_string());
            }
        }
    }

    map
}

pub fn extract_download_page_url(html: &str) -> Option<String> {
    let document = Html::parse_document(html);
    let selector = Selector::parse("a[href*='download']").unwrap();
    for a in document.select(&selector) {
        if let Some(href) = a.value().attr("href") {
            return Some(href.to_string());
        }
    }
    None
}
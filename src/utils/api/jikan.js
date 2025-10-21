import { process_term, sleep } from "../helpers/selecter.js";
import Fuse from "fuse.js";
import logger from '../helpers/logger.js';

// extract all titles from jikan data 
function get_titles(data) {
  if (!data || !data.titles) return [];
  return data.titles.map(titleObj => titleObj.title);
}

export async function fetch_jikan_data(anime_name) {
  const results = [];

  logger.debug("🔍 Searching:", anime_name);

  try {
    const directResponse = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(anime_name)}&limit=15&sfw=true`
    );

    if (directResponse.ok) {
      const directJson = await directResponse.json();
      const directAnimes = directJson.data || [];

  logger.info("✅ Direct search returned:", directAnimes.length, "results");

      for (const anime of directAnimes) {
        results.push({ term: anime_name, data: anime });
      }
    }

    // if found something, return
    if (results.length > 0) {
      return results;
    }

    // fallback - try with processed terms from names.json using fuzzy match
  logger.warn("⚠️ Direct search empty, trying processed terms...");
    const processed_terms = await process_term(anime_name);
    
    if (!processed_terms || processed_terms.length === 0) {
      throw new Error("No anime found.");
    }

  logger.debug("📋 Processed terms:", processed_terms);

    const delay = 1.100; // 1.1 secs

    for (const term of processed_terms) {
      try {
        const response = await fetch(
          `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(term)}&limit=15&sfw=true`
        );

        if (!response.ok) {
          logger.error(`❌ Error fetching "${term}"`);
          continue;
        }

        const json = await response.json();
        const animes = json.data || [];

        for (const anime of animes) {
          const titles = get_titles(anime);
          const fuse = new Fuse(titles, {
            threshold: 0.5,
            includeScore: true
          });
          
          const match = fuse.search(term);
          
          if (match.length > 0 || titles.some(t => 
            t.toLowerCase().includes(term.toLowerCase()) || 
            term.toLowerCase().includes(t.toLowerCase())
          )) {
            results.push({ term, data: anime });
          }
        }
      } catch (error) {
        logger.error(`❌ Error fetching "${term}":`, error);
      }

      await sleep(delay);
    }

    if (results.length === 0) {
      throw new Error("No matching anime found.");
    }

    return results;

  } catch (error) {
    logger.error("❌ Error fetching:", error);
    throw error;
  }
}

// const data = await fetch_jikan_data('ousama ranking')
// const title = await get_title(data)
// logger.debug(title);
/* const results = await fetch_jikan_data("Ousama Ranking");
logger.debug("Final results:", results);
results.forEach(r => {
  const title = r.data.titles.find(t => t.type === "Default")?.title || "No Default";
  logger.debug(r.term, "=>", title);
}); */
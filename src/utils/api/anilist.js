import { process_term, sleep } from "../helpers/selecter.js";
import logger from '../helpers/logger.js';

// search anilist via graphql
export async function fetch_anilist_data(anime_name) {
  const results = [];
  
  logger.debug("🔍 searching AniList:", anime_name);

  const query = `
    query ($search: String, $perPage: Int) {
      Page(page: 1, perPage: $perPage) {
        media(search: $search, type: ANIME, sort: POPULARITY_DESC) {
          id
          title {
            romaji
            english
            native
          }
          coverImage {
            large
            medium
          }
          description
          episodes
          genres
          averageScore
          popularity
          status
          format
          season
          seasonYear
          startDate {
            year
          }
        }
      }
    }
  `;

  try {
    // map formats and seasons
    const formatMap = {
      'TV': 'TV',
      'MOVIE': 'Movie',
      'OVA': 'OVA',
      'ONA': 'ONA',
      'SPECIAL': 'Special',
      'TV_SHORT': 'TV'
    };

    const seasonMap = {
      'WINTER': 'winter',
      'SPRING': 'spring',
      'SUMMER': 'summer',
      'FALL': 'fall'
    };
    const variables = { search: anime_name, perPage: 15 };
    
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables })
    });

    if (response.ok) {
      const json = await response.json();
      const animes = json.data?.Page?.media || [];

  logger.info("anilist returned: ", animes.length, "results");

      // format anilist -> jikan
      const formatMap = {
        'TV': 'TV',
        'MOVIE': 'Movie',
        'OVA': 'OVA',
        'ONA': 'ONA',
        'SPECIAL': 'Special',
        'TV_SHORT': 'TV'
      };
      
      // lowercase season map
      const seasonMap = {
        'WINTER': 'winter',
        'SPRING': 'spring',
        'SUMMER': 'summer',
        'FALL': 'fall'
      };
      
      // format anilist -> jikan
      for (const anime of animes) {
        results.push({
          term: anime_name,
          data: {
            anilist_id: anime.id,
            title: anime.title?.romaji || anime.title?.english || anime.title?.native || 'Título Desconhecido',
            title_english: anime.title?.english || null,
            title_japanese: anime.title?.native || null,
            type: formatMap[anime.format] || 'TV',
            images: {
              jpg: {
                image_url: anime.coverImage?.medium || anime.coverImage?.large || '',
                large_image_url: anime.coverImage?.large || anime.coverImage?.medium || ''
              }
            },
            synopsis: anime.description?.replace(/<[^>]*>/g, '') || 'Sem sinopse disponível.', // Remove HTML tags
            episodes: anime.episodes || null,
            genres: anime.genres?.map(g => ({ name: g })) || [],
            score: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : null,
            popularity: anime.popularity || 0,
            status: anime.status || 'Unknown',
            season: anime.season ? seasonMap[anime.season] : null,
            year: anime.seasonYear || anime.startDate?.year || null
          }
        });
      }
    }

    if (results.length > 0) {
      return results;
    }

    // fallback using fuzzy search with processed terms
    logger.warn("⚠️ empty direct AniList search, trying processed terms...");
    const processed_terms = await process_term(anime_name);
    
    if (!processed_terms || processed_terms.length === 0) {
      throw new Error("no processed terms from AniList search");
    }

  logger.debug("📋 Processed terms:", processed_terms);

    for (const term of processed_terms) {
      try {
        const termVariables = { search: term, perPage: 10 };
        
        const termResponse = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ query, variables: termVariables })
        });

        if (termResponse.ok) {
          const termJson = await termResponse.json();
          const termAnimes = termJson.data?.Page?.media || [];
          
          for (const anime of termAnimes) {
            results.push({
              term,
              data: {
                anilist_id: anime.id,
                title: anime.title?.romaji || anime.title?.english || anime.title?.native || 'Título Desconhecido',
                title_english: anime.title?.english || null,
                title_japanese: anime.title?.native || null,
                type: formatMap[anime.format] || 'TV',
                images: {
                  jpg: {
                    image_url: anime.coverImage?.medium || anime.coverImage?.large || '',
                    large_image_url: anime.coverImage?.large || anime.coverImage?.medium || ''
                  }
                },
                synopsis: anime.description?.replace(/<[^>]*>/g, '') || 'Sem sinopse disponível.',
                episodes: anime.episodes || null,
                genres: anime.genres?.map(g => ({ name: g })) || [],
                score: anime.averageScore ? (anime.averageScore / 10).toFixed(1) : null,
                popularity: anime.popularity || 0,
                status: anime.status || 'Unknown',
                season: anime.season ? seasonMap[anime.season] : null,
                year: anime.seasonYear || anime.startDate?.year || null
              }
            });
          }
        }

        await sleep(500); // anilist delay is smaller than jikan
        } catch (error) {
        logger.error(`❌ Error fetching "${term}" from AniList:`, error);
      }
    }

    if (results.length === 0) {
      throw new Error("No matching anime found on AniList.");
    }

    return results;

    } catch (error) {
    logger.error("❌ Error in AniList search:", error);
    throw error;
  }
}

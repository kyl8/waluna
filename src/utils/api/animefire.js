import logger from '../helpers/logger';
import Fuse from 'fuse.js';

const API_BASE_URL = 'http://127.0.0.1:8080/animefire';


const findBestAnimeMatch = (query, results) => {
  if (!results || results.length === 0) return null;
  if (results.length === 1) return results[0];
  
  const queryLower = query.toLowerCase().trim();
  
  const exactMatch = results.find(r => 
    r.anime_title.toLowerCase().trim() === queryLower
  );
  if (exactMatch) {
    logger.info('[API] found exact match:', exactMatch.anime_title);
    return exactMatch;
  }

  const cleanQuery = queryLower
    .replace(/\s*\(.*?\)\s*/g, '') 
    .replace(/\s+(tv|movie|film|short)\s*$/i, '') 
    .replace(/\s+season\s+\d+.*$/i, '') 
    .replace(/\s*[-:]\s*zenpen.*$/i, '') 
    .replace(/\s*[-:]\s*.*kaiyuu.*$/i, '') 
    .trim();
  
  const baseMatches = results.filter(r => {
    const cleanTitle = r.anime_title
      .replace(/\s*\(.*?\)\s*/g, '')
      .replace(/\s+(tv|movie|film|short)\s*$/i, '')
      .replace(/\s+season\s+\d+.*$/i, '')
      .replace(/\s*[-:]\s*zenpen.*$/i, '')
      .replace(/\s*[-:]\s*.*kaiyuu.*$/i, '')
      .trim();
    
    return cleanTitle.toLowerCase().includes(cleanQuery) || 
           cleanQuery.includes(cleanTitle.toLowerCase());
  });
  
  if (baseMatches.length > 0) {
    const best = baseMatches.reduce((prev, curr) => 
      curr.anime_title.length < prev.anime_title.length ? curr : prev
    );
    logger.info('[API] found base match:', best.anime_title);
    return best;
  }
  
  const fuse = new Fuse(results, {
    keys: ['anime_title'],
    threshold: 0.3, 
    includeScore: true,
    minMatchCharLength: 3,
  });
  
  const fuseResults = fuse.search(queryLower);
  
  if (fuseResults.length > 0) {
    const bestMatch = fuseResults[0].item;
    const score = (1 - fuseResults[0].score).toFixed(2);
    return bestMatch;
  }
  return results[0];
};

/**
 * check if AnimeFire API server is running
 */
export const checkServer = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/`);
    return response.ok;
  } catch (error) {
    return false;
  }
};

/**
 * search anime by name
 * @param {string} query - search term
 */
export const searchAnime = async (query) => {
  try {
    if (!query) {
      throw new Error('search query is required');
    }

    const params = new URLSearchParams();
    params.append('q', query);

    const response = await fetch(`${API_BASE_URL}/search?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    let results = [];
    if (Array.isArray(data)) {
      results = data;
    } else if (Array.isArray(data.results)) {
      results = data.results;
    } else if (data.animes && Array.isArray(data.animes)) {
      results = data.animes;
    } else {
      results = [];
    }
    return results;
  } catch (error) {
    throw error;
  }
};

/**
 * get anime profile with episodes list
 * @param {string} url - anime profile URL
 */
export const getAnimeProfile = async (url) => {
  try {
    if (!url) {
      throw new Error('anime profile URL is required');
    }

    const params = new URLSearchParams();
    params.append('url', url);

    const response = await fetch(`${API_BASE_URL}/profile?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get download links for an episode
 * @param {string} url - episode URL
 */
export const getDownloadLinks = async (url) => {
  try {
    if (!url) {
      throw new Error('episode URL is required');
    }

    const params = new URLSearchParams();
    params.append('url', url);

    const response = await fetch(`${API_BASE_URL}/get_download_link?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get video streaming links (MP4) by quality
 * @param {string} url - episode URL
 */
export const getVideoLinks = async (url) => {
  try {
    if (!url) {
      throw new Error('episode URL is required');
    }

    const params = new URLSearchParams();
    params.append('url', url);

    const response = await fetch(`${API_BASE_URL}/get_mp4?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();   
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get all episode links (download + streaming)
 * @param {string} url - episode URL
 */
export const getAllEpisodeLinks = async (url) => {
  try {
    if (!url) {
      throw new Error('episode URL is required');
    }

    const [downloadLinks, videoLinks] = await Promise.all([
      getDownloadLinks(url),
      getVideoLinks(url),
    ]);

    return {
      download: downloadLinks,
      streaming: videoLinks,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * complete workflow: search anime and get episodes
 * @param {string} animeName - name of the anime to search
 */
export const getAnimeWithEpisodes = async (animeName) => {
  try {
    if (!animeName) {
      throw new Error('anime name is required');
    }
    const searchResults = await searchAnime(animeName);
    const validResults = Array.isArray(searchResults)
      ? searchResults.filter(
          (item) =>
            item &&
            typeof item === 'object' &&
            typeof item.href === 'string' && item.href.trim() &&
            typeof item.img_src === 'string' && item.img_src.trim() &&
            typeof item.anime_title === 'string' && item.anime_title.trim()
        )
      : [];

    if (validResults.length === 0) {
      throw new Error('no anime found with that name');
    }
    const firstResult = findBestAnimeMatch(animeName, validResults);
    const profile = await getAnimeProfile(firstResult.href);
    
    return {
      anime: firstResult,
      episodes: profile.episodes || [],
      title: firstResult.anime_title,
      metadata: profile,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * get episode links with retries for reliability
 * @param {string} url - episode URL
 * @param {number} maxRetries - maximum retry attempts (default: 3)
 * @param {number} retryDelay - delay between retries in ms (default: 1000)
 */
export const getEpisodeLinksWithRetry = async (url, maxRetries = 3, retryDelay = 1000) => {
  try {
    if (!url) {
      throw new Error('episode URL is required');
    }

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const links = await getAllEpisodeLinks(url);
        return links;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('failed to fetch episode links after retries');
  } catch (error) {
    throw error;
  }
};

/**
 * batch fetch episodes data
 * @param {Array<string>} episodeUrls - array of episode URLs
 * @param {number} concurrency - number of concurrent requests (default: 3)
 */
export const batchGetEpisodeLinks = async (episodeUrls, concurrency = 3) => {
  try {
    if (!episodeUrls || !Array.isArray(episodeUrls) || episodeUrls.length === 0) {
      throw new Error('episode URLs array is required');
    }
    const results = [];
    const chunks = [];
    
    for (let i = 0; i < episodeUrls.length; i += concurrency) {
      chunks.push(episodeUrls.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(url => getAllEpisodeLinks(url))
      );
      
      chunkResults.forEach((result, index) => {
        const url = chunk[index];
        if (result.status === 'fulfilled') {
          results.push({ url, data: result.value, success: true });
        } else {
          results.push({ url, error: result.reason.message, success: false });
        }
      });
    }
    return results;
  } catch (error) {
    throw error;
  }
};

/**
 * wait for anime to be available with polling
 * @param {string} animeName - name of anime to wait for
 * @param {number} maxWaitTime - maximum wait time in ms (default: 60000)
 * @param {number} pollInterval - polling interval in ms (default: 5000)
 */
export const waitForAnime = async (animeName, maxWaitTime = 60000, pollInterval = 5000) => {
  try {
    if (!animeName) {
      throw new Error('anime name is required');
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const pollIntervalId = setInterval(async () => {
        try {
          const elapsedTime = Date.now() - startTime;
          
          if (elapsedTime > maxWaitTime) {
            clearInterval(pollIntervalId);
            reject(new Error(`timeout: anime not found after ${maxWaitTime / 1000}s`));
            return;
          }

          const results = await searchAnime(animeName);
          
          if (results && results.length > 0) {
            clearInterval(pollIntervalId);
            resolve(results[0]);
          }
        } catch (error) {
        }
      }, pollInterval);
    });
  } catch (error) {
    throw error;
  }
};

/**
 * complete pipeline: search > profile > episodes > links
 * @param {string} animeName - name of anime
 * @param {number} episodeNumber - specific episode number (optional, fetches all if not provided)
 */
export const getFullAnimeData = async (animeName, episodeNumber = null) => {
  try {
    logger.info('[API] starting full pipeline for:', animeName);

    if (!animeName) {
      throw new Error('anime name is required');
    }
    const searchResults = await searchAnime(animeName);
    if (!searchResults || searchResults.length === 0) {
      throw new Error('anime not found');
    }
    const anime = searchResults[0];
    const profile = await getAnimeProfile(anime.url);
    if (episodeNumber !== null) {
      const episode = profile.episodes?.find(ep => ep.number === episodeNumber);
      
      if (!episode) {
        throw new Error(`episode ${episodeNumber} not found`);
      }
      const links = await getAllEpisodeLinks(episode.url);

      return {
        anime,
        profile,
        episode,
        links,
      };
    }

    return {
      anime,
      profile,
      episodes: profile.episodes || [],
    };
  } catch (error) {
    throw error;
  }
};


export const getFormattedEpisodes = async (anime) => {
  try {
    const data = await getAnimeWithEpisodes(anime.title);
    
    if (!data?.episodes) {
      return [];
    }

    if (Array.isArray(data.episodes)) {
      return data.episodes;
    }

    if (typeof data.episodes === 'object') {
      return Object.entries(data.episodes).map(([n, u]) => ({ 
        id: `af-${n}`, 
        number: Number(n), 
        title: `Episódio ${n}`,
        url: u,
        page_url: u
      }));
    }

    return [];
  } catch (error) {
    throw error;
  }
};


export const getFormattedStreamingLinks = async (episode) => {
  try {
    if (!episode?.url && !episode?.page_url) {
      throw new Error('Episode URL is required');
    }

    const episodeUrl = episode.url || episode.page_url;
    const downloadLinks = await getDownloadLinks(episodeUrl);
    if (!downloadLinks || downloadLinks.length === 0) {
      throw new Error('No download links found');
    }
    const downloadUrl = downloadLinks[0];
    const mp4Links = await getVideoLinks(downloadUrl);
    if (!mp4Links || typeof mp4Links !== 'object') {
      throw new Error('Invalid MP4 links response');
    }
    const qualityOrder = ['SD', 'HD', 'MHD', 'FHD'];
    const options = qualityOrder
      .filter(quality => mp4Links[quality])
      .map((quality) => ({
        id: `af-${quality.toLowerCase()}`,
        title: `${quality}`,
        quality: quality,
        type: 'streaming',
        url: mp4Links[quality],
        language: 'legendado'
      }));
    return options;
  } catch (error) {
    throw error;
  }
};

export default {
  checkServer,
  searchAnime,
  getAnimeProfile,
  getDownloadLinks,
  getVideoLinks,
  getAllEpisodeLinks,
  getAnimeWithEpisodes,
  getEpisodeLinksWithRetry,
  batchGetEpisodeLinks,
  waitForAnime,
  getFullAnimeData,
  getFormattedEpisodes,
  getFormattedStreamingLinks,
};
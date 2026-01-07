import logger from '../helpers/logger';

const API_BASE_URL = 'http://127.0.0.1:8080/tomato';

/**
 * check if Tomato API server is running
 */
export const checkServer = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/`);
    return response.ok;
  } catch (error) {
    logger.error('server check failed', error);
    return false;
  }
};

/**
 * fetch JSON from Tomato API with error handling and detailed logging
 * @param {string} path - API endpoint path
 * @param {object} opts - fetch options
 */
async function fetchJson(path, opts = {}) {
  const url = `${API_BASE_URL}${path}`;
  logger.debug('[TOMATO] request details:', { url, method: opts.method || 'GET' });
  
  const response = await fetch(url, opts);
  const text = await response.text();
  
  logger.debug('[TOMATO] response status:', response.status);
  logger.debug('[TOMATO] response headers:', {
    contentType: response.headers.get('content-type'),
    contentLength: response.headers.get('content-length'),
  });
  
  if (!response.ok) {
    logger.error('[TOMATO] request failed:', {
      status: response.status,
      statusText: response.statusText,
      body: text.substring(0, 500), // first 500 chars
    });
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

/**
 * get all available genres
 */
export const getGenres = async () => {
  try {
    const response = await fetchJson('/genres');
    const data = response?.data || response;
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get popular anime
 */
export const getPopular = async () => {
  try {
    const response = await fetchJson('/popular');
    const data = response?.data || response;
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get latest anime
 */
export const getLatest = async () => {
  try {
    const response = await fetchJson('/latest');
    const data = response?.data || response;
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * search anime by name
 * @param {string} query - search term
 * @param {number} page - page number (default: 1)
 * @param {string|string[]} genres - genre filter (optional, comma-separated or array)
 */
export const searchAnime = async (query, page = 1, genres = undefined) => {
  try {
    if (!query) {
      throw new Error('search query is required');
    }

    const params = new URLSearchParams();
    params.append('q', query);
    params.append('page', String(page));
    if (genres) {
      const genreStr = Array.isArray(genres) ? genres.join(',') : genres;
      params.append('genres', genreStr);
    }
    const response = await fetchJson(`/search?${params}`);
    const data = response?.data || response;
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get anime details by ID
 * @param {number} id - anime ID
 */
export const getAnimeDetails = async (id) => {
  try {
    if (!id) {
      throw new Error('anime ID is required');
    }
    const response = await fetchJson(`/anime?id=${encodeURIComponent(id)}`);
    const data = response?.data || response;
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get episodes for an anime
 * @param {number} animeId - anime ID
 */
export const getEpisodes = async (animeId) => {
  try {
    if (!animeId) {
      throw new Error('anime ID is required');
    }
    const encodedId = encodeURIComponent(animeId);
    const path = `/episodes?anime_id=${encodedId}`;
    const response = await fetchJson(path);
    const data = response?.data || response;
    
    if (!Array.isArray(data)) {
      logger.warn('[TOMATO] episodes response is not an array:', typeof data, Object.keys(data || {}).slice(0, 5));
    }
    
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * get video streaming links for an episode
 * @param {number} episodeId - episode ID
 * @param {string} preferredQuality - quality preference (optional: 480p, 720p, 1080p)
 * @param {string} preferredLang - language preference (optional: sub, dub)
 */
export const getVideos = async (episodeId, preferredQuality = undefined, preferredLang = undefined) => {
  try {
    if (!episodeId) {
      throw new Error('episode ID is required');
    }

    const params = new URLSearchParams();
    params.append('episode_id', String(episodeId));
    if (preferredQuality) params.append('preferred_quality', preferredQuality);
    if (preferredLang) params.append('preferred_lang', preferredLang);
    const response = await fetchJson(`/videos?${params.toString()}`);
    const data = response?.data || response;
    
    if (!Array.isArray(data)) {
      logger.warn('[TOMATO] videos response is not an array:', typeof data);
    }
    return data;
  } catch (error) {
    throw error;
  }
};

/**
 * complete workflow: search anime and get episodes
 * @param {string} animeName - name of anime to search
 */
export const getAnimeWithEpisodes = async (animeName) => {
  try {
    if (!animeName) {
      throw new Error('anime name is required');
    }

    logger.info('[API] starting workflow for:', animeName);

    const searchResults = await searchAnime(animeName);

    if (!searchResults || searchResults.length === 0) {
      throw new Error('anime not found');
    }
    const anime = searchResults[0];
    const episodes = await getEpisodes(anime.id);
    return {
      anime,
      episodes,
      title: anime.title,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * get video links with retries for reliability
 * @param {number} episodeId - episode ID
 * @param {string} preferredQuality - quality preference (optional)
 * @param {string} preferredLang - language preference (optional)
 * @param {number} maxRetries - maximum retry attempts (default: 3)
 * @param {number} retryDelay - delay between retries in ms (default: 1000)
 */
export const getVideosWithRetry = async (
  episodeId,
  preferredQuality = undefined,
  preferredLang = undefined,
  maxRetries = 3,
  retryDelay = 1000
) => {
  try {
    if (!episodeId) {
      throw new Error('episode ID is required');
    }

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`[API] fetching videos attempt ${attempt}/${maxRetries}...`);
        const videos = await getVideos(episodeId, preferredQuality, preferredLang);
        return videos;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          logger.info(`[API] attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('failed to fetch videos after retries');
  } catch (error) {
    throw error;
  }
};

/**
 * batch fetch episodes for multiple anime
 * @param {Array<number>} animeIds - array of anime IDs
 * @param {number} concurrency - number of concurrent requests (default: 3)
 */
export const batchGetEpisodes = async (animeIds, concurrency = 3) => {
  try {
    if (!animeIds || !Array.isArray(animeIds) || animeIds.length === 0) {
      throw new Error('anime IDs array is required');
    }

    const results = [];
    const chunks = [];

    for (let i = 0; i < animeIds.length; i += concurrency) {
      chunks.push(animeIds.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(id => getEpisodes(id))
      );

      chunkResults.forEach((result, index) => {
        const id = chunk[index];
        if (result.status === 'fulfilled') {
          results.push({ id, data: result.value, success: true });
        } else {
          logger.warn('[API] failed to fetch episodes for anime:', id, result.reason);
          results.push({ id, error: result.reason.message, success: false });
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
 * @param {string} animeName - name of anime
 * @param {number} episodeNumber - specific episode number (optional, fetches all if not provided)
 * @param {string} preferredQuality - quality preference (optional)
 * @param {string} preferredLang - language preference (optional)
 */
export const getFullAnimeData = async (animeName, episodeNumber = null, preferredQuality = undefined, preferredLang = undefined) => {
  try {
    if (!animeName) {
      throw new Error('anime name is required');
    }
    const searchResults = await searchAnime(animeName);
    if (!searchResults || searchResults.length === 0) {
      throw new Error('anime not found');
    }

    const anime = searchResults[0];
    logger.info('[API] found anime:', anime.title);

    const details = await getAnimeDetails(anime.id);
    logger.info('[API] loaded anime details');

    const episodes = await getEpisodes(anime.id);
    logger.info('[API] loaded profile with', episodes.length, 'episodes');

    if (episodeNumber !== null) {
      const episode = episodes.find(ep => ep.episode_number === episodeNumber);

      if (!episode) {
        throw new Error(`episode ${episodeNumber} not found`);
      }

      logger.info('[API] fetching videos for episode', episodeNumber);
      const videos = await getVideos(episode.ep_id || episode.episode_id, preferredQuality, preferredLang);

      return {
        anime,
        details,
        episode,
        videos,
      };
    }

    return {
      anime,
      details,
      episodes,
    };
  } catch (error) {
    logger.error('get full anime data error', error);
    throw error;
  }
};


export const getFormattedEpisodes = async (anime) => {
  try {
    if (!anime) {
      throw new Error('Anime é necessário');
    }

    logger.info('[TOMATO] getFormattedEpisodes called with anime:', {
      id: anime.id,
      title: anime.title,
      mal_id: anime.mal_id,
      anilist_id: anime.anilist_id
    });
    let animeId = anime.id;
    if (!animeId && anime.title) {
      logger.info('[TOMATO] No ID found, searching anime by title:', anime.title);
      try {
        const searchResults = await searchAnime(anime.title);
        
        if (searchResults && searchResults.length > 0) {
          const foundAnime = searchResults[0];
          animeId = foundAnime.id || foundAnime.anime_id;
          logger.info('[TOMATO] Found anime by title:', {
            originalTitle: anime.title,
            foundTitle: foundAnime.title,
            foundId: animeId
          });
        }
      } catch (searchError) {
        logger.warn('[TOMATO] Could not search anime by title:', searchError.message);
      }
    }

    if (!animeId) {
      throw new Error(`Anime ID não encontrado. Dados recebidos: ${JSON.stringify({
        id: anime.id,
        title: anime.title,
        mal_id: anime.mal_id,
        anilist_id: anime.anilist_id
      })}`);
    }

    const episodes = await getEpisodes(animeId);
    
    if (!episodes || !Array.isArray(episodes)) {
      logger.warn('[TOMATO] getFormattedEpisodes: resposta não é um array', typeof episodes);
      return [];
    }

    logger.info('[TOMATO] getFormattedEpisodes: retornou', episodes.length, 'episódios');
    return episodes.map((episode) => ({
      id: episode.subbed_id || episode.dubbed_id || episode.ep_id || episode.episode_id || episode.id,
      number: episode.episode_number || episode.number || 0,
      title: episode.episode_name || episode.title || episode.name || `Episódio ${episode.episode_number || episode.number}`,
      image: episode.episode_thumbnail || episode.image || episode.thumbnail || null,
      description: episode.description || null,
      airDate: episode.air_date || null,
      animeId: animeId,
      subbed_id: episode.subbed_id,
      dubbed_id: episode.dubbed_id,
      _raw: episode
    }));
  } catch (error) {
    logger.error('[TOMATO] getFormattedEpisodes error:', error.message);
    throw error;
  }
};


export const getFormattedVideoLinks = async (episode) => {
  try {
    if (!episode) {
      throw new Error('Episódio é necessário');
    }

    logger.info('[TOMATO] getFormattedVideoLinks called with episode:', {
      id: episode.id,
      number: episode.number,
      subbed_id: episode.subbed_id,
      dubbed_id: episode.dubbed_id,
      ep_id: episode.ep_id,
      episode_id: episode.episode_id
    });

    const episodeId = 
      episode.subbed_id || 
      episode.dubbed_id || 
      episode.ep_id || 
      episode.episode_id || 
      episode.id;
    
    if (!episodeId) {
      throw new Error(`Episode ID não encontrado. Dados recebidos: ${JSON.stringify({
        id: episode.id,
        number: episode.number,
        subbed_id: episode.subbed_id,
        dubbed_id: episode.dubbed_id,
        ep_id: episode.ep_id,
        episode_id: episode.episode_id
      })}`);
    }

    logger.info('[TOMATO] Using episodeId:', episodeId, '(preferência: subbed > dubbed > outros)');
    const isSubbed = episode.subbed_id && episodeId === episode.subbed_id;
    const isDubbed = episode.dubbed_id && episodeId === episode.dubbed_id;
    const language = isDubbed ? 'dublado' : 'legendado';
    const videos = await getVideosWithRetry(episodeId, '1080p', isDubbed ? 'dub' : 'sub');
    if (!videos || !Array.isArray(videos)) {
      logger.warn('[TOMATO] getFormattedVideoLinks: resposta não é um array', typeof videos);
      return [];
    }
    logger.info('[TOMATO] getFormattedVideoLinks: retornou', videos.length, 'vídeos');
    return videos
      .map((video, index) => {
        const quality = video.quality || video.resolution || 'HD';
        const videoLanguage = video.language || language;
        const url = video.url || video.src || video.link;

        if (!url) {
          logger.warn('[TOMATO] Video sem URL:', video);
          return null;
        }

        const isVideoSubbed = videoLanguage === 'sub' || videoLanguage === 'legendado';

        return {
          id: `tomato-${episodeId}-${index}`,
          title: `${quality}`,
          quality: quality,
          language: isVideoSubbed ? 'legendado' : 'dublado',
          type: 'streaming',
          url: url,
          server: video.server || 'Unknown',
          _raw: video
        };
      })
      .filter(video => video !== null);
  } catch (error) {
    logger.error('[TOMATO] getFormattedVideoLinks error:', error.message);
    throw error;
  }
};

export default {
  checkServer,
  getGenres,
  getPopular,
  getLatest,
  searchAnime,
  getAnimeDetails,
  getEpisodes,
  getVideos,
  getAnimeWithEpisodes,
  getVideosWithRetry,
  batchGetEpisodes,
  waitForAnime,
  getFullAnimeData,
  getFormattedEpisodes,
  getFormattedVideoLinks,
};

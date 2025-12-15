import logger from '../helpers/logger';
const API_BASE_URL = 'http://127.0.0.1:8080';


//check server status
export const checkServer = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/`);
    return response.ok;
  } catch (error) {
    log.error('server check failed', error);
    return false;
  }
};

/**
 * search in nyaa.si via Waluna API
 * @param {string} query - search term
 * @param {boolean} pretty - legible json formatting
 */
export const searchTorrents = async (query = 'Ousama Ranking', pretty = true) => {
  try {
    const params = new URLSearchParams();
    if (query) params.append('q', query);
    if (pretty) params.append('pretty', '1');

    const response = await fetch(`${API_BASE_URL}/search?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Search failed');
    }

    logger.info(`[API] search results for "${query}":`, data.count, 'torrents');
    return data;
  } catch (error) {
    logger.error('search error', error);
    throw error;
  }
};

/**
 * start download via magnet link
 * @param {string} magnetLink - Magnet link (encoded or not)
 */
export const startDownload = async (magnetLink) => {
  try {
    if (!magnetLink) {
      throw new Error('magnet link is required');
    }

    const params = new URLSearchParams();
    params.append('q', magnetLink);

    const response = await fetch(`${API_BASE_URL}/start?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Download failed');
    }

    logger.info('[API] download started:', data.download_id);
    return data;
  } catch (error) {
    logger.error('start download error', error);
    throw error;
  }
};

/**
 * encode magnet link to URL-encoded format
 * @param {string} magnetLink - magnet link not encoded
 */
export const encodeMagnet = async (magnetLink) => {
  try {
    if (!magnetLink) {
      throw new Error('magnet link is required');
    }

    const params = new URLSearchParams();
    params.append('q', magnetLink);

    const response = await fetch(`${API_BASE_URL}/encode?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Encoding failed');
    }

    return data;
  } catch (error) {
    logger.error('encode magnet error', error);
    throw error;
  }
};

/**
 * decode magnet link from URL-encoded format
 * @param {string} encoded - Magnet link URL-encoded
 */
export const decodeMagnet = async (encoded) => {
  try {
    if (!encoded) {
      throw new Error('encoded magnet link is required');
    }

    const params = new URLSearchParams();
    params.append('encoded', encoded);

    const response = await fetch(`${API_BASE_URL}/decode?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Decoding failed');
    }

    return data;
  } catch (error) {
    logger.error('decode magnet error', error);
    throw error;
  }
};

/**
 * retrieves the status of a download
 * @param {string} id - download id
 * @param {boolean} pretty - legible json formatting
 */
export const getDownloadStatus = async (id, pretty = true) => {
  try {
    if (!id) {
      throw new Error('download ID is required');
    }

    const params = new URLSearchParams();
    params.append('id', id);
    if (pretty) params.append('pretty', '1');

    const response = await fetch(`${API_BASE_URL}/status?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Status retrieval failed');
    }

    return data;
  } catch (error) {
    logger.error('get download status error', error);
    throw error;
  }
};

/**
 * retrieves the progress of a download (this endpoint is actualy the same as status, i will probably remove it later)
 * @param {string} id - download id
 * @param {boolean} pretty - legible json formatting
 */
export const getDownloadProgress = async (id, pretty = true) => {
  try {
    if (!id) {
      throw new Error('download ID is required');
    }

    const params = new URLSearchParams();
    params.append('id', id);
    if (pretty) params.append('pretty', '1');

    const response = await fetch(`${API_BASE_URL}/progress?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Progress retrieval failed');
    }

    return data;
  } catch (error) {
    logger.error('get download progress error', error);
    throw error;
  }
};

/**
 * stop an active download
 * @param {string} id - download id
 */
export const stopDownload = async (id) => {
  try {
    if (!id) {
      throw new Error('download ID is required');
    }

    const params = new URLSearchParams();
    params.append('id', id);

    const response = await fetch(`${API_BASE_URL}/stop?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'Stop failed');
    }

    logger.info('[API] download stopped:', id);
    return data;
  } catch (error) {
    logger.error('stop download error', error);
    throw error;
  }
};

/**
 * list all active downloads
 * @param {boolean} pretty - legible json formatting
 */
export const listActiveDownloads = async (pretty = true) => {
  try {
    const params = new URLSearchParams();
    if (pretty) params.append('pretty', '1');

    const response = await fetch(`${API_BASE_URL}/list_files?${params}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.ok) {
      throw new Error(data.error || 'List failed');
    }

    logger.info('[API] active downloads:', data.count);
    return data;
  } catch (error) {
    logger.error('list active downloads error', error);
    throw error;
  }
};

/**
 * Start video conversion to HLS with retry
 * @param {string} id - download id
 * @param {number} maxRetries - maximum attempts (default: 15)
 * @param {number} retryDelay - delay between attempts in ms (default: 2 seconds)
 */
export const startHLSConversion = async (id, maxRetries = 15, retryDelay = 2000) => {
  try {
    if (!id) {
      throw new Error('download ID is required');
    }

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`[API] HLS conversion attempt ${attempt}/${maxRetries}...`);
        const response = await fetch(`http://127.0.0.1:8080/hls/status/${id}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        logger.info('[API] HLS conversion initiated:', id);
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          logger.info(`[API] Attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('Failed to start HLS conversion after retries');
  } catch (error) {
    logger.error('start hls conversion error', error);
    throw error;
  }
};

/**
 * retrieves the status of an HLS conversion
 * @param {string} id - hash or ID of the HLS conversion
 */
export const getHLSStatus = async (id) => {
  try {
    if (!id) {
      throw new Error('hls ID is required');
    }

    const response = await fetch(`${API_BASE_URL}/hls/status/${id}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    logger.info(`[API] hls status - ${data.status}:`, {
      segments: data.segments_count,
      duration: data.total_duration,
      complete: data.is_complete,
    });
    
    return data;
  } catch (error) {
    logger.error('get hls status error', error);
    throw error;
  }
};

/**
 * retrieves the playlist URL for an HLS conversion
 * @param {string} id - hash or ID of the HLS conversion
 */
export const getPlaylistURL = (id) => {
  if (!id) {
    throw new Error('hls ID is required');
  }
  return `${API_BASE_URL}/hls/playlist/${id}`;
};

/**
 * retrieves the URL of a specific segment
 * @param {string} id - hash or ID of the HLS conversion
 * @param {string} segment - segment file name (e.g., segment_000.ts)
 */
export const getSegmentURL = (id, segment) => {
  if (!id || !segment) {
    throw new Error('hls ID and segment name are required');
  }
  return `${API_BASE_URL}/hls/segments/${id}/${segment}`;
};

/**
 * Obtém a URL de um arquivo no cache
 * @param {string} path - Caminho relativo no cache
 */
export const getCacheURL = (path) => {
  if (!path) {
    throw new Error('cache path is required');
  }
  return `${API_BASE_URL}/cache/${path}`;
};

/**
 * Waits for a file to be created in the cache using getDownloadStatus
 * @param {string} downloadId - download id
 * @param {number} maxWaitTime - maximum wait time in ms (default: 5 minutes)
 * @param {number} pollInterval - polling interval in ms (default: 1 second)
 */
export const waitForDownloadComplete = async (downloadId, maxWaitTime = 300000, pollInterval = 1000) => {
  try {
    if (!downloadId) {
      throw new Error('download ID is required');
    }    
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const pollInterval_id = setInterval(async () => {
        try {
          const elapsedTime = Date.now() - startTime;
          
          if (elapsedTime > maxWaitTime) {
            clearInterval(pollInterval_id);
            reject(new Error(`timeout: file not found ${maxWaitTime / 1000}s`));
            return;
          }

          // entar obter status do download
          const status = await getDownloadStatus(downloadId, false);
          
          if (status.ok) {
            logger.info('download file created', { name: status.name });
            clearInterval(pollInterval_id);
            resolve(status);
          }
        } catch (error) {
          // se erro, continua tentando (arquivo ainda não foi criado)
          logger.debug('waiting for download file', { error: error.message });
        }
      }, pollInterval);
    });
  } catch (error) {
    logger.error('wait for download error', error);
    throw error;
  }
};

/**
 * Flux: Download → Wait for file → HLS Conversion
 * @param {string} magnetLink - torrent magnet link
 * @param {number} downloadTimeout - maximum wait time in ms (default: 30 minutes)
 */
export const startFullPipeline = async (magnetLink, downloadTimeout = 1800000) => {
  try {
    logger.info('starting pipeline: download → wait → hls conversion');

    if (!magnetLink) {
      throw new Error('magnet link is required');
    }

    // 1. Iniciar download
    const downloadResult = await startDownload(magnetLink);
    const downloadId = downloadResult.download_id;
    logger.info('download ID:', downloadId);

    // 2. Aguardar arquivo ser criado
    logger.info('waiting for file to be created...');
    const downloadInfo = await waitForDownloadComplete(downloadId, downloadTimeout);
    logger.info('download info:', downloadInfo);

    // 3. Iniciar conversão HLS com o downloadId
    logger.info('starting HLS conversion...');
    const hlsResult = await startHLSConversion(downloadId);
    logger.info('HLS conversion started');

    // 4. Iniciar extração de legendas em paralelo (não bloqueia)
    startSubtitleExtractionBackground(downloadId);

    return {
      downloadId,
      hlsId: downloadId,
      playlistURL: getPlaylistURL(downloadId),
      status: hlsResult.status,
      downloadInfo,
    };
  } catch (error) {
    logger.error('pipeline error:', error);
    throw error;
  }
};

/**
 * Extract subtitles from a torrent video
 * @param {string} torrentId - Torrent/Download ID
 * @returns {Promise<Object>} Extraction result with subtitles array
 */
export const extractSubtitles = async (torrentId) => {
  if (!torrentId) {
    logger.warn('no torrent ID provided for extraction');
    return null;
  }

  try {
    const url = `${API_BASE_URL}/streams/extract/${torrentId}`;
    const response = await fetch(url, { cache: 'no-store' });
    
    if (!response.ok) {
      logger.warn('subtitle extraction failed:', response.status);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.warn('subtitle extraction error:', error.message);
    return null;
  }
};

/**
 * Fetch subtitle metadata for a torrent
 * @param {string} torrentId - Torrent/Download ID
 * @returns {Promise<Array|null>} Array of subtitle objects with metadata and URLs
 */
export const fetchSubtitleMetadata = async (torrentId) => {
  if (!torrentId) {
    logger.warn('no torrent ID provided for fetch');
    return null;
  }

  try {
    const url = `${API_BASE_URL}/streams/subs/${torrentId}`;
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      logger.warn('failed to fetch subtitles:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.subtitles && Array.isArray(data.subtitles) && data.subtitles.length > 0) {
      if (data.subtitles.some(sub => sub.url)) {
        return data.subtitles;
      }
    }
    
    return null;
  } catch (error) {
    logger.warn('subtitle fetch error:', error.message);
    return null;
  }
};

/**
 * Get subtitle template from backend config
 * @returns {Promise<string|null>} ASS subtitle template content
 */
export const getSubtitleTemplate = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/config/subtitle-template`);
    if (response.ok) {
      return await response.text();
    }
    return null;
  } catch (error) {
    logger.warn('error loading subtitle template:', error.message);
    return null;
  }
};

/**
 * Start subtitle extraction in background (fire-and-forget)
 * @param {string} torrentId - Torrent/Download ID
 */
export const startSubtitleExtractionBackground = (torrentId) => {
  if (!torrentId) return;
  
  fetch(`${API_BASE_URL}/streams/extract/${torrentId}`, { cache: 'no-store' })
    .then(r => r.json())
    .then(() => logger.info('subtitles extracted:', torrentId))
    .catch(e => logger.warn('background extraction failed:', e.message));
};

export default {
  checkServer,
  searchTorrents,
  startDownload,
  encodeMagnet,
  decodeMagnet,
  getDownloadStatus,
  getDownloadProgress,
  stopDownload,
  listActiveDownloads,
  startHLSConversion,
  getHLSStatus,
  getPlaylistURL,
  getSegmentURL,
  getCacheURL,
  waitForDownloadComplete,
  startFullPipeline,
  extractSubtitles,
  fetchSubtitleMetadata,
  getSubtitleTemplate,
  startSubtitleExtractionBackground,
};

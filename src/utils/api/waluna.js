const API_BASE_URL = 'http://127.0.0.1:8080';

//check server status
export const checkServer = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/`);
    return response.ok;
  } catch (error) {
    console.error('[API] Server check failed:', error);
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

    console.log(`[API] Search results for "${query}":`, data.count, 'torrents');
    return data;
  } catch (error) {
    console.error('[API] Search error:', error);
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
      throw new Error('Magnet link is required');
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

    console.log('[API] Download started:', data.download_id);
    return data;
  } catch (error) {
    console.error('[API] Start download error:', error);
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
      throw new Error('Magnet link is required');
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
    console.error('[API] Encode magnet error:', error);
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
      throw new Error('Encoded magnet link is required');
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
    console.error('[API] Decode magnet error:', error);
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
      throw new Error('Download ID is required');
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
    console.error('[API] Get download status error:', error);
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
      throw new Error('Download ID is required');
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
    console.error('[API] Get download progress error:', error);
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
      throw new Error('Download ID is required');
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

    console.log('[API] Download stopped:', id);
    return data;
  } catch (error) {
    console.error('[API] Stop download error:', error);
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

    console.log('[API] Active downloads:', data.count);
    return data;
  } catch (error) {
    console.error('[API] List active downloads error:', error);
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
      throw new Error('Download ID is required');
    }

    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[API] HLS conversion attempt ${attempt}/${maxRetries}...`);
        const response = await fetch(`http://127.0.0.1:8080/hls/status/${id}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('[API] HLS conversion initiated:', id);
        return data;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          console.log(`[API] Attempt ${attempt} failed, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('Failed to start HLS conversion after retries');
  } catch (error) {
    console.error('[API] Start HLS conversion error:', error);
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
      throw new Error('HLS ID is required');
    }

    const response = await fetch(`${API_BASE_URL}/hls/status/${id}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    
    console.log(`[API] HLS Status - ${data.status}:`, {
      segments: data.segments_count,
      duration: data.total_duration,
      complete: data.is_complete,
    });
    
    return data;
  } catch (error) {
    console.error('[API] Get HLS status error:', error);
    throw error;
  }
};

/**
 * retrieves the playlist URL for an HLS conversion
 * @param {string} id - hash or ID of the HLS conversion
 */
export const getPlaylistURL = (id) => {
  if (!id) {
    throw new Error('HLS ID is required');
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
    throw new Error('HLS ID and segment name are required');
  }
  return `${API_BASE_URL}/hls/segments/${id}/${segment}`;
};

/**
 * Obtém a URL de um arquivo no cache
 * @param {string} path - Caminho relativo no cache
 */
export const getCacheURL = (path) => {
  if (!path) {
    throw new Error('Cache path is required');
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
      throw new Error('Download ID is required');
    }

    console.log('[API] Aguardando arquivo ser criado:', downloadId);
    
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const pollInterval_id = setInterval(async () => {
        try {
          const elapsedTime = Date.now() - startTime;
          
          if (elapsedTime > maxWaitTime) {
            clearInterval(pollInterval_id);
            reject(new Error(`Timeout: arquivo não encontrado após ${maxWaitTime / 1000}s`));
            return;
          }

          // Tentar obter status do download
          const status = await getDownloadStatus(downloadId, false);
          
          if (status.ok) {
            console.log('[API] ✅ Arquivo criado!', status.name);
            clearInterval(pollInterval_id);
            resolve(status);
          }
        } catch (error) {
          // Se erro, continua tentando (arquivo ainda não foi criado)
          console.log('[API] Aguardando arquivo...', error.message);
        }
      }, pollInterval);
    });
  } catch (error) {
    console.error('[API] Wait for download error:', error);
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
    console.log('[API] Starting pipeline: Download → Wait → HLS Conversion');

    if (!magnetLink) {
      throw new Error('Magnet link is required');
    }

    // 1. Iniciar download
    const downloadResult = await startDownload(magnetLink);
    const downloadId = downloadResult.download_id;
    console.log('[API] Download ID:', downloadId);

    // 2. Aguardar arquivo ser criado
    console.log('[API] Esperando arquivo ser criado...');
    const downloadInfo = await waitForDownloadComplete(downloadId, downloadTimeout);
    console.log('[API] Download info:', downloadInfo);

    // 3. Iniciar conversão HLS com o downloadId
    console.log('[API] Iniciando conversão HLS...');
    const hlsResult = await startHLSConversion(downloadId);
    console.log('[API] HLS conversion started');

    return {
      downloadId,
      hlsId: downloadId,
      playlistURL: getPlaylistURL(downloadId),
      status: hlsResult.status,
      downloadInfo,
    };
  } catch (error) {
    console.error('[API] Pipeline error:', error);
    throw error;
  }
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
};

import { useCallback, useState, useEffect } from 'react';
import { getSourceConfig, isStreamingSource, SOURCES } from '../utils/sources/sourcesConfig.js';
import logger from '../utils/helpers/logger.js';

export const useSourceAPI = () => {
  const [sourceId, setSourceId] = useState('torrent');
  useEffect(() => {
    try {
      const stored = localStorage.getItem('episodeSource');
      if (stored && SOURCES[stored]) {
        setSourceId(stored);
      }
    } catch (e) {
      logger.warn('Cannot read episodeSource from localStorage:', e);
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'episodeSource' && e.newValue && SOURCES[e.newValue]) {
        logger.info('Source changed from another tab:', e.newValue);
        setSourceId(e.newValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    const pollInterval = setInterval(() => {
      try {
        const stored = localStorage.getItem('episodeSource');
        if (stored && stored !== sourceId && SOURCES[stored]) {
          logger.info('Source changed (same tab polling):', stored);
          setSourceId(stored);
        }
      } catch (e) {
        logger.warn('Cannot poll episodeSource:', e);
      }
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
    };
  }, [sourceId]);

  const sourceConfig = getSourceConfig(sourceId);

  const fetchEpisodes = useCallback(async (anime) => {
    if (!sourceConfig?.fetchEpisodes) {
      const errorMsg = `Source "${sourceId}" não tem função de busca de episódios implementada`;
      logger.error('[useSourceAPI] fetchEpisodes:', errorMsg);
      throw new Error(errorMsg);
    }

    if (typeof sourceConfig.fetchEpisodes !== 'function') {
      const errorMsg = `fetchEpisodes de "${sourceId}" não é uma função`;
      logger.error('[useSourceAPI] fetchEpisodes:', errorMsg);
      throw new Error(errorMsg);
    }

    try {
      return await sourceConfig.fetchEpisodes(anime);
    } catch (error) {
      logger.error(`[useSourceAPI] fetchEpisodes (${sourceId}) failed:`, error);
      throw new Error(`Erro ao carregar episódios de ${sourceId}: ${error.message}`);
    }
  }, [sourceConfig, sourceId]);

  const fetchVideoLinks = useCallback(async (episode) => {
    if (!sourceConfig?.fetchVideoLinks) {
      const errorMsg = `Source "${sourceId}" não tem função de busca de vídeos implementada`;
      logger.error('[useSourceAPI] fetchVideoLinks:', errorMsg);
      throw new Error(errorMsg);
    }

    if (typeof sourceConfig.fetchVideoLinks !== 'function') {
      const errorMsg = `fetchVideoLinks de "${sourceId}" não é uma função`;
      logger.error('[useSourceAPI] fetchVideoLinks:', errorMsg);
      throw new Error(errorMsg);
    }

    try {
      return await sourceConfig.fetchVideoLinks(episode);
    } catch (error) {
      logger.error(`[useSourceAPI] fetchVideoLinks (${sourceId}) failed:`, error);
      throw new Error(`Erro ao carregar vídeos de ${sourceId}: ${error.message}`);
    }
  }, [sourceConfig, sourceId]);

  return {
    sourceId,
    sourceConfig,
    isStreaming: isStreamingSource(sourceId),
    fetchEpisodes,
    fetchVideoLinks,
    setSourceId: (newSourceId) => {
      if (SOURCES[newSourceId]) {
        setSourceId(newSourceId);
        localStorage.setItem('episodeSource', newSourceId);
      }
    }
  };
};

export default useSourceAPI;

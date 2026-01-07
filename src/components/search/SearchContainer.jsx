import React, { useState, useRef, useCallback, useDeferredValue, useEffect, useMemo, Suspense } from 'react';
import { useApi } from '../../contexts/ApiContext';
import useSourceAPI from '../../hooks/useSourceAPI.js';
import { fetch_jikan_data } from '../../utils/api/jikan.js';
import { fetch_anilist_data } from '../../utils/api/anilist.js';
import { searchCache } from '../../utils/cache/memoryCache.js';
import { indexedDBCache, STORES } from '../../utils/cache/indexedDb.js';
import { Box, VStack, Text, Center, Badge, Spinner, Portal, useToast, Button, HStack, Icon } from '@chakra-ui/react';
import { FaPlay, FaDownload, FaLink, FaFire } from 'react-icons/fa';
import { MdSubtitles, MdVolumeUp, MdClosedCaption, MdHighQuality } from 'react-icons/md';
import SearchBar from './SearchBar'; 
import SearchResultItem from './SearchResultItem'; 
import AnimeDetailModal from '../modals/AnimeDetailModal'; 
import GenericAnimeDetailModal from '../modals/generic/GenericAnimeDetailModal';
import { SearchResultSkeleton } from '../common/SkeletonLoading';
import { fetch_anizip_data } from '../../utils/api/anizip.js';
import { searchTorrents, startFullPipeline } from '../../utils/api/waluna.js';
import logger from '../../utils/helpers/logger.js';

const SearchContainer = ({ onCloseAllModals, onPlayTorrent }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isAnimeDetailOpen, setIsAnimeDetailOpen] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const deferredResults = useDeferredValue(results);
  const searchTimeoutRef = useRef(null);
  const isDropdownOpen = query.trim().length >= 2;
  const containerRef = useRef(null); 
  const [dropdownRect, setDropdownRect] = useState(null); 
  const toast = useToast();
  
  const { bestApi, apiStatus, isChecking, recheckApis } = useApi();
  const sourceAPI = useSourceAPI();
  const { sourceId, sourceConfig, fetchEpisodes, fetchVideoLinks } = sourceAPI;

  useEffect(() => {
    if (!isDropdownOpen) {
      setDropdownRect(null);
      return;
    }
    const update = () => {
      const el = containerRef.current;
      if (!el) return setDropdownRect(null);
      const r = el.getBoundingClientRect();
      setDropdownRect({
        left: Math.max(8, r.left), 
        top: r.bottom + window.scrollY,
        width: r.width
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
    };
  }, [isDropdownOpen, query]);

  const handleQueryChange = useCallback((e) => {
    const newValue = e.target.value;
    setQuery(newValue);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  
    if (newValue.trim().length < 2) {
      setResults([]);
      setError(null);
      setLoading(false);
      return;
    }
    
    searchTimeoutRef.current = setTimeout(async () => {
      const searchQuery = newValue.trim();
      const cacheKey = `search_${bestApi}_${searchQuery}`;
      const cached = searchCache.get(cacheKey);
      if (cached) {
        setResults(cached);
        setLoading(false);
        return;
      }

      try {
        const cachedIDB = await indexedDBCache.get(STORES.SEARCH_RESULTS, searchQuery);
        if (cachedIDB && cachedIDB.results) {
          setResults(cachedIDB.results);
          searchCache.set(cacheKey, cachedIDB.results);
          setLoading(false);
          return;
        }
      } catch {
      }
      
      setLoading(true);
      setError(null);
      
      try {
        if (!bestApi) {
          throw new Error('Sem api disponível... Tente novamente mais tarde.');
        }
        
        let data;
        if (bestApi === 'jikan') {
          data = await fetch_jikan_data(searchQuery);
        } else if (bestApi === 'anilist') {
          data = await fetch_anilist_data(searchQuery);
        }
        
        const animeResults = data.map(item => item.data || item);
        const uniqueResults = animeResults.filter((anime, index, self) => {
          if (anime.anilist_id) {
            return index === self.findIndex((a) => a.anilist_id === anime.anilist_id);
          }
          return index === self.findIndex((a) => a.title === anime.title);
        });
        
        searchCache.set(cacheKey, uniqueResults);
        
        try {
          await indexedDBCache.set(STORES.SEARCH_RESULTS, searchQuery, {
            query: searchQuery,
            results: uniqueResults,
            api: bestApi,
          }, 24 * 60 * 60 * 1000);
        } catch {
        }
        
        setResults(uniqueResults);
        setError(null);
      } catch (err) {
        setError(err.message || 'Erro ao carregar animes');
        setResults([]);
        recheckApis();
      } finally {
        setLoading(false);
      }
    }, 1200);
  }, [bestApi, recheckApis]);
  const handleCloseAnimeDetail = useCallback(() => {
    setIsAnimeDetailOpen(false);
    setSelectedAnime(null);
  }, []);

  const handleSelectAnime = useCallback((anime) => {
    setSelectedAnime(anime);
    setIsAnimeDetailOpen(true);
  }, []);

  const handleCloseAllModalsLocal = useCallback(() => {
    console.log('[SearchContainer] Closing all modals and clearing search');
    logger.info('[SearchContainer] Closing all modals and clearing search');
    setResults([]);
    setQuery('');
    setSelectedAnime(null);
    handleCloseAnimeDetail();
    if (onCloseAllModals) {
      onCloseAllModals();
    }
  }, [onCloseAllModals]);

  const fetchNyaaEpisodes = useCallback(async (anime) => {  
    try {
      const res = await fetch_anizip_data({ anilist_id: anime.anilist_id || anime.id });
      return res[0]?.data?.episodeList || [];
    } catch (err) {
      logger.warn('fetchNyaaEpisodes failed:', err);
      toast({ title: 'Aviso', description: 'Nao foi possivel carregar AniZip', status: 'warning' });
      return [];
    }
  }, [toast]);

  const fetchTorrents = useCallback(async (episode, animeName) => {
    try {
      const query = `${animeName} ${episode.number}`.trim();
      const res = await searchTorrents(query);
      const list = res?.matches || res?.results || res?.data || [];
      if (Array.isArray(list) && list.length > 0) {
        return list.map(t => ({
          id: t.id || t.hash || t.link,
          title: t.name || t.title || t.filename,
          quality: t.quality || null,
          size: t.size || null,
          metadata: { seeds: t.seeders ?? t.seeds, leechers: t.leechers ?? t.peers },
          magnet: t.magnet || t.magnetLink,
          torrentFile: t.torrent_url || t.link || t.download
        }));
      }
      toast({ title: 'Aviso', description: 'Nenhum torrent encontrado', status: 'warning' });
      return [];
    } catch (err) {
      logger.error('fetchTorrents error:', err);
      toast({ title: 'Erro', description: 'Falha ao buscar torrents', status: 'error' });
      return [];
    }
  }, [toast]);

  const renderTorrentOption = useCallback((torrent) => {
    return (
      <VStack align="start" spacing={2} key={torrent.id}>
        <HStack justify="space-between" w="100%">
          <VStack align="start" spacing={1} flex={1}>
            <Text fontWeight="semibold" fontSize="sm" noOfLines={2}>{torrent.title}</Text>
            <HStack spacing={2}>
              <Badge colorScheme="purple">{torrent.quality}</Badge>
              <Badge colorScheme="gray">{torrent.size}</Badge>
              <Badge colorScheme="green">S: {torrent.metadata?.seeds}</Badge>
              <Badge colorScheme="orange">L: {torrent.metadata?.leechers}</Badge>
            </HStack>
          </VStack>
        </HStack>
        <HStack spacing={2} w="100%">
          <Button
            size="sm"
            colorScheme="purple"
            flex={1}
            leftIcon={<Icon as={FaPlay} boxSize={4} />}
            onClick={async () => {
              try {
                const res = await startFullPipeline(torrent.magnet || torrent.magnetLink);
                logger.info('Pipeline response:', res);
                
                if (res?.playlistURL || res?.hlsId) {
                  let hlsHash = res.hlsId || res.downloadId;
                  if (res.playlistURL && !hlsHash) {
                    const match = res.playlistURL.match(/\/hls\/playlist\/([a-f0-9]+)/);
                    if (match) {
                      hlsHash = match[1];
                    }
                  }
                  
                  logger.info('Passando para player:', { hlsHash, playlistUrl: res.playlistURL });
                  
                  onPlayTorrent({
                    hlsId: hlsHash,  
                    filename: torrent.title,
                    playlistUrl: res.playlistURL
                  });
                  toast({ title: 'Pipeline iniciada', description: 'Reprodução iniciada', status: 'success' });
                }
              } catch (err) {
                logger.error('start pipeline error:', err);
                toast({ title: 'Erro', description: 'Falha ao iniciar pipeline', status: 'error' });
              }
            }}
          >
            Play
          </Button>
          <Button
            size="sm"
            colorScheme="gray"
            leftIcon={<Icon as={FaDownload} boxSize={4} />}
            onClick={() => window.open(torrent.torrentFile)}
          >
            .torrent
          </Button>
          <Button
            size="sm"
            colorScheme="gray"
            leftIcon={<Icon as={FaLink} boxSize={4} />}
            onClick={() => navigator.clipboard?.writeText(torrent.magnet || torrent.magnetLink)}
          >
            Link
          </Button>
        </HStack>
      </VStack>
    );
  }, [onPlayTorrent, toast]);

  const renderStreamingOption = useCallback((option) => {
    return (
      <HStack justify="space-between" w="100%" key={option.id}>
        <VStack align="start" spacing={1} flex={1}>
          <Text fontWeight="semibold" fontSize="sm">{option.title}</Text>
          <HStack spacing={2}>
            <Badge colorScheme={option.type === 'streaming' ? 'blue' : 'green'} display="flex" alignItems="center" gap={1}>
              <Icon as={MdHighQuality} boxSize={3} />
              {option.quality}
            </Badge>
            {option.language && (
              <Badge colorScheme="orange" fontSize="xs" display="flex" alignItems="center" gap={1}>
                <Icon as={option.language === 'dublado' ? MdVolumeUp : MdClosedCaption} boxSize={3} />
                {option.language === 'dublado' ? 'DUBLADO' : 'LEGENDADO'}
              </Badge>
            )}
          </HStack>
        </VStack>
        <Button
          size="sm"
          colorScheme={option.type === 'streaming' ? 'blue' : 'green'}
          leftIcon={<Icon as={option.type === 'streaming' ? FaPlay : FaDownload} />}
          onClick={() => {
            if (option.type === 'streaming') {
              onPlayTorrent({
                videoUrl: option.url,
                filename: option.title,
                isDirectStream: true,
                streamMetadata: [{
                  language: option.language,
                  quality: option.quality,
                  type: 'audio'
                }]
              });
              toast({ title: 'Reproduzindo', description: option.title, status: 'success' });
              handleCloseAllModalsLocal();
            } else {
              window.open(option.url);
            }
          }}
        >
          {option.type === 'streaming' ? 'Assistir' : 'Baixar'}
        </Button>
      </HStack>
    );
  }, [onPlayTorrent, toast, handleCloseAllModalsLocal]);

  const resultsNodes = useMemo(() => {
    if (!deferredResults || deferredResults.length === 0) return null;
    return deferredResults.map((item, index) => {
      const key = item.anilist_id ? `al-${item.anilist_id}` : `t-${(item.title||'').replace(/\s+/g,'_')}-${index}`;
      return <SearchResultItem key={key} item={item} onClick={handleSelectAnime} />;
    });
  }, [deferredResults, handleSelectAnime]);

  return (
    <Box position="relative" width="100%" maxWidth="700px" mx="auto" ref={containerRef}>

      <SearchBar value={query} onChange={handleQueryChange} />

      {/* Renderizar modal based on sourceId */}
      {sourceId === 'torrent' ? (
      <AnimeDetailModal
        isOpen={isAnimeDetailOpen}
        onClose={handleCloseAnimeDetail}
        anime={selectedAnime}
        onCloseAllModals={handleCloseAllModalsLocal}
        onPlayTorrent={onPlayTorrent}
      />
      ) : (
        <GenericAnimeDetailModal
          isOpen={isAnimeDetailOpen}
          onClose={handleCloseAnimeDetail}
          anime={selectedAnime}
          fetchEpisodes={fetchEpisodes}
          fetchEpisodeOptions={fetchVideoLinks}
          renderEpisodeOption={renderStreamingOption}
          sourceInfo={sourceConfig}
          onCloseAllModals={handleCloseAllModalsLocal}
          onPlayTorrent={onPlayTorrent}
        />
      )}


      {isDropdownOpen && (
        <Portal>
          <Box
            position="fixed"
            left={dropdownRect?.left ?? 0}
            top={dropdownRect?.top ?? 'auto'}
            width={dropdownRect?.width ?? '100%'}
            maxW="700px"
            mx="auto"
            mt={2}
            bg="#111111"
            border="1px solid #2d2d2d"
            borderRadius="2xl"
            boxShadow="0 10px 40px rgba(0, 0, 0, 0.5)"
            maxH="70vh"
            overflowY="auto"
            overflowX="visible"
            zIndex={1400}
            transition="transform 160ms var(--anim-ease), opacity 160ms var(--anim-ease)"
            style={{ transformOrigin: 'top center' }}
            css={{
              '&::-webkit-scrollbar': { width: '8px' },
              '&::-webkit-scrollbar-track': { background: '#1a1a1a', borderRadius: '10px' },
              '&::-webkit-scrollbar-thumb': { background: '#4a4a4a', borderRadius: '10px' }
            }}
          >
            {/* Header do Dropdown */}
            <Box p={4} borderBottom="1px solid #2d2d2d" position="sticky" top={0} bg="#111111" zIndex={1}>
              <Text color="white" fontSize="md" fontWeight="medium">
                Buscando por: "{query}"
              </Text>

              {bestApi && (
                <Badge colorScheme={bestApi === 'jikan' ? 'blue' : 'purple'} fontSize="xs" mt={2} variant="solid">
                  {bestApi.toUpperCase()} • {apiStatus[bestApi]?.responseTime}ms
                </Badge>
              )}

              {isChecking && (
                <Text fontSize="xs" color="yellow.400" mt={1}>
                  ⚡ Testando APIs...
                </Text>
              )}

              {results.length > 0 && !loading && (
                <Text fontSize="sm" color="gray.400" mt={1}>
                  {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
                </Text>
              )}
            </Box>

            <Box p={4} overflow="visible">
              {loading ? (
                <SearchResultSkeleton count={4} />
              ) : error ? (
                <Center h="200px" flexDirection="column" gap={2}>
                  <Text fontSize="3xl">😔</Text>
                  <Text color="red.400" fontWeight="bold">Erro ao buscar</Text>
                  <Text color="gray.400" fontSize="sm">{error}</Text>
                </Center>
              ) : deferredResults.length > 0 ? (
                <VStack spacing={4} align="stretch">
                  {resultsNodes}
                </VStack>
              ) : (
                <Center h="200px" flexDirection="column" gap={2}>
                  <Text fontSize="3xl">🔍</Text>
                  <Text color="gray.400" fontSize="lg" fontWeight="medium">
                    Nenhum resultado encontrado
                  </Text>
                  <Text color="gray.500" fontSize="sm">
                    Tente buscar por outro termo
                  </Text>
                </Center>
              )}
            </Box>
          </Box>
        </Portal>
      )}
    </Box>
  );
};

export default SearchContainer;

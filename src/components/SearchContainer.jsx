// src/components/SearchContainer.jsx
import React, { useState, useRef, useCallback, useDeferredValue, useEffect, useMemo, Suspense } from 'react';
import { useApi } from '../contexts/ApiContext';
import { fetch_jikan_data } from '../utils/api/jikan.js';
import { fetch_anilist_data } from '../utils/api/anilist.js';
import { searchCache } from '../utils/cache/memoryCache.js';
import { indexedDBCache, STORES } from '../utils/cache/indexedDb.js';
import { Box, VStack, Text, Center, Badge, Spinner, Portal } from '@chakra-ui/react';
import SearchBar from './SearchBar'; 
import SearchResultItem from './SearchResultItem'; 
import AnimeDetailModal from './AnimeDetailModal'; 
import { SearchResultSkeleton } from './SkeletonLoading';

const SearchContainer = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedAnime, setSelectedAnime] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const deferredResults = useDeferredValue(results);
  const searchTimeoutRef = useRef(null);
  const isDropdownOpen = query.trim().length >= 2;
  const containerRef = useRef(null); 
  const [dropdownRect, setDropdownRect] = useState(null); 
  
  // api context
  const { bestApi, apiStatus, isChecking, recheckApis } = useApi();
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
        left: Math.max(8, r.left), // small margin
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
          throw new Error('Nenhuma API disponível no momento. Tentando novamente...');
        }
        
        let data;
        if (bestApi === 'jikan') {
          data = await fetch_jikan_data(searchQuery);
        } else if (bestApi === 'anilist') {
          data = await fetch_anilist_data(searchQuery);
        }
        
        const animeResults = data.map(item => item.data);
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
        setError(err.message || 'Erro ao buscar animes');
        setResults([]);
        
        // retesta api
        recheckApis();
      } finally {
        setLoading(false);
      }
    }, 1200);
  }, [bestApi, recheckApis]);

  const handleAnimeClick = useCallback((anime) => {
    setSelectedAnime(anime);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedAnime(null);
  };

  const resultsNodes = useMemo(() => {
    if (!deferredResults || deferredResults.length === 0) return null;
    return deferredResults.map((item, index) => {
      const key = item.anilist_id ? `al-${item.anilist_id}` : `t-${(item.title||'').replace(/\s+/g,'_')}-${index}`;
      return <SearchResultItem key={key} item={item} onClick={handleAnimeClick} />;
    });
  }, [deferredResults, handleAnimeClick]);

  return (
    <Box position="relative" width="100%" maxWidth="700px" mx="auto" ref={containerRef}>

      <SearchBar value={query} onChange={handleQueryChange} />


      <AnimeDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        anime={selectedAnime}
      />


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

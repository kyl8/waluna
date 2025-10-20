import React, { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  Image,
  Text,
  VStack,
  HStack,
  Grid,
  Badge,
  Flex,
  Button,
  usePrefersReducedMotion
} from '@chakra-ui/react';
import { Global } from '@emotion/react';
import { fetch_anizip_data } from '../utils/api/anizip.js';
import logger from '../utils/helpers/logger.js';
import useSortWorker from '../utils/hooks/useSortWorker.js';
import EpisodesList from './EpisodesList.jsx';
import VirtualList from './VirtualList.jsx';
import { AnimeDetailSkeleton } from './SkeletonLoading';


class ListErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logger.error('Error rendering virtualized list:', error, info);
    if (this.props.onError) this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

const AnimeDetailModal = ({ isOpen, onClose, anime }) => {
  const shouldReduceMotion = usePrefersReducedMotion();
  const [animeDetails, setAnimeDetails] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const episodesContainerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);
  const [visibleCount, setVisibleCount] = useState(25);
  const [episodeSortMode, setEpisodeSortMode] = useState('ascending');

  useEffect(() => {
    const loadAnimeDetails = async () => {
      setLoading(true);

      // usa os dados do anime que já vem da busca (searchbar)
      setAnimeDetails(anime);

      try {
        logger.debug('📦 Carregando episódios do anime:', anime.title || anime.title_english || anime.name || anime.titles?.[0]?.title);

        // tenta usar anilist_id se já estiver presente
        let anilistId = anime.anilist_id || anime.id || null;
        if (anilistId) anilistId = Number(anilistId);

        // busca os episódios. Passe um objeto com ambos os ids quando possível
        const fetchParam = {
          anilist_id: anilistId || null,
          mal_id: anime.mal_id || anime.idMal || null
        };

        const results = await fetch_anizip_data(fetchParam);

        if (results.length > 0 && results[0].data.episodeList) {
          const episodeData = results[0].data;
          logger.info('✅ Episódios carregados:', episodeData.episodeList.length);
          setEpisodes(episodeData.episodeList);
        } else {
          logger.warn('⚠️ Nenhum episódio encontrado no AniZip');
          setEpisodes([]);
        }
      } catch (err) {
        logger.error('❌ Erro ao carregar episódios:', err);
        setEpisodes([]);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && anime) {
      loadAnimeDetails();
    }
  }, [isOpen, anime]);

  useEffect(() => {
    const measure = () => {
      if (!episodesContainerRef.current) return;
      const w = episodesContainerRef.current.clientWidth;
      logger.info(`📏 Container width measured: ${w}`);
      if (w && w !== containerWidth) {
        setContainerWidth(w);
      }
    };
    
    measure();
    
    const ro = new ResizeObserver(() => {
      measure();
    });
    
    if (episodesContainerRef.current) {
      ro.observe(episodesContainerRef.current);
      
      const container = episodesContainerRef.current.closest('[role="dialog"]');
      if (container) {
        const wheelHandler = (e) => {
        };
        
        container.addEventListener('wheel', wheelHandler, { passive: true });
        container.addEventListener('touchmove', wheelHandler, { passive: true });
        
        return () => {
          container.removeEventListener('wheel', wheelHandler, { passive: true });
          container.removeEventListener('touchmove', wheelHandler, { passive: true });
        };
      }
    }
    
    return () => {
      ro.disconnect();
    };
  }, [isOpen, containerWidth]); 

  
  const { episodes: sortedEpisodes = [], isPending } = useSortWorker(episodes, episodeSortMode) || {};
  const deferredEpisodes = sortedEpisodes || [];

  const displayData = animeDetails || anime; 
  const memoizedHelpers = React.useMemo(() => ({
    getTitle: () => {
      if (!displayData) return 'Título não disponível';
      if (displayData.titles) {
        return displayData.titles.find(t => t.type === 'Default')?.title || displayData.title;
      }
      return displayData.title || 'Título não disponível';
    },
    getImage: () => {
      if (!displayData) return '';
      return displayData.images?.jpg?.large_image_url || displayData.images?.jpg?.image_url || '';
    },
  }), [displayData]);

  const getTitle = memoizedHelpers.getTitle;
  const getImage = memoizedHelpers.getImage;

  // Usa animeDetails se disponível, senão usa anime
  const EpisodeRowInner = ({ ep, style, index, shouldReduceMotion }) => {
    const formattedDate = ep.airDate ? new Date(ep.airDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
    const episodeLabel = Number.isFinite(ep.number) ? `EP ${ep.number}` : 'EP N/A';
    
    return (
    <Box
      style={style}
      key={ep.uid || ep.absoluteNumber || index}
      p={2}
      bg="#2d2d2d"
      borderRadius="md"
      _hover={!shouldReduceMotion ? { bg: '#353535' } : undefined}
      opacity={ep.isAired === false ? 0.6 : 1}
      position="relative"
      css={{ contain: 'layout paint' }}
    >
      <HStack align="center" spacing={2} justify="space-between">
        {ep.image ? (
          <Image
            src={ep.image}
            alt={episodeLabel}
            w="60px"
            h="38px"
            borderRadius="sm"
            objectFit="cover"
            flexShrink={0}
            loading="lazy"
          />
        ) : (
          <Text fontSize="xs" color="gray.500" w="60px" textAlign="center">
            Sem imagem
          </Text>
        )}
        <VStack align="start" spacing={0.5} flex={1} minW={0}>
          <HStack spacing={1}>
            <Badge colorScheme="purple" fontSize="xs" py={0.5}>
              {episodeLabel}
            </Badge>
            {ep.absoluteNumber && ep.absoluteNumber !== ep.number && (
              <Badge colorScheme="gray" fontSize="xs" py={0.5}>#{ep.absoluteNumber}</Badge>
            )}
            {ep.isAired === false && (
              <Badge colorScheme="orange" fontSize="xs" py={0.5}>EM BREVE</Badge>
            )}
          </HStack>
          <Text fontWeight="600" fontSize="sm" noOfLines={1}>{ep.title}</Text>
          <Text fontSize="xs" color="gray.400" noOfLines={1}>{ep.overview || 'Sem descrição'}</Text>
        </VStack>
        <VStack align="end" spacing={0} ml={2} flexShrink={0}>
          {formattedDate && (
            <Text fontSize="xs" color={ep.isAired === false ? 'orange.400' : 'gray.500'} whiteSpace="nowrap">
              {formattedDate}
            </Text>
          )}
          {ep.runtime && (
            <Text fontSize="xs" color="gray.600">{ep.runtime}min</Text>
          )}
        </VStack>
      </HStack>
    </Box>
    );
  };
  const EpisodeRow = React.memo(EpisodeRowInner, (prev, next) => prev.ep === next.ep && prev.index === next.index && prev.shouldReduceMotion === next.shouldReduceMotion);
  const renderItem = useCallback(({ item, index, style }) => (
    <EpisodeRow key={item.uid || item.absoluteNumber || index} ep={item} style={style} index={index} shouldReduceMotion={shouldReduceMotion} />
  ), [shouldReduceMotion]);

  const handleToggleSort = useCallback(() => {
    startTransition(() => {
      setEpisodeSortMode(prev => prev === 'ascending' ? 'descending' : 'ascending');
    });
  }, []);

  const renderSortUI = useCallback(() => (
    <HStack justify="space-between" mb={4}>
      <Text fontSize="xl" fontWeight="bold">Episódios</Text>
      <HStack spacing={2}>
        {episodes.length > 0 && (
          <Text fontSize="sm" color="gray.400">
            {episodes.length} episódios
          </Text>
        )}
        <Button 
          size="sm" 
          onClick={handleToggleSort}
          isLoading={isPending}
        >
          {episodeSortMode === 'ascending' ? '↑ Ascend' : '↓ Descend'}
        </Button>
      </HStack>
    </HStack>
  ), [episodes.length, episodeSortMode, isPending]);

  const handleLoadMore = useCallback((e) => {
    if (e) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    const newCount = Math.min(deferredEpisodes.length, visibleCount + 50);
    logger.debug(`Load more clicked: current ${visibleCount} -> next ${newCount}`);
    logger.debug(`Before setVisibleCount: visibleCount state = ${visibleCount}`);
    setVisibleCount(newCount);
    logger.debug(`After setVisibleCount called`);
  }, [visibleCount, deferredEpisodes.length]);

  useEffect(() => {
    logger.debug(`🔄 visibleCount state changed in AnimeDetailModal: ${visibleCount}`);
  }, [visibleCount]);

  if (!anime) return null;

  return (
    <>
      <Global
        styles={`
          * {
            -webkit-font-smoothing: subpixel-antialiased;
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
          }
        `}
      />
      
      <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
        <ModalOverlay bg="blackAlpha.800" zIndex={1400} />
        <ModalContent
          bg="#1a1a1a"
          color="gray.100"
          maxH="90vh"
          zIndex={1400}
        >
          <ModalHeader borderBottom="1px solid #2d2d2d">
            <Text fontSize="2xl" fontWeight="bold">{getTitle()}</Text>
          </ModalHeader>
          <ModalCloseButton />
          
          <ModalBody p={6}>
            {loading ? (
              <Box>
                <AnimeDetailSkeleton />
              </Box>
            ) : (
              <Box css={{ contain: 'layout style paint' }}>
                <Grid templateColumns={{ base: '1fr', lg: '300px 1fr' }} gap={6}>
                  {/* Coluna esquerda - Poster e info */}
                  <Box>
                    <VStack align="stretch" spacing={4}>
                      <Image
                        src={getImage()}
                        alt={getTitle()}
                        borderRadius="xl"
                        w="100%"
                        fallbackSrc="https://via.placeholder.com/300x400?text=No+Image"
                        placeholder="blur"
                        loading="lazy"
                      />
                      
                      <VStack align="stretch" spacing={2}>
                        <HStack>
                          <Badge colorScheme="purple" fontSize="sm">{displayData.type || 'TV'}</Badge>
                          {displayData.episodes && (
                            <Badge colorScheme="blue" fontSize="sm">
                              {displayData.episodes} {displayData.episodes === 1 ? 'EPISODE' : 'EPISODES'}
                            </Badge>
                          )}
                        </HStack>
                        
                        {displayData.score && (
                          <HStack>
                            <Text fontSize="sm" color="gray.400">Score:</Text>
                            <Text fontSize="lg" color="yellow.400" fontWeight="bold">
                              ★ {displayData.score}
                            </Text>
                          </HStack>
                        )}
                        
                        {displayData.year && (
                          <HStack>
                            <Text fontSize="sm" color="gray.400">Ano:</Text>
                            <Text fontSize="md" fontWeight="semibold">{displayData.year}</Text>
                          </HStack>
                        )}
                        
                        {displayData.status && (
                          <HStack>
                            <Text fontSize="sm" color="gray.400">Status:</Text>
                            <Text fontSize="md">{displayData.status}</Text>
                          </HStack>
                        )}
                      </VStack>
                    </VStack>
                  </Box>

                  {/* Coluna direita - Sinopse e Episódios */}
                  <Box>
                    <VStack align="stretch" spacing={6}>
                      {/* Sinopse */}
                      <Box>
                        <Text fontSize="xl" fontWeight="bold" mb={3}>Sinopse</Text>
                        <Text fontSize="sm" color="gray.300" lineHeight="tall">
                          {displayData.synopsis || 'Sem sinopse disponível.'}
                        </Text>
                      </Box>

                      {/* Lista de Episódios */}
                      <Box
                        ref={episodesContainerRef}
                        key={`episodes-container-${anime.id}`}
                        css={{
                          contain: 'layout style paint',
                          willChange: 'scroll-position'
                        }}
                      >
                        {renderSortUI()}
                        
                        <Box position="relative" css={{ contain: 'layout paint' }}>
                          <Box opacity={isPending ? 0.6 : 1} transition="opacity 100ms ease">
                            {isPending ? (
                              <Box minH="200px" />
                            ) : deferredEpisodes?.length > 0 ? (
                              deferredEpisodes.length > 200 ? (
                                (() => {
                                  const rowHeight = 88;
                                  const listHeight = Math.min(600, rowHeight * 8);

                                  if (!containerWidth) {
                                    return (
                                      <EpisodesList
                                        key={`episodeslist-fallback-${anime.id}-${deferredEpisodes.length}`}
                                        episodes={deferredEpisodes}
                                        visibleCount={visibleCount}
                                        onLoadMore={handleLoadMore}
                                        EpisodeRow={EpisodeRow}
                                      />
                                    );
                                  }

                                  return (
                                    <ListErrorBoundary
                                      key={`virtuallist-${anime.id}-${deferredEpisodes.length}-${containerWidth}`}
                                      onError={(err) => {
                                        logger.error({ err }, 'VirtualList error');
                                      }}
                                      fallback={
                                        <EpisodesList
                                          key={`episodeslist-fb-${anime.id}-${deferredEpisodes.length}`}
                                          episodes={deferredEpisodes}
                                          visibleCount={visibleCount}
                                          onLoadMore={handleLoadMore}
                                          EpisodeRow={EpisodeRow}
                                        />
                                      }
                                    >
                                      <VirtualList
                                        key={`virtuallist-${anime.id}-${deferredEpisodes.length}-${containerWidth}`}
                                        items={deferredEpisodes}
                                        rowHeight={rowHeight}
                                        height={listHeight}
                                        width={containerWidth}
                                        overscan={12}
                                        renderItem={renderItem}
                                        showSort={false}
                                        className="gpu-accelerate anim"
                                      />
                                    </ListErrorBoundary>
                                  );
                                })()
                              ) : (
                                <EpisodesList
                                  key={`episodeslist-${anime.id}-${deferredEpisodes.length}`}
                                  episodes={deferredEpisodes}
                                  visibleCount={visibleCount}
                                  onLoadMore={handleLoadMore}
                                  EpisodeRow={EpisodeRow}
                                />
                              )
                            ) : !loading && episodes.length === 0 ? (
                              <Box
                                p={8}
                                bg="#2d2d2d"
                                borderRadius="lg"
                                textAlign="center"
                              >
                                <Text color="gray.400">
                                  Lista de episódios não disponível
                                </Text>
                              </Box>
                            ) : (
                              <Box minH="200px" />
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </VStack>
                  </Box>
                </Grid>
              </Box>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default AnimeDetailModal;
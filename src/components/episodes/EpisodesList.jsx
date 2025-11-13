import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { VStack, Box, Table, Thead, Tbody, Tr, Th, Td, Badge, Button, HStack, Tooltip, Text, Spinner } from '@chakra-ui/react';
import { Global } from '@emotion/react';
import { FaDownload, FaMagnet, FaSeedling, FaArrowDown, FaChevronUp, FaPlay } from 'react-icons/fa';
import { filterTorrents } from '../../utils/helpers/rakun.js';
import { startFullPipeline } from '../../utils/api/waluna.js';
import VideoPlayer from '../video/VideoPlayer';

const TorrentTable = ({ episodeId, onClose, animeName, episodeNumber, seasonNumber, onPlayTorrent }) => {
  const [torrents, setTorrents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(null);

  useEffect(() => {
    const fetchTorrents = async () => {
      try {
        console.log(`[TorrentTable] Fetching torrents for:`, { animeName, seasonNumber, episodeNumber });
        setLoading(true);
        const result = await filterTorrents(animeName, episodeNumber, seasonNumber || 1);
        console.log(`[TorrentTable] Received ${result.matches.length} torrents`);
        setTorrents(result.matches || []);
      } catch (error) {
        console.error(`[TorrentTable] Error fetching torrents:`, error);
        setTorrents([]);
      } finally {
        setLoading(false);
      }
    };

    if (animeName && episodeNumber) {
      console.log(`[TorrentTable] Starting fetch - animeName: ${animeName}, seasonNumber: ${seasonNumber}, episodeNumber: ${episodeNumber}`);
      fetchTorrents();
    } else {
      console.warn(`[TorrentTable] Missing parameters - animeName: ${animeName}, seasonNumber: ${seasonNumber}, episodeNumber: ${episodeNumber}`);
    }
  }, [animeName, episodeNumber, seasonNumber]);

  const getHealthColor = (seeds, leechers) => {
    const ratio = seeds / (leechers || 1);
    if (ratio > 2) return 'green';
    if (ratio > 0.5) return 'yellow';
    return 'red';
  };

  const formatNumber = (num) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  return (
    <Box 
      bg="#2d2d2d" 
      borderRadius="lg" 
      p={4} 
      my={2}
      w="100%"
      maxW="100%"
      overflowX="auto"
    >
      <HStack justify="space-between" mb={4} w="100%">
        <Button size="sm" colorScheme="gray" variant="ghost" leftIcon={<FaChevronUp />} onClick={onClose}>
          Fechar
        </Button>
      </HStack>

      {loading ? (
        <VStack spacing={4} py={8} w="100%">
          <Spinner 
            thickness='4px'
            speed='0.65s'
            emptyColor='gray.700'
            color='purple.500'
            size='lg'
          />
          <Text color="gray.400" fontSize="sm">Carregando torrents...</Text>
        </VStack>
      ) : torrents.length === 0 ? (
        <VStack spacing={4} py={8} w="100%">
          <Box fontSize="3xl">🔍</Box>
          <Text color="gray.400" fontSize="sm">Nenhum torrent encontrado</Text>
          <Text color="gray.500" fontSize="xs">Tente ajustar os filtros</Text>
        </VStack>
      ) : (
        <Box w="100%" overflowX="auto">
          <Table size="sm" variant="unstyled">
            <Thead bg="#1a1a1a" position="sticky" top={0} zIndex={1}>
              <Tr>
                <Th color="gray.300" fontSize="10px" fontWeight="bold" w="50%">Nome</Th>
                <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">Tamanho</Th>
                <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">
                  <HStack spacing={1} justify="flex-end">
                    <FaSeedling size={10} />
                    <Text>Seeds</Text>
                  </HStack>
                </Th>
                <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">
                  <HStack spacing={1} justify="flex-end">
                    <FaArrowDown size={10} />
                    <Text>Leech</Text>
                  </HStack>
                </Th>
                <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">Downloads</Th>
                <Th color="gray.300" fontSize="10px" fontWeight="bold" textAlign="center" w="8%">Saúde</Th>
                <Th color="gray.300" fontSize="10px" fontWeight="bold" textAlign="center" w="8%">Ações</Th>
              </Tr>
            </Thead>
            <Tbody>
              {torrents.map((torrent) => {
                const seeds = torrent.torrent_info?.seeders || 0;
                const leechers = torrent.torrent_info?.leechers || 0;
                const healthColor = getHealthColor(seeds, leechers);
                const healthBg = healthColor === 'green' ? 'green.900' : healthColor === 'yellow' ? 'yellow.900' : 'red.900';
                const healthTextColor = healthColor === 'green' ? 'green.200' : healthColor === 'yellow' ? 'yellow.200' : 'red.200';

                return (
                  <Tr key={torrent.hash || torrent.filename} _hover={{ bg: '#353535' }} borderBottom="1px solid #1a1a1a">
                    <Td w="50%">
                      <VStack align="start" spacing={1} w="100%">
                        <Text fontSize="9px" fontWeight="semibold" noOfLines={2} title={torrent.filename}>
                          {torrent.filename}
                        </Text>
                        <HStack spacing={1}>
                          {torrent.quality && <Badge fontSize="7px" colorScheme="purple">{torrent.quality}</Badge>}
                          {torrent.source && <Badge fontSize="7px" colorScheme="blue">{torrent.source}</Badge>}
                        </HStack>
                      </VStack>
                    </Td>
                    <Td isNumeric w="10%">
                      <Text fontSize="9px" fontWeight="semibold">
                        {torrent.torrent_info?.size_value && torrent.torrent_info?.size_unit 
                          ? `${torrent.torrent_info.size_value} ${torrent.torrent_info.size_unit}`
                          : torrent.torrent_info?.size || 'N/A'
                        }
                      </Text>
                    </Td>
                    <Td isNumeric w="10%">
                      <HStack spacing={0.5} justify="flex-end">
                        <FaSeedling size={10} color="#68d391" />
                        <Text fontSize="9px" fontWeight="bold" color="green.400">
                          {formatNumber(seeds)}
                        </Text>
                      </HStack>
                    </Td>
                    <Td isNumeric w="10%">
                      <HStack spacing={0.5} justify="flex-end">
                        <FaArrowDown size={10} color="#f6ad55" />
                        <Text fontSize="9px" fontWeight="bold" color="orange.400">
                          {formatNumber(leechers)}
                        </Text>
                      </HStack>
                    </Td>
                    <Td isNumeric w="10%">
                      <Text fontSize="9px" color="gray.400">{formatNumber(torrent.torrent_info?.downloads || 0)}</Text>
                    </Td>
                    <Td textAlign="center" w="8%">
                      <Box px={1} py={0.5} borderRadius="md" bg={healthBg} display="inline-block">
                        <Text fontSize="8px" fontWeight="bold" color={healthTextColor}>
                          {seeds > 1000 ? '✓' : seeds > 100 ? '◐' : '✗'}
                        </Text>
                      </Box>
                    </Td>
                    <Td textAlign="center" w="8%">
                      <HStack spacing={1} justify="center">
                        <Tooltip label="Reproduzir">
                          <Button 
                            onClick={async () => {
                              setPlaying(torrent.hash);
                              try {
                                console.log('[TorrentTable] Starting pipeline with magnet:', torrent.torrent_info?.magnet_link);
                                const result = await startFullPipeline(torrent.torrent_info?.magnet_link);
                                console.log('[TorrentTable] Pipeline started:', result);
                                onPlayTorrent({
                                  ...torrent,
                                  downloadId: result.downloadId,
                                  hlsId: result.hlsId,
                                  playlistURL: result.playlistURL,
                                });
                                onClose();
                              } catch (error) {
                                console.error('[TorrentTable] Pipeline error:', error);
                                setPlaying(null);
                              }
                            }}
                            isLoading={playing === torrent.hash}
                            loadingText="Iniciando..."
                            size="xs" 
                            colorScheme="purple"
                            bg="purple.600"
                            _hover={{ 
                              bg: 'purple.500', 
                              transform: 'scale(1.08)',
                              boxShadow: '0 0 12px rgba(168, 85, 247, 0.6)'
                            }}
                            _active={{ bg: 'purple.700' }}
                            leftIcon={<FaPlay size={9} />} 
                            p={1} 
                            minW="auto" 
                            fontSize="8px"
                            fontWeight="bold"
                            transition="all 150ms ease"
                            boxShadow="0 0 6px rgba(168, 85, 247, 0.4)"
                            _focusVisible={{
                              outline: '2px solid',
                              outlineColor: 'purple.400'
                            }}
                          >
                            Play
                          </Button>
                        </Tooltip>
                        <Tooltip label="Baixar Torrent">
                          <Button 
                            as="a" 
                            href={torrent.torrent_info?.link} 
                            target="_blank" 
                            size="xs" 
                            colorScheme="green"
                            bg="green.600"
                            _hover={{ 
                              bg: 'green.500', 
                              transform: 'scale(1.08)',
                              boxShadow: '0 0 12px rgba(72, 187, 120, 0.6)'
                            }}
                            _active={{ bg: 'green.700' }}
                            leftIcon={<FaDownload size={9} />} 
                            p={1} 
                            minW="auto" 
                            fontSize="8px"
                            fontWeight="bold"
                            transition="all 150ms ease"
                            boxShadow="0 0 6px rgba(72, 187, 120, 0.4)"
                            _focusVisible={{
                              outline: '2px solid',
                              outlineColor: 'green.400'
                            }}
                          >
                            DL
                          </Button>
                        </Tooltip>
                      </HStack>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
};

const EpisodesList = ({ 
  episodes, 
  EpisodeRow,
  animeName,
  onPlayTorrent,
  onCloseAllModals
}) => {
  const [visibleCount, setVisibleCount] = useState(25);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState(null);
  const observerTarget = useRef(null);
  const isLoadingRef = useRef(false);
  const debounceRef = useRef(null);

  const finalAnimeName = useMemo(() => {
    if (animeName) {
      console.log(`[EpisodesList] Using provided animeName:`, animeName);
      return animeName;
    }
    
    if (episodes && episodes.length > 0) {
      const extracted = episodes[0].anime?.name || episodes[0].animeName || episodes[0].seriesName;
      console.log(`[EpisodesList] Extracted animeName from episodes:`, extracted);
      return extracted;
    }
    
    console.warn(`[EpisodesList] Could not find animeName`);
    return null;
  }, [animeName, episodes]);

  useEffect(() => {
    console.log(`[EpisodesList] Component mounted with animeName:`, finalAnimeName);
  }, [finalAnimeName]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (isLoadingRef.current) return;
        if (!entries[0].isIntersecting) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(() => {
          setVisibleCount(prev => {
            const newCount = Math.min(prev + 25, episodes.length);
            if (newCount > prev) {
              isLoadingRef.current = true;
              requestAnimationFrame(() => {
                isLoadingRef.current = false;
              });
            }
            return newCount;
          });
        }, 150);
      },
      { threshold: 0.01, rootMargin: '200px' }
    );

    if (observerTarget.current) observer.observe(observerTarget.current);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      observer.disconnect();
    };
  }, [episodes.length]);

  const visibleEpisodes = useMemo(() => episodes.slice(0, visibleCount), [episodes, visibleCount]);
  const hasMore = visibleCount < episodes.length;

  const handleEpisodeClick = useCallback((epUid) => {
    console.log(`[EpisodesList] Episode clicked:`, epUid);
    setExpandedEpisodeId(prev => prev === epUid ? null : epUid);
  }, []);

  const handlePlayTorrentClick = useCallback((torrent) => {
    console.log(`[EpisodesList] Playing torrent:`, torrent.filename);
    console.log(`[EpisodesList] Closing all modals`);
    
    // Fechar todos os modais anteriores PRIMEIRO
    if (onCloseAllModals) {
      console.log('[EpisodesList] Calling onCloseAllModals');
      onCloseAllModals();
    }
    
    // Depois enviar torrent para o player
    if (onPlayTorrent) {
      console.log('[EpisodesList] Calling onPlayTorrent');
      onPlayTorrent(torrent);
    }
  }, [onPlayTorrent, onCloseAllModals]);

  return (
    <>
      <Global
        styles={`
          * {
            -webkit-font-smoothing: subpixel-antialiased;
          }
        `}
      />

      <VStack 
        align="stretch" 
        spacing={3}
        w="100%"
        css={{ contain: 'layout style paint' }}
      >
        {visibleEpisodes.map((ep, index) => (
          <Box 
            key={ep.uid || ep.absoluteNumber || `ep-${index}`} 
            w="100%"
            css={{ contain: 'layout paint' }}
          >
            <Box
              onClick={() => handleEpisodeClick(ep.uid)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleEpisodeClick(ep.uid);
              }}
              css={{
                width: '100%',
                cursor: 'pointer',
                contain: 'layout paint'
              }}
            >
              <EpisodeRow ep={ep} index={index} style={undefined} />
            </Box>

            {expandedEpisodeId === ep.uid && (
              <TorrentTable 
                episodeId={ep.uid}
                animeName={finalAnimeName}
                seasonNumber={ep.seasonNumber || ep.season || 1}
                episodeNumber={ep.episodeNumber || ep.number || ep.absoluteNumber}
                onClose={() => setExpandedEpisodeId(null)}
                onPlayTorrent={(torrent) => handlePlayTorrentClick(torrent)}
              />
            )}
          </Box>
        ))}
      </VStack>

      {hasMore && (
        <Box ref={observerTarget} py={4} textAlign="center" css={{ contain: 'layout paint' }}>
          <Box
            display="inline-block"
            w="8px"
            h="8px"
            borderRadius="50%"
            bg="purple.400"
          />
        </Box>
      )}
    </>
  );
};

EpisodesList.displayName = 'EpisodesList';

export default React.memo(EpisodesList);

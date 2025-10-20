import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { VStack, Box, Table, Thead, Tbody, Tr, Th, Td, Badge, Button, HStack, Tooltip, Text } from '@chakra-ui/react';
import { Global } from '@emotion/react';
import { FaDownload, FaMagnet, FaSeedling, FaArrowDown, FaChevronUp } from 'react-icons/fa';
import { MOCK_TORRENTS } from '../constants/mockTorrents.js'; 

const TorrentTable = ({ episodeId, onClose }) => {
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
        <Button size="sm" colorPalette="gray" variant="ghost" leftIcon={<FaChevronUp />} onClick={onClose}>
          Fechar
        </Button>
      </HStack>

      <Box w="100%" overflowX="auto" maxW="100%">
        <Table size="sm" variant="unstyled">
          <Thead bg="#1a1a1a" position="sticky" top={0} zIndex={1}>
            <Tr>
              <Th color="gray.300" fontSize="10px" fontWeight="bold" w="40%">Nome</Th>
              <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">Tamanho</Th>
              <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">
                <Tooltip label="Seeds">
                  <HStack spacing={1} justify="flex-end">
                    <FaSeedling size={10} />
                    <Text>Seeds</Text>
                  </HStack>
                </Tooltip>
              </Th>
              <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">
                <Tooltip label="Leechers">
                  <HStack spacing={1} justify="flex-end">
                    <FaArrowDown size={10} />
                    <Text>Leech</Text>
                  </HStack>
                </Tooltip>
              </Th>
              <Th color="gray.300" fontSize="10px" fontWeight="bold" isNumeric w="10%">Completo</Th>
              <Th color="gray.300" fontSize="10px" fontWeight="bold" textAlign="center" w="10%">Saúde</Th>
              <Th color="gray.300" fontSize="10px" fontWeight="bold" textAlign="center" w="10%">Ações</Th>
            </Tr>
          </Thead>
          <Tbody>
            {MOCK_TORRENTS.map((torrent) => {
              const healthColor = getHealthColor(torrent.seeds, torrent.leechers);
              const healthBg = healthColor === 'green' ? 'green.900' : healthColor === 'yellow' ? 'yellow.900' : 'red.900';
              const healthTextColor = healthColor === 'green' ? 'green.200' : healthColor === 'yellow' ? 'yellow.200' : 'red.200';

              return (
                <Tr key={torrent.id} _hover={{ bg: '#353535' }} borderBottom="1px solid #1a1a1a">
                  <Td w="40%">
                    <VStack align="start" spacing={1} w="100%">
                      <Text fontSize="9px" fontWeight="semibold" noOfLines={2} title={torrent.name}>
                        {torrent.name}
                      </Text>
                      <HStack spacing={1}>
                        <Badge fontSize="7px" colorScheme="purple">{torrent.quality}</Badge>
                        <Badge fontSize="7px" colorScheme="blue">{torrent.source}</Badge>
                      </HStack>
                    </VStack>
                  </Td>
                  <Td isNumeric w="10%">
                    <Text fontSize="9px" fontWeight="semibold">{torrent.size}</Text>
                  </Td>
                  <Td isNumeric w="10%">
                    <HStack spacing={0.5} justify="flex-end">
                      <FaSeedling size={10} color="#68d391" />
                      <Text fontSize="9px" fontWeight="bold" color="green.400">
                        {formatNumber(torrent.seeds)}
                      </Text>
                    </HStack>
                  </Td>
                  <Td isNumeric w="10%">
                    <HStack spacing={0.5} justify="flex-end">
                      <FaArrowDown size={10} color="#f6ad55" />
                      <Text fontSize="9px" fontWeight="bold" color="orange.400">
                        {formatNumber(torrent.leechers)}
                      </Text>
                    </HStack>
                  </Td>
                  <Td isNumeric w="10%">
                    <Text fontSize="9px" color="gray.400">{formatNumber(torrent.completed)}</Text>
                  </Td>
                  <Td textAlign="center" w="10%">
                    <Box px={1} py={0.5} borderRadius="md" bg={healthBg} display="inline-block">
                      <Text fontSize="8px" fontWeight="bold" color={healthTextColor}>
                        {torrent.seeds > 1000 ? '✓' : torrent.seeds > 100 ? '◐' : '✗'}
                      </Text>
                    </Box>
                  </Td>
                  <Td textAlign="center" w="10%">
                    <HStack spacing={0.5} justify="center">
                      <Tooltip label="Torrent">
                        <Button size="xs" colorScheme="purple" variant="ghost" leftIcon={<FaDownload size={10} />} p={1} minW="auto" fontSize="8px">
                          DL
                        </Button>
                      </Tooltip>
                      <Tooltip label="Magnet">
                        <Button size="xs" colorScheme="purple" variant="ghost" leftIcon={<FaMagnet size={10} />} p={1} minW="auto" fontSize="8px">
                          MAG
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
    </Box>
  );
};

const EpisodesList = ({ 
  episodes, 
  EpisodeRow
}) => {
  const [visibleCount, setVisibleCount] = useState(25);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState(null);
  const observerTarget = useRef(null);
  const isLoadingRef = useRef(false);
  const debounceRef = useRef(null);

  // Infinite scroll com Intersection Observer otimizado
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
    setExpandedEpisodeId(prev => prev === epUid ? null : epUid);
  }, []);

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
                onClose={() => setExpandedEpisodeId(null)}
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

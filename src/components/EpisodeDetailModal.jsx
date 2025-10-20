import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Box,
  Text,
  VStack,
  HStack,
  Badge,
  Button,
  Divider,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Tooltip,
  IconButton,
  usePrefersReducedMotion
} from '@chakra-ui/react';
import { FaDownload, FaMagnet, FaSeedling, FaArrowDown } from 'react-icons/fa';
import { MOCK_TORRENTS } from '../constants/mockTorrents.js'; 
import { Global } from '@emotion/react';
import { getOptimalDuration, subscribeFrameRate, unsubscribeFrameRate } from '../utils/helpers/animation.js';

const TorrentRow = React.memo(({ torrent, getHealthColor, formatNumber, handleDownload, handleMagnet, shouldReduceMotion }) => {
  const healthColor = getHealthColor(torrent.seeds, torrent.leechers);
  const healthBg = healthColor === 'green' ? 'green.900' : healthColor === 'yellow' ? 'yellow.900' : 'red.900';
  const healthTextColor = healthColor === 'green' ? 'green.200' : healthColor === 'yellow' ? 'yellow.200' : 'red.200';

  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    const cb = () => setTick(t => t + 1);
    const unsub = subscribeFrameRate(cb);
    return () => { try { unsub(); } catch (e) { unsubscribeFrameRate(cb); } };
  }, []);

  const transitionDuration = getOptimalDuration(100);

  return (
    <Tr
      borderBottom="1px solid #1a1a1a"
      _hover={!shouldReduceMotion ? { bg: 'rgba(255,255,255,0.015)' } : undefined}
      transition={!shouldReduceMotion ? `background-color ${transitionDuration}ms ease-out` : 'none'}
      css={{ contain: 'layout paint' }}
    >
      <Td>
        <VStack align="start" spacing={1}>
          <Text fontSize="xs" fontWeight="semibold" noOfLines={2} title={torrent.name}>
            {torrent.name}
          </Text>
          <HStack spacing={2}>
            <Badge fontSize="8px" colorScheme="purple">{torrent.quality}</Badge>
            <Badge fontSize="8px" colorScheme="blue">{torrent.source}</Badge>
            <Badge fontSize="8px" colorScheme="gray">{torrent.codec}</Badge>
          </HStack>
        </VStack>
      </Td>
      <Td isNumeric>
        <Text fontSize="xs" fontWeight="semibold">{torrent.size}</Text>
      </Td>
      <Td isNumeric>
        <HStack spacing={1} justify="flex-end">
          <FaSeedling size={12} color="#68d391" />
          <Text fontSize="xs" fontWeight="bold" color="green.400">
            {formatNumber(torrent.seeds)}
          </Text>
        </HStack>
      </Td>
      <Td isNumeric>
        <HStack spacing={1} justify="flex-end">
          <FaArrowDown size={12} color="#f6ad55" />
          <Text fontSize="xs" fontWeight="bold" color="orange.400">
            {formatNumber(torrent.leechers)}
          </Text>
        </HStack>
      </Td>
      <Td isNumeric>
        <Text fontSize="xs" color="gray.400">{formatNumber(torrent.completed)}</Text>
      </Td>
      <Td textAlign="center">
        <Box px={2} py={1} borderRadius="md" bg={healthBg} display="inline-block">
          <Text fontSize="10px" fontWeight="bold" color={healthTextColor}>
            {torrent.seeds > 1000 ? '✓ Ótimo' : torrent.seeds > 100 ? '◐ Bom' : '✗ Baixo'}
          </Text>
        </Box>
      </Td>
      <Td textAlign="center">
        <HStack spacing={1} justify="center">
          <Tooltip label="Baixar Torrent">
            <IconButton
              aria-label="Baixar .torrent"
              icon={<FaDownload size={12} />}
              size="sm"
              variant="ghost"
              colorScheme="purple"
              onClick={() => handleDownload(torrent)}
              p={2}
              minW="36px"
              w="36px"
              h="36px"
              fontSize="12px"
              _hover={!shouldReduceMotion ? { bg: 'rgba(159, 122, 234, 0.2)' } : undefined}
              _active={!shouldReduceMotion ? { bg: 'rgba(159, 122, 234, 0.3)' } : undefined}
              transition={!shouldReduceMotion ? `background-color ${transitionDuration}ms ease` : 'none'}
            />
          </Tooltip>

          <Tooltip label="Magnet Link">
            <IconButton
              aria-label="Magnet link"
              icon={<FaMagnet size={12} />}
              size="sm"
              variant="ghost"
              colorScheme="purple"
              onClick={() => handleMagnet(torrent)}
              p={2}
              minW="36px"
              w="36px"
              h="36px"
              fontSize="12px"
              _hover={!shouldReduceMotion ? { bg: 'rgba(159, 122, 234, 0.2)' } : undefined}
              _active={!shouldReduceMotion ? { bg: 'rgba(159, 122, 234, 0.3)' } : undefined}
              transition={!shouldReduceMotion ? `background-color ${transitionDuration}ms ease` : 'none'}
            />
          </Tooltip>
        </HStack>
      </Td>
    </Tr>
  );
}, (prev, next) => {
  return prev.torrent.id === next.torrent.id && prev.shouldReduceMotion === next.shouldReduceMotion;
});

TorrentRow.displayName = 'TorrentRow';

const EpisodeDetailModal = ({ isOpen, onClose, episode }) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef(null);
  const shouldReduceMotion = usePrefersReducedMotion();

  const handleDownload = useCallback((torrent) => {
    console.log('Download torrent:', torrent.name);
  }, []);

  const handleMagnet = useCallback((torrent) => {
    console.log('Magnet link:', torrent.name);
  }, []);

  const episodeLabel = useMemo(
    () => episode && Number.isFinite(episode.number) ? `EP ${episode.number}` : 'EP N/A',
    [episode?.number]
  );

  const getHealthColor = useCallback((seeds, leechers) => {
    const ratio = seeds / (leechers || 1);
    if (ratio > 2) return 'green';
    if (ratio > 0.5) return 'yellow';
    return 'red';
  }, []);

  const formatNumber = useCallback((num) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    setContainerWidth(width);
  }, [isOpen]);

  const airDate = useMemo(() => {
    if (!episode?.airDate) return null;
    return new Date(episode.airDate).toLocaleDateString('pt-BR');
  }, [episode?.airDate]);

  if (!episode) return null;

  return (
    <>
      <Global
        styles={`
          * {
            -webkit-font-smoothing: subpixel-antialiased;
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
          }
          
          @media (prefers-reduced-motion: reduce) {
            * {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
            }
          }
        `}
      />

      <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        size={{ base: 'full', sm: '2xl', md: '6xl' }} 
        scrollBehavior="inside"
      >
        <ModalOverlay bg="blackAlpha.800" zIndex={1400} />
        <ModalContent
          bg="#1a1a1a"
          color="gray.100"
          maxH="90vh"
          zIndex={1400}
        >
          <ModalHeader borderBottom="1px solid #2d2d2d">
            <Text fontSize="2xl" fontWeight="bold">{episode.title}</Text>
          </ModalHeader>
          <ModalCloseButton />

          <ModalBody p={6} ref={containerRef}>
            <VStack align="stretch" spacing={6}>
              {/* Descrição */}
              {episode.overview && (
                <Box>
                  <Text fontSize="lg" fontWeight="bold" mb={2}>Descrição</Text>
                  <Text fontSize="sm" color="gray.300" lineHeight="tall">
                    {episode.overview}
                  </Text>
                </Box>
              )}

              <Divider borderColor="#2d2d2d" />

              {/* Torrents */}
              <Box overflowX="auto" borderRadius="lg" border="1px solid #2d2d2d"
                css={{
                  contain: 'layout style paint',
                  willChange: 'scroll-position'
                }}
              >
                <Table 
                  size="sm" 
                  variant="unstyled"
                  css={{
                    borderCollapse: 'collapse',
                    tableLayout: 'fixed',
                  }}
                >
                  <Thead bg="#2d2d2d" position="sticky" top={0} zIndex={1}>
                    <Tr>
                      <Th color="gray.300" fontSize="xs" fontWeight="bold">Nome</Th>
                      <Th color="gray.300" fontSize="xs" fontWeight="bold" isNumeric>Tamanho</Th>
                      <Th color="gray.300" fontSize="xs" fontWeight="bold" isNumeric>
                        <HStack spacing={1} justify="flex-end">
                          <FaSeedling size={14} />
                          <Text>Seeds</Text>
                        </HStack>
                      </Th>
                      <Th color="gray.300" fontSize="xs" fontWeight="bold" isNumeric>
                        <HStack spacing={1} justify="flex-end">
                          <FaArrowDown size={14} />
                          <Text>Leechers</Text>
                        </HStack>
                      </Th>
                      <Th color="gray.300" fontSize="xs" fontWeight="bold" isNumeric>Completados</Th>
                      <Th color="gray.300" fontSize="xs" fontWeight="bold" textAlign="center">Saúde</Th>
                      <Th color="gray.300" fontSize="xs" fontWeight="bold" textAlign="center">Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody css={{ contain: 'layout paint' }}>
                    {MOCK_TORRENTS.map((torrent) => (
                      <TorrentRow
                        key={torrent.id}
                        torrent={torrent}
                        getHealthColor={getHealthColor}
                        formatNumber={formatNumber}
                        handleDownload={handleDownload}
                        handleMagnet={handleMagnet}
                        shouldReduceMotion={shouldReduceMotion}
                      />
                    ))}
                  </Tbody>
                </Table>
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
};

export default React.memo(EpisodeDetailModal, (prev, next) => {
  return prev.isOpen === next.isOpen && 
         prev.episode?.id === next.episode?.id && 
         prev.onClose === next.onClose;
});

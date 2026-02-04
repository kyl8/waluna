import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Button,
  Spinner,
  Alert,
  AlertIcon,
  AlertDescription,
  IconButton,
  Tooltip
} from '@chakra-ui/react';
import { 
  FaDownload, 
  FaMagnet, 
  FaSeedling, 
  FaArrowDown, 
  FaPlay 
} from 'react-icons/fa';
import GenericEpisodeDetailModal from './GenericEpisodeDetailModal';
import { dataCache } from '../../../utils/cache/memoryCache.js';
const GenericAnimeDetailModal= ({ 
  isOpen,
  onClose, 
  anime,
  fetchEpisodes,
  fetchEpisodeOptions,
  renderEpisodeOption,
  renderEpisodeActions,
  sourceInfo = { name: 'Desconhecido', color: 'gray' },
  onPlayTorrent,
  onCloseAllModals
}) => {
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const loadEpisodes = async () => {
      if (!isOpen || !anime) return;
      
      if (anime.episodes && Array.isArray(anime.episodes) && anime.episodes.length > 0) {
        setEpisodes(anime.episodes);
        return;
      }

      const cacheKey = `generic_episodes_${anime.id || anime.anilist_id}`;
      const cached = dataCache.get(cacheKey);
      if (cached) {
        setEpisodes(cached);
        return;
      }

      if (!fetchEpisodes) {
        setError('Função de busca de episódios não disponível para esta source');
        setEpisodes([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await fetchEpisodes(anime);
        const episodeList = Array.isArray(result) ? result : [];
        dataCache.set(cacheKey, episodeList);
        setEpisodes(episodeList);
        setRetryCount(0);
      } catch (err) {
        setError(err.message || 'Erro desconhecido ao carregar episódios');
        setEpisodes([]);
      } finally {
        setLoading(false);
      }
    };

    loadEpisodes();
  }, [isOpen, anime, fetchEpisodes, retryCount]);

  const sortedEpisodes = useMemo(() => {
    if (!episodes.length) return [];
    const sorted = [...episodes];
    sorted.sort((a, b) => {
      const numA = a.number ?? a.episode ?? 0;
      const numB = b.number ?? b.episode ?? 0;
      return sortOrder === 'asc' ? numA - numB : numB - numA;
    });
    return sorted;
  }, [episodes, sortOrder]);

  const toggleSort = useCallback(() => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  }, []);

  const normalizedAnime = useMemo(() => {
    if (!anime) return {};
    
    return {
      title: anime.title || anime.name || anime.title_english || 'Título não disponível',
      image: anime.image || anime.cover_image || anime.poster || anime.images?.jpg?.large_image_url || '',
      synopsis: anime.synopsis || anime.description || anime.overview || 'Sinopse não disponível',
      type: anime.type || anime.format || 'Desconhecido',
      episodes_count: anime.episodes_count || anime.total_episodes || episodes.length || null,
      score: anime.score || anime.rating || anime.average_score || null,
      year: anime.year || anime.season_year || null,
      status: anime.status || anime.airing_status || null,
      genres: anime.genres || []
    };
  }, [anime, episodes.length]);

  if (!anime) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.800" zIndex={1400} />
      <ModalContent
        bg="#1a1a1a"
        color="gray.100"
        maxH="90vh"
        zIndex={1400}
      >
        <ModalHeader borderBottom="1px solid #2d2d2d">
          <HStack justify="space-between">
            <Text fontSize="2xl" fontWeight="bold" noOfLines={1}>
              {normalizedAnime.title}
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />
        
        <ModalBody p={6}>
          <Grid templateColumns={{ base: '1fr', lg: '300px 1fr' }} gap={6}>
            {/* Coluna Esquerda - Poster e Info */}
            <Box>
              <VStack align="stretch" spacing={4}>
                <Image
                  src={normalizedAnime.image}
                  alt={normalizedAnime.title}
                  borderRadius="xl"
                  w="100%"
                  fallbackSrc="https://via.placeholder.com/300x400?text=Sem+Imagem"
                  loading="lazy"
                />
                
                <VStack align="stretch" spacing={2}>
                  <HStack flexWrap="wrap">
                    <Badge colorScheme="purple" fontSize="sm">
                      {normalizedAnime.type}
                    </Badge>
                    {normalizedAnime.episodes_count && (
                      <Badge colorScheme="blue" fontSize="sm">
                        {normalizedAnime.episodes_count} EP
                      </Badge>
                    )}
                  </HStack>
                  
                  {normalizedAnime.score && (
                    <HStack>
                      <Text fontSize="sm" color="gray.400">Score:</Text>
                      <Text fontSize="lg" color="yellow.400" fontWeight="bold">
                        ★ {normalizedAnime.score}
                      </Text>
                    </HStack>
                  )}
                  
                  {normalizedAnime.year && (
                    <HStack>
                      <Text fontSize="sm" color="gray.400">Ano:</Text>
                      <Text fontSize="md" fontWeight="semibold">
                        {normalizedAnime.year}
                      </Text>
                    </HStack>
                  )}
                  
                  {normalizedAnime.status && (
                    <HStack>
                      <Text fontSize="sm" color="gray.400">Status:</Text>
                      <Text fontSize="md">{normalizedAnime.status}</Text>
                    </HStack>
                  )}

                  {normalizedAnime.genres && normalizedAnime.genres.length > 0 && (
                    <Box>
                      <Text fontSize="sm" color="gray.400" mb={2}>Gêneros:</Text>
                      <HStack flexWrap="wrap" spacing={2}>
                        {normalizedAnime.genres.slice(0, 6).map((genre, idx) => (
                          <Badge key={idx} colorScheme="gray" fontSize="xs">
                            {genre.name || genre}
                          </Badge>
                        ))}
                      </HStack>
              </Box>
            )}
                </VStack>
              </VStack>
            </Box>

            {/* Coluna Direita - Sinopse e Episódios */}
              <Box>
              <VStack align="stretch" spacing={6}>
                {/* Sinopse */}
                <Box>
                  <Text fontSize="xl" fontWeight="bold" mb={3}>Sinopse</Text>
                  <Text fontSize="sm" color="gray.300" lineHeight="tall">
                    {normalizedAnime.synopsis}
                </Text>
              </Box>

                {/* Lista de Episódios Expansíveis */}
                <Box>
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
                        onClick={toggleSort}
                        isDisabled={loading}
                      >
                        {sortOrder === 'asc' ? '↑ Crescente' : '↓ Decrescente'}
                      </Button>
                    </HStack>
                  </HStack>

                  {loading ? (
                    <Box textAlign="center" py={8}>
                      <Spinner size="xl" color="purple.500" />
                      <Text mt={4} color="gray.400">Carregando episódios...</Text>
                    </Box>
                  ) : error ? (
                    <VStack spacing={3} p={4} bg="#2d2d2d" borderRadius="lg">
                      <Alert status="error" variant="subtle" borderRadius="lg">
                        <AlertIcon />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                      <Button 
                        size="sm"
                        colorScheme="purple"
                        onClick={() => setRetryCount(prev => prev + 1)}
                        isLoading={loading}
                      >
                        Tentar novamente
                      </Button>
                    </VStack>
                  ) : sortedEpisodes.length === 0 ? (
                    <Box
                      p={8}
                      bg="#2d2d2d"
                      borderRadius="lg"
                      textAlign="center"
                    >
                      <Text color="gray.400">
                        Nenhum episódio disponível
                      </Text>
                    </Box>
                  ) : (
                    <VStack spacing={3} maxH="600px" overflowY="auto">
                      {sortedEpisodes.map((ep, index) => (
                        <GenericEpisodeDetailModal
                          key={ep.id || ep.uid || index}
                          episode={ep}
                          fetchOptions={fetchEpisodeOptions}
                          renderOption={renderEpisodeOption}
                          renderEpisodeActions={renderEpisodeActions} 
                          sourceInfo={sourceInfo}
                        />
                      ))}
                    </VStack>
              )}
            </Box>
          </VStack>
            </Box>
          </Grid>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default GenericAnimeDetailModal;
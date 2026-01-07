import React, { useState, useMemo } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  Badge,
  Image,
  Collapse,
  useDisclosure,
  IconButton,
  Spinner,
  usePrefersReducedMotion
} from '@chakra-ui/react';
import { FaChevronDown, FaChevronUp } from 'react-icons/fa';


const EpisodeWithExpandableOptions = ({ 
  episode, 
  fetchOptions,
  renderOption,
    renderEpisodeActions, 
  sourceInfo = { name: 'Desconhecido', color: 'gray' }
}) => {
  const { isOpen, onToggle } = useDisclosure();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const shouldReduceMotion = usePrefersReducedMotion();

  const normalizedEp = useMemo(() => {
    if (!episode) return {};
    
    return {
      number: episode.number ?? episode.episode ?? episode.episode_number ?? '?',
      title: episode.episode_name || episode.title || episode.name || 'Sem título',
      description: episode.description || episode.overview || episode.synopsis || 'Sem descrição',
      image: episode.image || episode.thumbnail || episode.episode_thumbnail || episode.still || null,
      airDate: episode.airDate || episode.air_date || episode.date || null,
      duration: episode.duration || episode.runtime || null,
      absoluteNumber: episode.absoluteNumber || episode.absolute_episode || null,
      isAired: episode.isAired ?? episode.aired ?? true
    };
  }, [episode]);

  const formattedDate = useMemo(() => {
    if (!normalizedEp.airDate) return null;
    try {
      return new Date(normalizedEp.airDate).toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      });
    } catch {
      return null;
    }
  }, [normalizedEp.airDate]);

  const episodeLabel = useMemo(
    () => Number.isFinite(normalizedEp.number) ? `EP ${normalizedEp.number}` : 'EP N/A',
    [normalizedEp.number]
  );

  const handleToggle = async () => {
    onToggle();
    
    if (loaded || loading || !fetchOptions) return;
    setLoading(true);
    try {
      const result = await fetchOptions(episode);
      setOptions(Array.isArray(result) ? result : []);
      setLoaded(true);
    } catch (err) {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box w="100%">
      {/* Card do Episódio - Clicável */}
      <Box
        p={3}
        bg="#2d2d2d"
        borderRadius="md"
        _hover={{ bg: '#353535', cursor: 'pointer' }}
        onClick={handleToggle}
        opacity={normalizedEp.isAired ? 1 : 0.6}
        transition={!shouldReduceMotion ? 'background-color 150ms' : 'none'}
      >
        <HStack align="start" spacing={3}>
          {/* Thumbnail */}
          {normalizedEp.image ? (
            <Image
              src={normalizedEp.image}
              alt={episodeLabel}
              w="80px"
              h="50px"
              borderRadius="sm"
              objectFit="cover"
              flexShrink={0}
              loading="lazy"
            />
          ) : (
            <Box
              w="80px"
              h="50px"
              bg="#1a1a1a"
              borderRadius="sm"
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <Text fontSize="xs" color="gray.600">
                {normalizedEp.number}
              </Text>
            </Box>
          )}

          {/* Info do Episódio */}
          <VStack align="start" spacing={1} flex={1} minW={0}>
            <HStack spacing={3} flexWrap="wrap">
              <Badge colorScheme="purple" fontSize="sm">
                {episodeLabel}
              </Badge>
              {normalizedEp.absoluteNumber && normalizedEp.absoluteNumber !== normalizedEp.number && (
                <Badge colorScheme="gray" fontSize="xs">
                  #{normalizedEp.absoluteNumber}
                </Badge>
              )}
              {!normalizedEp.isAired && (
                <Badge colorScheme="orange" fontSize="xs">EM BREVE</Badge>
              )}
              <Badge colorScheme={sourceInfo.color} fontSize="xs">
                {sourceInfo.name}
              </Badge>
            </HStack>
            
            <Text fontWeight="600" fontSize="sm" noOfLines={1}>
              {normalizedEp.title}
            </Text>
            
            <Text fontSize="xs" color="gray.400" noOfLines={2}>
              {normalizedEp.description}
            </Text>

            <HStack spacing={3} fontSize="xs" color="gray.500">
              {formattedDate && <Text>{formattedDate}</Text>}
              {normalizedEp.duration && <Text>{normalizedEp.duration}min</Text>}
            </HStack>
          </VStack>

          {renderEpisodeActions && (
            <Box onClick={(e) => e.stopPropagation()}>
              {renderEpisodeActions(episode)}
            </Box>
          )}

          {/* Ícone de Expandir */}
          <IconButton
            icon={isOpen ? <FaChevronUp /> : <FaChevronDown />}
            size="sm"
            variant="ghost"
            colorScheme="gray"
            aria-label="Expandir opções"
            flexShrink={0}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
          />
        </HStack>
      </Box>

      {/* Área Expansível com as Opções */}
      <Collapse in={isOpen} animateOpacity>
        <Box
          mt={2}
          p={4}
          bg="#1a1a1a"
          borderRadius="md"
          borderLeft="3px solid"
          borderColor="purple.500"
        >
          {loading ? (
            <HStack justify="center" py={4}>
              <Spinner size="sm" color="purple.500" />
              <Text fontSize="sm" color="gray.400">
                Carregando opções...
              </Text>
            </HStack>
          ) : options.length === 0 ? (
            <Text fontSize="sm" color="gray.400" textAlign="center">
              Nenhuma opção disponível
            </Text>
          ) : (
            <VStack spacing={2} align="stretch">
              {options.map((option, index) => (
                <OptionRow
                  key={option.id || index}
                  option={option}
                  renderOption={renderOption}
                  shouldReduceMotion={shouldReduceMotion}
                />
              ))}
            </VStack>
          )}
        </Box>
      </Collapse>
    </Box>
  );
};

const OptionRow = ({ option, renderOption, shouldReduceMotion }) => {
  if (renderOption) {
    return (
      <Box
        p={3}
        bg="#2d2d2d"
        borderRadius="md"
        _hover={!shouldReduceMotion ? { bg: '#353535' } : undefined}
        transition={!shouldReduceMotion ? 'background-color 150ms' : 'none'}
      >
        {renderOption(option)}
      </Box>
    );
  }

  // Renderização padrão
  const normalizedOption = {
    title: option.title || option.name || option.label || 'Opção sem nome',
    quality: option.quality || option.resolution || null,
    size: option.size || option.filesize || null,
    type: option.type || option.format || 'unknown',
    metadata: option.metadata || {}
  };

  return (
    <Box
      p={3}
      bg="#2d2d2d"
      borderRadius="md"
      _hover={!shouldReduceMotion ? { bg: '#353535' } : undefined}
      transition={!shouldReduceMotion ? 'background-color 150ms' : 'none'}
    >
      <HStack justify="space-between" align="center">
        <VStack align="start" spacing={1} flex={1} minW={0}>
          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
            {normalizedOption.title}
          </Text>
          <HStack spacing={2} flexWrap="wrap">
            {normalizedOption.quality && (
              <Badge colorScheme="purple" fontSize="xs">
                {normalizedOption.quality}
              </Badge>
            )}
            {normalizedOption.type && (
              <Badge colorScheme="blue" fontSize="xs">
                {normalizedOption.type}
              </Badge>
            )}
            {normalizedOption.size && (
              <Badge colorScheme="gray" fontSize="xs">
                {normalizedOption.size}
              </Badge>
            )}
            {Object.entries(normalizedOption.metadata).map(([key, value]) => (
              <Badge key={key} colorScheme="gray" fontSize="xs">
                {key}: {value}
              </Badge>
            ))}
          </HStack>
        </VStack>
      </HStack>
    </Box>
  );
};

export default EpisodeWithExpandableOptions;
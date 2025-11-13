import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Image,
  Progress,
} from '@chakra-ui/react';

const AnimeCard = React.memo(({ anime, isWatching = false, isCompleted = false, size = "medium" }) => {
  const progress = isWatching && anime.watched ? (anime.watched / anime.episodes) * 100 : isCompleted ? 100 : 0;
  
  const sizes = {
    small: { minW: "100px", coverH: "100px", fontSize: "xs", p: 2 },
    medium: { minW: "160px", coverH: "180px", fontSize: "sm", p: 3 }
  };
  
  const sizeConfig = sizes[size];
  
  return (
    <Box
      bg="#2a2a2a"
      borderRadius="md"
      overflow="hidden"
      border="1px solid #3d3d3d"
      transition="all 0.2s"
      _hover={{ borderColor: '#5d5d5d' }}
      css={{ contain: 'layout paint' }}
      minW={sizeConfig.minW}
    >
      {/* Cover Image */}
      <Box position="relative" h={sizeConfig.coverH} bg="#1a1a1a" overflow="hidden">
        <Image
          src={anime.cover}
          alt={anime.title}
          w="100%"
          h="100%"
          objectFit="cover"
          fallback={<Box w="100%" h="100%" bg="purple.900" />}
        />
      </Box>

      {/* Info */}
      <VStack spacing={2} p={sizeConfig.p} align="stretch">
        <Text fontSize={sizeConfig.fontSize} fontWeight="bold" color="gray.100" noOfLines={2}>
          {anime.title}
        </Text>

        {/* Score ou Episode Info */}
        {anime.score && (
          <HStack justify="space-between" fontSize="10px">
            <Text color="gray.500">Score</Text>
            <Text color="purple.400" fontWeight="bold">{anime.score}/10</Text>
          </HStack>
        )}

        {/* Progress Bar */}
        {(isWatching || isCompleted) && (
          <VStack spacing={1} align="stretch">
            {isWatching && (
              <HStack justify="space-between" fontSize="9px">
                <Text color="gray.500">Progresso</Text>
                <Text color="gray.400">{anime.watched}/{anime.episodes}</Text>
              </HStack>
            )}
            <Progress 
              value={progress} 
              size="sm" 
              colorScheme="purple" 
              borderRadius="full"
              bg="#1a1a1a"
            />
          </VStack>
        )}

        {/* Episodes */}
        {!isWatching && !isCompleted && anime.episodes && (
          <Text fontSize="9px" color="gray.500">
            {anime.episodes} episódios
          </Text>
        )}
      </VStack>
    </Box>
  );
});

AnimeCard.displayName = 'AnimeCard';

export default AnimeCard;

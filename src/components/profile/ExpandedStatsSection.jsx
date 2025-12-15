import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Icon,
  Heading,
  Progress,
} from '@chakra-ui/react';
import { IoFlameSharp, IoTrendingUpSharp, IoCalendarSharp } from 'react-icons/io5';

const ExpandedStatsSection = React.memo(({ stats }) => (
  <VStack spacing={1.5} align="stretch" w="100%">
    <Heading size="xs" color="gray.100">📊 Stats Expandidas</Heading>
    
    <HStack spacing={2} w="100%">
      <Box flex={1} bg="#1a1a1a" p={2} borderRadius="sm" border="1px solid #3d3d3d" css={{ contain: 'layout paint' }}>
        <Text fontSize="10px" color="gray.500">Minutos</Text>
        <Text fontSize="sm" fontWeight="bold" color="gray.100">{Math.floor(stats.totalMinutesWatched / 60)}h</Text>
      </Box>
      <Box flex={1} bg="#1a1a1a" p={2} borderRadius="sm" border="1px solid #3d3d3d" css={{ contain: 'layout paint' }}>
        <Text fontSize="10px" color="gray.500">Episódios</Text>
        <Text fontSize="sm" fontWeight="bold" color="gray.100">{stats.totalEpisodes}</Text>
      </Box>
      <Box flex={1} bg="#1a1a1a" p={2} borderRadius="sm" border="1px solid #3d3d3d" css={{ contain: 'layout paint' }}>
        <HStack spacing={0.5} mb={0.5}>
          <Icon as={IoFlameSharp} fontSize="sm" color="orange.400" />
          <Text fontSize="10px" color="gray.500">Streak</Text>
        </HStack>
        <Text fontSize="sm" fontWeight="bold" color="orange.300">{stats.streakDays}d</Text>
      </Box>
      <Box flex={1} bg="#1a1a1a" p={2} borderRadius="sm" border="1px solid #3d3d3d" css={{ contain: 'layout paint' }}>
        <HStack spacing={0.5} mb={0.5}>
          <Icon as={IoTrendingUpSharp} fontSize="sm" color="purple.400" />
          <Text fontSize="10px" color="gray.500">Score</Text>
        </HStack>
        <Text fontSize="sm" fontWeight="bold" color="purple.300">{stats.averageScore}/10</Text>
      </Box>
    </HStack>

    <Box bg="#1a1a1a" p={1.5} borderRadius="sm" border="1px solid #3d3d3d" w="100%">
      <HStack spacing={1} justify="space-between">
        <HStack spacing={0.5}>
          <Icon as={IoCalendarSharp} fontSize="sm" color="blue.400" />
          <Text fontSize="10px" color="gray.500">Por Semana</Text>
        </HStack>
        <Text fontSize="sm" fontWeight="bold" color="blue.300">{stats.averageEpisodesPerWeek} ep/sem</Text>
      </HStack>
    </Box>

    <VStack align="stretch" spacing={1} w="100%" bg="#1a1a1a" p={1.5} borderRadius="sm" border="1px solid #3d3d3d">
      <Text fontSize="10px" color="gray.500">Gêneros Favoritos</Text>
      {stats.favoriteGenres.slice(0, 3).map((genre) => (
        <Box key={genre.name}>
          <HStack justify="space-between" mb={0.5}>
            <Text fontSize="10px" color="gray.300">{genre.name}</Text>
            <Text fontSize="9px" color="gray.500">{genre.percentage}%</Text>
          </HStack>
          <Box h="3px" bg="#2a2a2a" borderRadius="full" overflow="hidden">
            <Box h="100%" w={`${genre.percentage}%`} bg="purple.500" borderRadius="full" />
          </Box>
        </Box>
      ))}
    </VStack>
  </VStack>
));

ExpandedStatsSection.displayName = 'ExpandedStatsSection';

export default ExpandedStatsSection;

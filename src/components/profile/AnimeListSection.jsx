import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Heading,
} from '@chakra-ui/react';
import AnimeCard from './AnimeCard';

const AnimeListSection = React.memo(({ title, emoji, items, isWatching = false, isCompleted = false }) => (
  <Box w="100%">
    <Heading size="sm" mb={3} color="gray.100" display="flex" alignItems="center" gap={2}>
      <span>{emoji}</span>
      {title}
    </Heading>
    <HStack 
      spacing={3} 
      overflowX="auto" 
      pb={2}
      align="flex-start"
      css={{
        '&::-webkit-scrollbar': {
          height: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: '#1a1a1a',
          borderRadius: '3px',
        },
        '&::-webkit-scrollbar-thumb': {
          background: '#3d3d3d',
          borderRadius: '3px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: '#4d4d4d',
        },
        contain: 'layout paint',
      }}
    >
      {items.map((anime) => (
        <AnimeCard 
          key={anime.id} 
          anime={anime} 
          isWatching={isWatching}
          isCompleted={isCompleted}
        />
      ))}
    </HStack>
  </Box>
));

AnimeListSection.displayName = 'AnimeListSection';

export default AnimeListSection;

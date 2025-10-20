import React, { useMemo, useEffect, useState } from 'react';
import { Box, Image, Text, VStack, HStack, Flex } from '@chakra-ui/react';
import { getOptimalDuration, subscribeFrameRate, unsubscribeFrameRate } from '../utils/helpers/animation.js';

const SearchResultItem = ({ item, onClick }) => {
  const titleData = useMemo(() => {
    if (item.titles) {
      return item.titles.find(t => t.type === 'Default')?.title || item.title;
    }
    return item.title || 'Título não disponível';
  }, [item.titles, item.title]);

  const imageUrl = useMemo(() => {
    return item.images?.jpg?.image_url || item.images?.jpg?.large_image_url || '';
  }, [item.images]);

  const isMovie = useMemo(() => item.type === 'Movie', [item.type]);
  const isSeries = useMemo(() => ['TV', 'OVA', 'ONA', 'Special'].includes(item.type), [item.type]);

  const episodeInfo = useMemo(() => {
    if (isMovie) return null;
    if (isSeries && item.episodes) {
      const episodeText = `📺 ${item.episodes} ${item.episodes === 1 ? 'EP' : 'EPs'}`;
      return item.year ? `${episodeText} • ${item.year}` : episodeText;
    }
    return null;
  }, [isMovie, isSeries, item.episodes, item.year]);

  const handleClick = React.useCallback(() => onClick && onClick(item), [item, onClick]);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    const cb = () => setTick(t => t + 1);
    const unsub = subscribeFrameRate(cb);
    return () => {
      try { unsub(); } catch (e) { unsubscribeFrameRate(cb); }
    };
  }, []);

  // transição otimizada para refresh rate (recalcula quando tick muda)
  const transitionDuration = getOptimalDuration(100);

  return (
    <Flex
      p={4}
      border="1px solid #2d2d2d"
      borderRadius="xl"
      width="100%"
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'center', md: 'flex-start' }}
      textAlign={{ base: 'center', md: 'left' }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      cursor="pointer"
      _hover={{
        bg: 'rgba(159, 122, 234, 0.1)',
        borderLeftColor: '#6B46C1'
      }}
      borderLeft="1px solid transparent"
      transition={`background-color ${transitionDuration}ms ease-out, border-color ${transitionDuration}ms ease-out`}
      css={{
        contain: 'layout paint',
        willChange: 'background-color'
      }}
    >
      <Image
        boxSize={{ base: '120px', md: '100px' }}
        objectFit="cover"
        src={imageUrl}
        alt={titleData}
        borderRadius="md"
        mb={{ base: 4, md: 0 }}
        mr={{ base: 0, md: 4 }}
        fallbackSrc="https://via.placeholder.com/100x140?text=No+Image"
        loading="lazy"
      />
      <VStack align="stretch" spacing={1} flex={1}>
        <Text fontWeight="bold" fontSize="lg" noOfLines={1} color="white">{titleData}</Text>
        <HStack spacing={3} flexWrap="wrap">
          <Text fontSize="sm" color="gray.400" fontWeight="semibold">{item.type || 'Anime'}</Text>
          <Text fontSize="sm" color="yellow.400">★ {item.score || 'N/A'}</Text>
          {episodeInfo && (
            <Text fontSize="sm" color="purple.400">
              {episodeInfo}
            </Text>
          )}
        </HStack>
        <Text fontSize="sm" noOfLines={3} color="gray.300">
          {item.synopsis || 'Sem sinopse disponível.'}
        </Text>
      </VStack>
    </Flex>
  );
};

export default React.memo(SearchResultItem, (prev, next) => {
  return prev.item === next.item && prev.onClick === next.onClick;
});
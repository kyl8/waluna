import React from 'react';
import { Box, Skeleton, SkeletonText, VStack, HStack, usePrefersReducedMotion } from '@chakra-ui/react';

export const SearchResultSkeleton = ({ count = 3 }) => {
  const shouldReduceMotion = usePrefersReducedMotion();

  return (
    <VStack spacing={4} align="stretch" w="100%">
      {Array.from({ length: count }).map((_, i) => (
        <HStack
          key={i}
          p={4}
          border="1px solid #2d2d2d"
          borderRadius="xl"
          spacing={4}
          align="flex-start"
        >
          <Skeleton
            w="100px"
            h="140px"
            borderRadius="md"
            isLoaded={false}
            speed={shouldReduceMotion ? 0 : 0.8}
            startColor="#1a1a1a"
            endColor="#252525"
            flexShrink={0}
          />

          <VStack align="stretch" spacing={2} flex={1} minW={0}>
            <Skeleton h="24px" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
            <Skeleton h="16px" w="60%" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
            <VStack spacing={1} align="stretch">
              <Skeleton h="14px" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
              <Skeleton h="14px" w="80%" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
              <Skeleton h="14px" w="70%" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
            </VStack>
          </VStack>
        </HStack>
      ))}
    </VStack>
  );
};

export const EpisodeRowSkeleton = ({ count = 5 }) => {
  const shouldReduceMotion = usePrefersReducedMotion();

  return (
    <VStack spacing={2} align="stretch" w="100%">
      {Array.from({ length: count }).map((_, i) => (
        <HStack
          key={i}
          p={2}
          bg="#2d2d2d"
          borderRadius="md"
          spacing={2}
          align="center"
        >
          <Skeleton
            w="60px"
            h="38px"
            borderRadius="sm"
            isLoaded={false}
            speed={shouldReduceMotion ? 0 : 0.8}
            startColor="#1a1a1a"
            endColor="#252525"
            flexShrink={0}
          />

          <VStack align="stretch" spacing={1} flex={1} minW={0}>
            <Skeleton h="16px" w="40%" borderRadius="sm" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
            <Skeleton h="12px" w="60%" borderRadius="sm" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
          </VStack>

          <Skeleton
            w="80px"
            h="14px"
            borderRadius="sm"
            isLoaded={false}
            speed={shouldReduceMotion ? 0 : 0.8}
            startColor="#1a1a1a"
            endColor="#252525"
            flexShrink={0}
          />
        </HStack>
      ))}
    </VStack>
  );
};

export const AnimeDetailSkeleton = () => {
  const shouldReduceMotion = usePrefersReducedMotion();

  return (
    <Box w="100%">
      <VStack align="stretch" spacing={6}>
        {/* banner + info */}
        <HStack align="flex-start" spacing={6}>
          {/* banner */}
          <Skeleton
            w="300px"
            h="400px"
            borderRadius="xl"
            isLoaded={false}
            speed={shouldReduceMotion ? 0 : 0.8}
            startColor="#1a1a1a"
            endColor="#252525"
            flexShrink={0}
          />

          {/* info */}
          <VStack align="stretch" spacing={4} flex={1}>
            <Skeleton h="32px" w="80%" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
            <VStack spacing={2} align="stretch">
              <Skeleton h="20px" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
              <Skeleton h="20px" w="60%" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
              <Skeleton h="20px" w="70%" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
            </VStack>
          </VStack>
        </HStack>

        {/* sinopse */}
        <VStack align="stretch" spacing={2}>
          <Skeleton h="24px" w="120px" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
          <Skeleton h="16px" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
          <Skeleton h="16px" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
          <Skeleton h="16px" w="80%" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
        </VStack>

        {/* episódios */}
        <VStack align="stretch" spacing={3}>
          <Skeleton h="24px" w="120px" borderRadius="md" isLoaded={false} speed={shouldReduceMotion ? 0 : 0.8} startColor="#1a1a1a" endColor="#252525" />
          <EpisodeRowSkeleton count={3} />
        </VStack>
      </VStack>
    </Box>
  );
};

export default {
  SearchResultSkeleton,
  EpisodeRowSkeleton,
  AnimeDetailSkeleton,
};

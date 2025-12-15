import React, { useState, useCallback } from 'react';
import {
  HStack,
  VStack,
  Box,
  Tag,
  TagLabel,
  TagCloseButton,
  Input,
  Button,
  Icon,
  Text,
} from '@chakra-ui/react';
import { IoAdd } from 'react-icons/io5';
import logger from '../../utils/helpers/logger.js';

const AnimeTags = React.memo(({ animeId, initialTags = [] }) => {
  const [tags, setTags] = useState(initialTags);
  const [newTag, setNewTag] = useState('');

  const handleAddTag = useCallback(() => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
      logger.info(`Tag adicionada ao anime ${animeId}:`, newTag);
    }
  }, [newTag, tags, animeId]);

  const handleRemoveTag = useCallback((tagToRemove) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
    logger.info(`Tag removida do anime ${animeId}:`, tagToRemove);
  }, [tags, animeId]);

  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      handleAddTag();
    }
  }, [handleAddTag]);

  return (
    <Box bg="#1a1a1a" border="1px solid #3d3d3d" borderRadius="md" p={3}>
      <Text fontSize="sm" fontWeight="bold" color="gray.100" mb={2}>
        🏷️ Tags Personalizadas
      </Text>

      <VStack spacing={2} align="stretch">
        <HStack spacing={2}>
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Adicione uma tag..."
            size="sm"
            bg="#2a2a2a"
            border="1px solid #3d3d3d"
            color="gray.100"
            fontSize="xs"
          />
          <Button
            size="sm"
            leftIcon={<Icon as={IoAdd} />}
            colorScheme="purple"
            onClick={handleAddTag}
          >
            Add
          </Button>
        </HStack>

        {tags.length > 0 ? (
          <HStack spacing={1} flexWrap="wrap">
            {tags.map((tag) => (
              <Tag key={tag} size="sm" borderRadius="full" colorScheme="purple">
                <TagLabel fontSize="xs">{tag}</TagLabel>
                <TagCloseButton onClick={() => handleRemoveTag(tag)} />
              </Tag>
            ))}
          </HStack>
        ) : (
          <Text fontSize="xs" color="gray.500">
            Nenhuma tag ainda
          </Text>
        )}
      </VStack>
    </Box>
  );
});

AnimeTags.displayName = 'AnimeTags';

export default AnimeTags;

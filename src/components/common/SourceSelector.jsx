import React, { useCallback } from 'react';
import { HStack, Button, Badge, Tooltip, Menu, MenuButton, MenuList, MenuItem, Text, VStack, Icon } from '@chakra-ui/react';
import { SOURCES_LIST, getSourceIcon } from '../../utils/sources/sourcesConfig.js';
import logger from '../../utils/helpers/logger.js';

const SourceSelector = ({ sourceId, onSourceChange }) => {
  const handleSelectSource = useCallback((newSourceId) => {
    onSourceChange?.(newSourceId);
    try {
      localStorage.setItem('episodeSource', newSourceId);
    } catch (e) {
      logger.warn('Não foi possivel salvar a source no localStorage:', e);
    }
  }, [onSourceChange]);

  const currentSource = SOURCES_LIST.find(s => s.id === sourceId);
  const IconComponent = getSourceIcon(sourceId);

  return (
    <Menu>
      <Tooltip label="Clique para trocar a source de animes" placement="bottom">
        <MenuButton
          as={Button}
          variant="solid"
          size="sm"
          colorScheme={currentSource?.color || 'purple'}
          bg={`${currentSource?.color || 'purple'}.600`}
          _hover={{ bg: `${currentSource?.color || 'purple'}.700` }}
          color="white"
          fontWeight="bold"
          leftIcon={<Icon as={IconComponent} boxSize={5} />}
        >
          {currentSource?.name || 'Fonte'}
        </MenuButton>
      </Tooltip>

      <MenuList bg="#2d2d2d" borderColor="rgba(200,200,200,0.3)" px={0}>
        {SOURCES_LIST.map(source => {
          const SourceIcon = getSourceIcon(source.id);
          return (
            <MenuItem
              key={source.id}
              onClick={() => handleSelectSource(source.id)}
              bg={sourceId === source.id ? 'rgba(159, 122, 234, 0.3)' : 'transparent'}
              _hover={{ bg: 'rgba(159, 122, 234, 0.15)' }}
              px={4}
              py={3}
            >
              <HStack spacing={3} w="100%">
                <Icon as={SourceIcon} boxSize={6} color={source.color + '.400'} />
                <VStack align="start" spacing={0} flex={1}>
                  <Text fontWeight="bold" color="white">{source.name}</Text>
                  <Text fontSize="xs" color="gray.400">{source.description}</Text>
                </VStack>
                {sourceId === source.id && (
                  <Badge ml="auto" colorScheme="purple" variant="solid" fontSize="lg">
                    ✓
                  </Badge>
                )}
              </HStack>
            </MenuItem>
          );
        })}
      </MenuList>
    </Menu>
  );
};

export default SourceSelector;

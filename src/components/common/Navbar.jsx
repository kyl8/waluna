import React, { useCallback } from 'react';
import { Flex, Avatar, Text, Button, Spacer, Box, HStack } from '@chakra-ui/react';
import { IoSettingsSharp } from 'react-icons/io5';
import useSourceAPI from '../../hooks/useSourceAPI.js';
import SourceSelector from './SourceSelector.jsx';

const Navbar = ({ userName, userPhotoUrl, onSettingsClick }) => {
  const { sourceId, setSourceId } = useSourceAPI();

  const handleSettingsClick = useCallback(() => {
    onSettingsClick?.();
  }, [onSettingsClick]);

  return (
    <Flex
      as="nav"
      align="center"
      padding="1rem 2rem"
      bg="#111111"
      color="gray.200"
      borderBottom="1px solid #2d2d2d"
    >
      <Flex align="center">
        <Avatar size="md" name={userName} src={userPhotoUrl} mr={4} />
        <Text fontSize="lg" fontWeight="bold">
          {userName}
        </Text>
      </Flex>
      <Spacer />
      <HStack spacing={4}>
        <SourceSelector sourceId={sourceId} onSourceChange={setSourceId} />
          
        <Button
          leftIcon={<IoSettingsSharp />}
          variant="ghost"
          color="gray.300"
          _hover={{ bg: 'rgba(255, 255, 255, 0.09)', color: 'purple.400', transform: 'scale(1.03)' }}
          onClick={handleSettingsClick}
        >
          <Box as="span" display={{ base: 'none', sm: 'inline' }}>
            Configurações
          </Box>
        </Button>
      </HStack>
    </Flex>
  );
};

export default React.memo(Navbar, (prevProps, nextProps) => {
  return (
    prevProps.userName === nextProps.userName &&
    prevProps.userPhotoUrl === nextProps.userPhotoUrl &&
    prevProps.onSettingsClick === nextProps.onSettingsClick
  );
});

import React, { useCallback } from 'react';
import { Flex, Avatar, Text, Button, Spacer, Box, HStack } from '@chakra-ui/react';
import { IoSettingsSharp } from 'react-icons/io5';
import { SiUtorrent } from "react-icons/si";
import { FaFolder } from 'react-icons/fa';
import useSourceAPI from '../../hooks/useSourceAPI.js';
import SourceSelector from './SourceSelector.jsx';

const Navbar = ({ userName, userPhotoUrl, onSettingsClick, onTestOpen, onDevClick }) => {
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
        <Button
          leftIcon={<SiUtorrent />}
          variant="ghost"
          color="gray.300"
          _hover={{ bg: 'rgba(255, 255, 255, 0.09)', color: 'purple.400', transform: 'scale(1.03)' }}
          onClick={() => onTestOpen?.()}
        >
          URL
        </Button>

        {onDevClick && (
          <Button
            leftIcon={<FaFolder />}
            variant="ghost"
            color="yellow.300"
            _hover={{ bg: 'rgba(255, 255, 255, 0.06)', color: 'yellow.400', transform: 'scale(1.03)' }}
            onClick={() => onDevClick?.()}
          >
            DEV
          </Button>
        )}
          
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

        <SourceSelector sourceId={sourceId} onSourceChange={setSourceId} />
      </HStack>
    </Flex>
  );
};

export default React.memo(Navbar, (prevProps, nextProps) => {
  return (
    prevProps.userName === nextProps.userName &&
    prevProps.userPhotoUrl === nextProps.userPhotoUrl &&
    prevProps.onSettingsClick === nextProps.onSettingsClick &&
    prevProps.onTestOpen === nextProps.onTestOpen &&
    prevProps.onDevClick === nextProps.onDevClick
  );
});

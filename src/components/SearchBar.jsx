// src/components/SearchBar.jsx
import React from 'react';
import { Input, InputGroup, InputLeftElement, Box } from '@chakra-ui/react';
import { FaSearch } from 'react-icons/fa';

const SearchBar = ({ value, onChange }) => {
  return (
    <Box width={{ base: '90%', md: '100%' }} maxWidth="700px" mx="auto" mt="1rem" mb="2rem">
      <InputGroup size="lg">
        <InputLeftElement pointerEvents="none">
          <FaSearch color="#A0AEC0" />
        </InputLeftElement>
        <Input
          placeholder="Pesquise por animes... (ex: Naruto, One Piece, Attack on Titan)"
          variant="filled"
          bg="#111111"
          color="white"
          borderRadius="full"
          border="1px solid #2d2d2d"
          _hover={{ bg: '#1A1A1A' }}
          _focus={{
            borderColor: 'purple.400',
            boxShadow: '0 0 15px rgba(159, 122, 234, 0.4)',
          }}
          value={value}
          onChange={onChange}
          height="50px"
          autoComplete="off"
        />
      </InputGroup>
    </Box>
  );
};

export default React.memo(SearchBar, (prevProps, nextProps) => {
  return prevProps.value === nextProps.value && prevProps.onChange === nextProps.onChange;
});
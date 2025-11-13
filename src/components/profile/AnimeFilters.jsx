import React, { useState, useCallback } from 'react';
import {
  HStack,
  Select,
  Button,
  Icon,
  Tooltip,
} from '@chakra-ui/react';
import { IoFunnel } from 'react-icons/io5';

const AnimeFilters = React.memo(({ onSortChange, onFilterChange }) => {
  const [sortBy, setSortBy] = useState('title');
  const [filterGenre, setFilterGenre] = useState('all');

  const handleSortChange = useCallback((e) => {
    setSortBy(e.target.value);
    onSortChange(e.target.value);
  }, [onSortChange]);

  const handleFilterChange = useCallback((e) => {
    setFilterGenre(e.target.value);
    onFilterChange(e.target.value);
  }, [onFilterChange]);

  return (
    <HStack spacing={2} mb={3} w="100%">
      <Tooltip label="Ordenar por">
        <Select
          size="sm"
          value={sortBy}
          onChange={handleSortChange}
          bg="#2a2a2a"
          border="1px solid #3d3d3d"
          color="gray.100"
          fontSize="sm"
        >
          <option value="title">Título (A-Z)</option>
          <option value="score">Nota (Alta-Baixa)</option>
          <option value="date">Data Conclusão</option>
          <option value="year">Ano Lançamento</option>
        </Select>
      </Tooltip>

      <Tooltip label="Filtrar por gênero">
        <Select
          size="sm"
          value={filterGenre}
          onChange={handleFilterChange}
          bg="#2a2a2a"
          border="1px solid #3d3d3d"
          color="gray.100"
          fontSize="sm"
        >
          <option value="all">Todos Gêneros</option>
          <option value="action">Ação</option>
          <option value="drama">Drama</option>
          <option value="fantasy">Fantasia</option>
          <option value="comedy">Comédia</option>
        </Select>
      </Tooltip>

      <Tooltip label="Limpar filtros">
        <Button
          size="sm"
          leftIcon={<Icon as={IoFunnel} />}
          variant="ghost"
          colorScheme="purple"
          onClick={() => {
            setSortBy('title');
            setFilterGenre('all');
            onSortChange('title');
            onFilterChange('all');
          }}
        >
          Limpar
        </Button>
      </Tooltip>
    </HStack>
  );
});

AnimeFilters.displayName = 'AnimeFilters';

export default AnimeFilters;

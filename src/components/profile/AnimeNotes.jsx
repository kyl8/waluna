import React, { useState, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Textarea,
  Button,
  Text,
  IconButton,
  Icon,
  useDisclosure,
} from '@chakra-ui/react';
import { IoClose, IoPencil } from 'react-icons/io5';

const AnimeNotes = React.memo(({ animeId, initialNotes = '' }) => {
  const [notes, setNotes] = useState(initialNotes);
  const [isEditing, setIsEditing] = useState(false);
  const [savedNotes, setSavedNotes] = useState(initialNotes);

  const handleSave = useCallback(() => {
    setSavedNotes(notes);
    setIsEditing(false);
    console.log(`Notas salvas para anime ${animeId}:`, notes);
  }, [notes, animeId]);

  const handleCancel = useCallback(() => {
    setNotes(savedNotes);
    setIsEditing(false);
  }, [savedNotes]);

  return (
    <Box bg="#1a1a1a" border="1px solid #3d3d3d" borderRadius="md" p={3}>
      <HStack justify="space-between" mb={2}>
        <Text fontSize="sm" fontWeight="bold" color="gray.100">
          📝 Minhas Anotações
        </Text>
        {!isEditing && (
          <IconButton
            icon={<Icon as={IoPencil} />}
            size="sm"
            variant="ghost"
            colorScheme="purple"
            onClick={() => setIsEditing(true)}
            aria-label="Editar notas"
          />
        )}
      </HStack>

      {isEditing ? (
        <VStack spacing={2} align="stretch">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Adicione suas anotações aqui..."
            size="sm"
            bg="#2a2a2a"
            border="1px solid #3d3d3d"
            color="gray.100"
            fontSize="xs"
            minH="80px"
          />
          <HStack spacing={2} justify="flex-end">
            <Button size="sm" variant="ghost" onClick={handleCancel}>
              Cancelar
            </Button>
            <Button size="sm" colorScheme="purple" onClick={handleSave}>
              Salvar
            </Button>
          </HStack>
        </VStack>
      ) : (
        <Text fontSize="sm" color="gray.400" whiteSpace="pre-wrap">
          {savedNotes || 'Nenhuma anotação ainda. Clique no ícone de lápis para adicionar.'}
        </Text>
      )}
    </Box>
  );
});

AnimeNotes.displayName = 'AnimeNotes';

export default AnimeNotes;

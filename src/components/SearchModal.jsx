import React from 'react';
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, VStack, Text, Spinner, Center } from '@chakra-ui/react';
import SearchResultItem from './SearchResultItem';

const SearchModal = ({ isOpen, onClose, results = [], loading, error, query = '' }) => {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size={{ base: 'full', sm: '2xl', md: '4xl' }} 
      scrollBehavior="inside"
      blockScrollOnMount={false}
      returnFocusOnClose={false}
      closeOnOverlayClick={false}
    >
      <ModalOverlay bg="transparent" zIndex={1400} />
      <ModalContent 
        bg="#111111" 
        border="1px solid #2d2d2d" 
        borderRadius={{ base: 0, sm: '2xl' }} 
        color="white"
        zIndex={1400}
        position={{ base: 'fixed', sm: 'relative' }}
        top={{ base: '140px', sm: 'auto' }}
        left={{ base: 0, sm: 'auto' }}
        right={{ base: 0, sm: 'auto' }}
        mx={{ base: '0', sm: 'auto' }}
        maxH={{ base: 'calc(100vh - 150px)', sm: '80vh' }}
      >
        <ModalHeader borderBottomWidth="1px" borderColor="#2d2d2d">
          <Text fontSize="lg">
            {query ? `Buscando por: "${query}"` : 'Resultados da Busca'}
          </Text>
          {results.length > 0 && !loading && (
            <Text fontSize="sm" color="gray.400" fontWeight="normal" mt={1}>
              {results.length} resultado{results.length !== 1 ? 's' : ''} encontrado{results.length !== 1 ? 's' : ''}
            </Text>
          )}
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody p={6}>
          {loading ? (
            <Center h="200px" flexDirection="column" gap={4}>
              <Spinner size="xl" color="purple.400" thickness="4px" speed="0.65s" />
              <Text color="gray.400">Buscando...</Text>
            </Center>
          ) : error ? (
            <Center h="200px" flexDirection="column" gap={2}>
              <Text fontSize="3xl">😔</Text>
              <Text color="red.400" fontWeight="bold">Erro ao buscar</Text>
              <Text color="gray.400" fontSize="sm">{error}</Text>
            </Center>
          ) : results.length > 0 ? (
            <VStack spacing={4} align="stretch">
              {results.map((item, index) => (
                <SearchResultItem key={item.anilist_id ? `al-${item.anilist_id}` : `t-${(item.title||'').replace(/\s+/g,'_')}-${index}`} item={item} />
              ))}
            </VStack>
          ) : (
            <Center h="200px" flexDirection="column" gap={2}>
              <Text fontSize="3xl">🔍</Text>
              <Text color="gray.400" fontSize="lg" fontWeight="medium">
                Nenhum resultado encontrado
              </Text>
              <Text color="gray.500" fontSize="sm">
                Tente buscar por outro termo
              </Text>
            </Center>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default React.memo(SearchModal, (prevProps, nextProps) => {
  return (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.loading === nextProps.loading &&
    prevProps.error === nextProps.error &&
    prevProps.query === nextProps.query &&
    prevProps.results.length === nextProps.results.length &&
    prevProps.onClose === nextProps.onClose
  );
});
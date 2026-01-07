import React from 'react';
import { Box, VStack, Text, Button } from '@chakra-ui/react';
import logger from '../../utils/helpers/logger';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logger.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box p={6} bg="red.900" borderRadius="md" m={4}>
          <VStack spacing={4} align="start">
            <Text fontSize="lg" color="white" fontWeight="bold">
              Algo deu errado
            </Text>
            <Text color="gray.200" fontSize="sm">
              {this.state.error?.message || 'Erro desconhecido'}
            </Text>
            <Button 
              colorScheme="whiteAlpha"
              onClick={() => window.location.reload()}
              size="sm"
            >
              Recarregar
            </Button>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}

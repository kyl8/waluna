import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  Box,
  VStack,
  HStack,
  Button,
  Input,
  Text,
  Progress,
  Spinner,
  useToast,
  Badge,
  Tooltip,
} from '@chakra-ui/react';
import { FaDownload, FaPlay, FaFilm, FaFolder } from 'react-icons/fa';

const API_BASE_URL = 'http://127.0.0.1:8080';

const VIDEO_EXTENSIONS = ['mkv', 'mp4', 'avi', 'mov', 'flv', 'wmv', 'webm', 'm4v'];

const isVideoFile = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
};

const FileItem = ({ file, onPlay, loadingIndex }) => {
  const isVideo = isVideoFile(file.name);
  
  return (
    <HStack
      py={2}
      px={3}
      bg={isVideo ? 'purple.900' : '#2d2d2d'}
      borderRadius="md"
      _hover={{ bg: isVideo ? 'purple.800' : '#3d3d3d' }}
      transition="background-color 150ms"
      justify="space-between"
    >
      <HStack flex={1} minW={0}>
        <Box color={isVideo ? 'purple.300' : 'gray.400'}>
          {isVideo ? <FaFilm /> : <FaFolder />}
        </Box>
        <VStack align="start" spacing={0} flex={1} minW={0}>
          <Text 
            fontSize="sm" 
            fontWeight={isVideo ? 'semibold' : 'normal'}
            color={isVideo ? 'white' : 'gray.300'}
            noOfLines={1}
            title={file.name}
          >
            {file.name}
          </Text>
        </VStack>
      </HStack>
      
      {isVideo && (
        <Tooltip label="Converter e reproduzir">
          <Button
            size="sm"
            colorScheme="purple"
            leftIcon={<FaPlay />}
            onClick={() => onPlay(file)}
            isLoading={loadingIndex === file.index}
            loadingText="..."
          >
            Play
          </Button>
        </Tooltip>
      )}
    </HStack>
  );
};

const TorrentDownloadModal = ({ 
  isOpen, 
  onClose, 
  magnetLink = '', 
  onPlayTorrent,
  mockFiles = null,
}) => {
  const [magnet, setMagnet] = useState(magnetLink);
  const [downloadId, setDownloadId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(null);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadingFileIndex, setLoadingFileIndex] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState('input'); // 'input' | 'downloading' | 'selecting' | 'playing'
  const toast = useToast();
  const pollIntervalRef = useRef(null);
  const filesCheckIntervalRef = useRef(null);
  const filesFoundRef = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMagnet(magnetLink);
      setDownloadId(null);
      setStatus(null);
      setProgress(null);
      setFiles([]);
      setError(null);
      setStep('input');
      setLoadingFileIndex(null);
      filesFoundRef.current = false;
      
      // Auto-start if magnetLink provided
      if (magnetLink) {
        handleStartDownload(magnetLink);
      }
      // If mock files provided, populate immediately for dev testing
      if (mockFiles && Array.isArray(mockFiles) && mockFiles.length > 0) {
        const videoFiles = mockFiles.filter(f => isVideoFile(f.name));
        if (videoFiles.length > 0) {
          filesFoundRef.current = true;
          setFiles(videoFiles);
          setDownloadId(`mock-${Date.now()}`);
          if (videoFiles.length === 1) {
            // auto-play single mock file
            setTimeout(() => handlePlayFile(videoFiles[0], `mock-${Date.now()}`), 50);
          } else {
            setStep('selecting');
          }
        }
      }
    } else {
      // Cleanup on close
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (filesCheckIntervalRef.current) {
        clearInterval(filesCheckIntervalRef.current);
        filesCheckIntervalRef.current = null;
      }
    }
  }, [isOpen, magnetLink]);

  // Poll download progress
  useEffect(() => {
    if (!downloadId || step !== 'downloading') return;

    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/progress?id=${downloadId}`);
        const data = await response.json();
        
        if (response.ok) {
          setStatus(data.status || 'downloading');
          setProgress({
            downloaded: data.downloaded || 0,
            total: data.total || 0,
            download_speed: data.download_speed || 0,
            peers: data.peers || 0,
          });
        }
      } catch (err) {
        console.warn('Poll error:', err);
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [downloadId, step]);

  // Poll files separately - keep trying until files are found
  useEffect(() => {
    if (!downloadId || step !== 'downloading' || filesFoundRef.current) return;

    const checkFilesInterval = async () => {
      if (filesFoundRef.current) return;
      
      try {
        const response = await fetch(`${API_BASE_URL}/streams/files/${downloadId}`);
        const data = await response.json();
        
        if (response.ok && data.files && data.files.length > 0) {
          const videoFiles = data.files.filter(f => isVideoFile(f.name));
          
          if (videoFiles.length > 0) {
            filesFoundRef.current = true;
            setFiles(videoFiles);
            
            // Stop polling
            if (filesCheckIntervalRef.current) {
              clearInterval(filesCheckIntervalRef.current);
              filesCheckIntervalRef.current = null;
            }
            
            console.log(`Found ${videoFiles.length} video files`);
            
            if (videoFiles.length === 1) {
              toast({
                title: 'Arquivo único detectado',
                description: 'Iniciando reprodução automática...',
                status: 'info',
                duration: 2000,
              });
              handlePlayFile(videoFiles[0], downloadId);
            } else {
              setStep('selecting');
              toast({
                title: `${videoFiles.length} arquivos encontrados`,
                description: 'Selecione qual deseja assistir',
                status: 'info',
                duration: 3000,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Files check error:', err);
      }
    };

    // Check immediately
    checkFilesInterval();
    
    // Then poll every 2 seconds
    filesCheckIntervalRef.current = setInterval(checkFilesInterval, 2000);

    return () => {
      if (filesCheckIntervalRef.current) {
        clearInterval(filesCheckIntervalRef.current);
        filesCheckIntervalRef.current = null;
      }
    };
  }, [downloadId, step, toast]);

  // 1. Start download (like dashboard /start endpoint)
  const handleStartDownload = useCallback(async (magnetToUse) => {
    const magnetValue = magnetToUse || magnet;
    if (!magnetValue.trim()) {
      toast({
        title: 'Erro',
        description: 'Cole um link magnético válido',
        status: 'error',
        duration: 3000,
      });
      return;
    }

    setLoading(true);
    setError(null);
    setStep('downloading');

    try {
      const response = await fetch(`${API_BASE_URL}/start?q=${encodeURIComponent(magnetValue)}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      if (data.download_id) {
        setDownloadId(data.download_id);
        toast({
          title: 'Download iniciado!',
          description: `ID: ${data.download_id.slice(0, 8)}...`,
          status: 'success',
          duration: 3000,
        });
        // Files will be checked automatically by the polling effect
      } else {
        throw new Error('No download_id received');
      }
    } catch (err) {
      setError(err.message);
      setStep('input');
      toast({
        title: 'Erro ao iniciar download',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [magnet, toast]);

  const checkFiles = useCallback(async (dlId) => {
    const id = dlId || downloadId;
    if (!id) return;

    setLoadingFiles(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/streams/files/${id}`);
      const data = await response.json();
      
      if (response.ok && data.files && data.files.length > 0) {
        // Filter video files
        const videoFiles = data.files.filter(f => isVideoFile(f.name));
        
        if (videoFiles.length > 0) {
          filesFoundRef.current = true;
          setFiles(videoFiles);
          
          // Stop automatic polling
          if (filesCheckIntervalRef.current) {
            clearInterval(filesCheckIntervalRef.current);
            filesCheckIntervalRef.current = null;
          }
          
          console.log(`Found ${videoFiles.length} video files (manual check)`);
          
          if (videoFiles.length === 1) {
            toast({
              title: 'Arquivo único detectado',
              description: 'Iniciando reprodução automática...',
              status: 'info',
              duration: 2000,
            });
            handlePlayFile(videoFiles[0], id);
          } else {
            setStep('selecting');
            toast({
              title: `${videoFiles.length} arquivos encontrados`,
              description: 'Selecione qual deseja assistir',
              status: 'info',
              duration: 3000,
            });
          }
        } else {
          toast({
            title: 'Nenhum vídeo encontrado',
            description: 'Aguardando metadados...',
            status: 'warning',
            duration: 2000,
          });
        }
      } else {
        toast({
          title: 'Arquivos não disponíveis',
          description: 'Aguardando torrent baixar metadados...',
          status: 'warning',
          duration: 2000,
        });
      }
    } catch (err) {
      console.warn('Error checking files:', err);
      toast({
        title: 'Erro ao verificar arquivos',
        description: err.message,
        status: 'error',
        duration: 3000,
      });
    } finally {
      setLoadingFiles(false);
    }
  }, [downloadId, toast]);

  // 3. Play file (like dashboard /hls/start/:id?file_index=X endpoint)
  const handlePlayFile = useCallback(async (file, dlId) => {
    const id = dlId || downloadId;
    if (!id) return;

    setLoadingFileIndex(file.index);
    setStep('playing');

    try {
      // If in mock mode (mockFiles provided), bypass backend and return a sample playlist
      if (mockFiles && Array.isArray(mockFiles)) {
        const hlsId = `mock-${id}`;
        const playlistUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

        toast({
          title: 'Mock HLS',
          description: `Preparando (mock): ${file.name}`,
          status: 'info',
          duration: 2000,
        });

        onPlayTorrent?.({
          hlsId: hlsId,
          downloadId: id,
          fileIndex: file.index,
          fileName: file.name,
          playlistUrl: playlistUrl,
          videoUrl: playlistUrl,
        });

        setTimeout(() => onClose?.(), 500);
        return;
      }

      const response = await fetch(`${API_BASE_URL}/hls/start/${id}?file_index=${file.index}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      const hlsId = data.id || id;
      const playlistUrl = `http://127.0.0.1:8080/hls/playlist/${hlsId}`;
      
      toast({
        title: 'Conversão HLS iniciada!',
        description: `Preparando: ${file.name}`,
        status: 'success',
        duration: 3000,
      });
      
      // Call parent with play info including playlistUrl
      onPlayTorrent?.({
        hlsId: hlsId,
        downloadId: id,
        fileIndex: file.index,
        fileName: file.name,
        playlistUrl: playlistUrl,
        videoUrl: playlistUrl,
      });
      
      // Close modal after a short delay
      setTimeout(() => {
        onClose?.();
      }, 500);

    } catch (err) {
      setError(err.message);
      setStep('selecting');
      setLoadingFileIndex(null);
      toast({
        title: 'Erro ao iniciar conversão',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
    }
  }, [downloadId, onPlayTorrent, onClose, toast]);

  const handleClose = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    onClose?.();
  }, [onClose]);

  const getProgressPercent = useCallback(() => {
    if (!progress || !progress.total) return 0;
    return Math.round((progress.downloaded / progress.total) * 100);
  }, [progress]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="2xl" scrollBehavior="inside">
      <ModalOverlay bg="blackAlpha.800" />
      <ModalContent bg="#1a1a1a" color="gray.100" maxH="80vh">
        <ModalHeader borderBottom="1px solid #2d2d2d">
          <HStack justify="space-between">
            <Text fontSize="xl" fontWeight="bold">
              Seletor de Arquivos
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton />

        <ModalBody py={6}>
          <VStack spacing={6} align="stretch">
            {step === 'input' && (
              <Box>
                <Text fontSize="sm" color="gray.400" mb={2}>Cole o link magnético:</Text>
                <HStack>
                  <Input
                    placeholder="magnet:?xt=urn:btih:..."
                    value={magnet}
                    onChange={(e) => setMagnet(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleStartDownload()}
                    isDisabled={loading}
                    bg="#2d2d2d"
                    borderColor="#3d3d3d"
                    _focus={{ borderColor: 'purple.500' }}
                  />
                  <Button
                    colorScheme="purple"
                    onClick={() => handleStartDownload()}
                    isLoading={loading}
                    leftIcon={<FaDownload />}
                    isDisabled={!magnet.trim()}
                  >
                    Iniciar
                  </Button>
                </HStack>
              </Box>
            )}

            {/* Error Message */}
            {error && (
              <Box p={3} bg="red.900" borderRadius="md" borderLeft="4px solid" borderLeftColor="red.500">
                <Text fontSize="sm" color="red.200">❌ {error}</Text>
              </Box>
            )}

            {/* Loading files indicator */}
            {step === 'downloading' && loadingFiles && (
              <HStack p={3} bg="#2d2d2d" borderRadius="md" justify="center">
                <Spinner size="sm" color="purple.500" />
                <Text fontSize="sm" color="gray.400">Detectando arquivos...</Text>
              </HStack>
            )}

            {/* Waiting for files */}
            {step === 'downloading' && !loadingFiles && files.length === 0 && (
              <Box p={4} bg="#2d2d2d" borderRadius="lg" textAlign="center">
                <Spinner color="purple.500" mb={3} />
                <Text fontSize="sm" color="gray.400">
                  Aguardando metadados do torrent...
                </Text>
                <Button 
                  size="sm" 
                  mt={3} 
                  variant="outline" 
                  colorScheme="purple"
                  onClick={() => checkFiles()}
                >
                  Verificar arquivos manualmente
                </Button>
              </Box>
            )}

            {/* Step 3: File Selection */}
            {step === 'selecting' && files.length > 0 && (
              <Box>
                <HStack justify="space-between" mb={3}>
                  <Text fontSize="md" fontWeight="semibold">
                    {files.length} vídeos encontrados:
                  </Text>
                  <Button 
                    size="xs" 
                    variant="ghost" 
                    colorScheme="purple"
                    onClick={() => checkFiles()}
                  >
                    Atualizar
                  </Button>
                </HStack>
                
                <VStack 
                  spacing={2} 
                  align="stretch" 
                  maxH="300px" 
                  overflowY="auto"
                  p={2}
                  bg="#1a1a1a"
                  borderRadius="lg"
                  border="1px solid #2d2d2d"
                >
                  {files.map((file, idx) => (
                    <FileItem
                      key={file.path || idx}
                      file={file}
                      onPlay={handlePlayFile}
                      loadingIndex={loadingFileIndex}
                    />
                  ))}
                </VStack>
              </Box>
            )}

            {/* Step 4: Playing / Converting */}
            {step === 'playing' && (
              <Box p={4} bg="green.900" borderRadius="lg" textAlign="center">
                <Spinner color="green.300" mb={3} />
                <Text fontSize="sm" color="green.200" fontWeight="semibold">
                  Iniciando conversão HLS...
                </Text>
                <Text fontSize="xs" color="green.300" mt={1}>
                  O player abrirá em instantes
                </Text>
              </Box>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid #2d2d2d" pt={4}>
          <HStack spacing={3} w="100%" justify="space-between">
            <Text fontSize="xs" color="gray.600">
              {step === 'downloading' && 'Download em progresso...'}
              {step === 'selecting' && 'Clique em Play para assistir'}
              {step === 'playing' && 'Preparando stream...'}
            </Text>
            <Button variant="ghost" onClick={handleClose} size="sm">
              Fechar
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default TorrentDownloadModal;

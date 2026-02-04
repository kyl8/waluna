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
  Spinner,
  useToast,
} from '@chakra-ui/react';
import { FaDownload } from 'react-icons/fa';
import TorrentFileExplorer from './TorrentFileExplorer';

const API_BASE_URL = 'http://127.0.0.1:8080';

const VIDEO_EXTENSIONS = ['mkv', 'mp4', 'avi', 'mov', 'flv', 'wmv', 'webm', 'm4v'];

const isVideoFile = (filename) => {
  if (!filename) return false;
  const ext = filename.split('.').pop()?.toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
};

const TorrentDownloadModal = ({ 
  isOpen, 
  onClose, 
  magnetLink = '', 
  onPlayTorrent,
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
  const [step, setStep] = useState('input');
  const [waitingMessage, setWaitingMessage] = useState('');
  const toast = useToast();
  const pollIntervalRef = useRef(null);
  const filesCheckIntervalRef = useRef(null);
  const filesFoundRef = useRef(false);
  const conversionQueueRef = useRef([]);
  const isConvertingRef = useRef(false);
  const waitingCounterRef = useRef(0);

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
      setWaitingMessage('');
      filesFoundRef.current = false;
      conversionQueueRef.current = [];
      isConvertingRef.current = false;
      waitingCounterRef.current = 0;
      if (magnetLink) {
        handleStartDownload(magnetLink);
      }
    } else {
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
            if (filesCheckIntervalRef.current) {
              clearInterval(filesCheckIntervalRef.current);
              filesCheckIntervalRef.current = null;
            }
            
            if (videoFiles.length === 1) {
              setStep('selecting');
              toast({
                title: 'Arquivo encontrado',
                description: 'Aguardando download estar pronto antes de converter...',
                status: 'info',
                duration: 3000,
              });
            } else {
              setStep('selecting');
            }
          }
        }
      } catch (err) {
        console.warn('Files check error:', err);
      }
    };
    checkFilesInterval();
    filesCheckIntervalRef.current = setInterval(checkFilesInterval, 2000);

    return () => {
      if (filesCheckIntervalRef.current) {
        clearInterval(filesCheckIntervalRef.current);
        filesCheckIntervalRef.current = null;
      }
    };
  }, [downloadId, step, toast]);

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

  const processConversionQueue = useCallback(async () => {
    if (isConvertingRef.current || conversionQueueRef.current.length === 0) return;
    
    isConvertingRef.current = true;
    const file = conversionQueueRef.current[0];
    
    try {
      const minSizeForConversion = 100 * 1024 * 1024; // 100MB
      let fileReady = false;
      let attempts = 0;
      const maxAttempts = 180;
      waitingCounterRef.current = 0;

      while (!fileReady && attempts < maxAttempts) {
        try {
          const response = await fetch(`${API_BASE_URL}/streams/files/${downloadId}`);
          if (response.ok) {
            const data = await response.json();
            const targetFile = data.files?.find(f => f.index === file.index);
            
            if (targetFile && targetFile.size >= minSizeForConversion) {
              fileReady = true;
            }
          }
        } catch (e) {
          console.warn('Size check error:', e);
        }

        if (!fileReady) {
          attempts++;
          waitingCounterRef.current = attempts;
          
          if (attempts % 6 === 0) {
            const downloadPercent = progress ? Math.round((progress.downloaded / progress.total) * 100) : 0;
            setWaitingMessage(
              `⏳ ${Math.round(attempts * 0.25)}s aguardando... Download: ${downloadPercent}%`
            );
          }
          
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (!fileReady) {
        throw new Error('Arquivo não baixou o suficiente (100MB). Tente novamente em alguns momentos.');
      }

      setWaitingMessage('');
      setLoadingFileIndex(file.index);
      setStep('converting');

      const response = await fetch(`${API_BASE_URL}/hls/start/${downloadId}?file_index=${file.index}`);
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      const hlsId = data.id || downloadId;
      const playlistUrl = `http://127.0.0.1:8080/hls/playlist/${hlsId}`;
      
      toast({
        title: 'Conversão HLS iniciada!',
        description: `Preparando: ${file.name}`,
        status: 'success',
        duration: 3000,
      });
      
      onPlayTorrent?.({
        hlsId: hlsId,
        downloadId: downloadId,
        fileIndex: file.index,
        fileName: file.name,
        playlistUrl: playlistUrl,
        videoUrl: playlistUrl,
      });
      
      conversionQueueRef.current.shift();
      
      setTimeout(() => {
        onClose?.();
      }, 500);

    } catch (err) {
      setError(err.message);
      setStep('selecting');
      setWaitingMessage('');
      toast({
        title: 'Erro ao iniciar conversão',
        description: err.message,
        status: 'error',
        duration: 5000,
      });
      conversionQueueRef.current.shift();
    } finally {
      setLoadingFileIndex(null);
      isConvertingRef.current = false;
      if (conversionQueueRef.current.length > 0) {
        setTimeout(() => processConversionQueue(), 1000);
      }
    }
  }, [downloadId, onPlayTorrent, onClose, toast, progress]);

  const handlePlayFile = useCallback((file) => {
    conversionQueueRef.current.push(file);
    processConversionQueue();
  }, [downloadId, processConversionQueue]);

  const handleClose = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    onClose?.();
  }, [onClose]);

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

            {error && (
              <Box p={3} bg="red.900" borderRadius="md" borderLeft="4px solid" borderLeftColor="red.500">
                <Text fontSize="sm" color="red.200">❌ {error}</Text>
              </Box>
            )}

            {step === 'downloading' && (
              <Box p={4} bg="#2d2d2d" borderRadius="lg" textAlign="center">
                <Spinner color="purple.500" mb={3} />
                <Text fontSize="sm" color="gray.400">
                  Aguardando metadados do torrent...
                </Text>
                <Text fontSize="xs" color="gray.500" mt={2}>
                  {progress ? `${Math.round((progress.downloaded / progress.total) * 100)}% • ${(progress.download_speed / 1024 / 1024).toFixed(1)} MB/s` : 'Conectando...'}
                </Text>
              </Box>
            )}

            {step === 'selecting' && files.length > 0 && (
              <Box>
                <HStack justify="space-between" mb={3}>
                  <Text fontSize="md" fontWeight="semibold">
                    {files.length} vídeos encontrados:
                  </Text>
                </HStack>
                
                <TorrentFileExplorer
                  downloadId={downloadId}
                  mockFiles={files}
                  onFileSelected={(info) => {
                    handlePlayFile({ name: info.fileName, index: info.fileIndex });
                  }}
                  onError={(err) => console.warn('Explorer error:', err)}
                />
              </Box>
            )}

            {step === 'converting' && (
              <Box p={4} bg="orange.900" borderRadius="lg" textAlign="center">
                <Spinner color="orange.300" mb={3} />
                {waitingMessage ? (
                  <>
                    <Text fontSize="sm" color="orange.200" fontWeight="semibold">
                      {waitingMessage}
                    </Text>
                    <Text fontSize="xs" color="orange.300" mt={2}>
                      Aguardando arquivo estar suficientemente baixado...
                    </Text>
                  </>
                ) : (
                  <>
                    <Text fontSize="sm" color="orange.200" fontWeight="semibold">
                      Iniciando conversão HLS...
                    </Text>
                    <Text fontSize="xs" color="orange.300" mt={1}>
                      O player abrirá em instantes
                    </Text>
                  </>
                )}
              </Box>
            )}
          </VStack>
        </ModalBody>

        <ModalFooter borderTop="1px solid #2d2d2d" pt={4}>
          <HStack spacing={3} w="100%" justify="space-between">
            <Text fontSize="xs" color="gray.600">
              {step === 'downloading' && 'Torrent em progresso...'}
              {step === 'selecting' && 'Clique em Play para assistir'}
              {step === 'converting' && 'Convertendo para HLS...'}
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

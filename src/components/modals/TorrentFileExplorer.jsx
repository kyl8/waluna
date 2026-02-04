import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  IconButton,
  Spinner,
  Button,
  Badge,
  useToast,
  Tooltip,
} from '@chakra-ui/react';
import { FaChevronRight, FaChevronDown, FaFolder, FaFile, FaPlay, FaFilm } from 'react-icons/fa';
import { listVideoFiles, startHLSConversion, getHLSStatus } from '../../utils/api/waluna.js';

const VIDEO_EXTENSIONS = ['mkv', 'mp4', 'avi', 'mov', 'flv', 'wmv', 'webm', 'm4v'];

const isVideoFile = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
};

const FileTreeNode = ({
  name,
  path,
  isFolder,
  files = [],
  level = 0,
  onFileSelect,
  isLoading = false,
  loadingFileIndex = null,
  fileIndex = null,
}) => {
  const [isExpanded, setIsExpanded] = useState(true); // always start expanded
  const isVideo = !isFolder && isVideoFile(name);
  const hasChildren = isFolder && files && files.length > 0;

  const toggleExpand = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const getFileSize = useCallback((bytes) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIdx = 0;
    while (size >= 1024 && unitIdx < units.length - 1) {
      size /= 1024;
      unitIdx++;
    }
    return `${size.toFixed(1)}${units[unitIdx]}`;
  }, []);

  const paddingLeft = `${level * 16}px`;

  return (
    <>
      <HStack
        spacing={3}
        py={1.5}
        px={3}
        mb={isVideo ? 1 : 0}
        bg={isVideo ? 'purple.900' : 'transparent'}
        borderRadius="md"
        _hover={isVideo || isFolder ? { bg: isVideo ? 'purple.800' : '#2d2d2d' } : undefined}
        cursor={isFolder || isVideo ? 'pointer' : 'default'}
        transition="background-color 150ms"
        ml={paddingLeft}
      >

        {hasChildren && (
          <IconButton
            icon={isExpanded ? <FaChevronDown /> : <FaChevronRight />}
            size="sm"
            variant="white"
            onClick={toggleExpand}
            minW="24px"
            w="24px"
            h="24px"
          />
        )}
        {!hasChildren && isFolder && <Box w="24px" />}
        {!isFolder && !hasChildren && <Box w="24px" />}

        {isFolder ? (
          <FaFolder size={14} color="#fbbf24" />
        ) : isVideo ? (
          <FaFilm size={14} color="#a78bfa" />
        ) : (
          <FaFile size={14} color="#9ca3af" />
        )}

        <Text
          flex={4}
          fontSize="sm"
          fontWeight={isVideo ? 'semibold' : 'normal'}
          color={isVideo ? 'purple.100' : 'gray.300'}
          noOfLines={1}
          onClick={isFolder ? toggleExpand : undefined}
        >
          {name}
        </Text>

        {/* Size Badge */}
        {!isFolder && files && files.length > 0 && (
          <Badge colorScheme="gray" fontSize="xs">
            {getFileSize(files[0]?.size || 0)}
          </Badge>
        )}

        {/* Video Badge */}
        {isVideo && (
          <Badge colorScheme="purple" fontSize="xs">
            {fileIndex !== null && `#${fileIndex}`}
          </Badge>
        )}

        {/* Play Button */}
        {isVideo && (
          <Tooltip label="Converter para HLS e tocar">
            <IconButton
              icon={<FaPlay />}
              size="sm"
              colorScheme="purple"
              onClick={(e) => {
                e.stopPropagation();
                onFileSelect && onFileSelect({ name, path, fileIndex: fileIndex ?? 0 });
              }}
              isLoading={isLoading && fileIndex === loadingFileIndex}
              minW="32px"
            />
          </Tooltip>
        )}
      </HStack>

      {/* Children */}
      {isExpanded && hasChildren && (
        <Box w="100%" pl={level === 0 ? 0 : 4}>
          {files.map((file, idx) => (
            <FileTreeNode
              key={file.path || idx}
              name={file.name}
              path={file.path}
              isFolder={file.isFolder}
              files={file.children || []}
              level={level + 1}
              onFileSelect={onFileSelect}
              isLoading={isLoading}
              loadingFileIndex={loadingFileIndex}
              fileIndex={file.index ?? null}
            />
          ))}
        </Box>
      )}
    </>
  );
};

export const TorrentFileExplorer = ({ downloadId, onFileSelected, onError, mockFiles = null }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingFileIndex, setLoadingFileIndex] = useState(null);
  const [error, setError] = useState(null);
  const toast = useToast();
  React.useEffect(() => {
    if (!downloadId) return;
    loadFiles();
  }, [downloadId]);
  React.useEffect(() => {
  }, [mockFiles]);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listVideoFiles(downloadId);
      if (result.ok && result.files) {
        const tree = buildFileTree(result.files);
        setFiles(tree);
      } else {
        throw new Error(result.error || 'Failed to load files');
      }
    } catch (err) {
      const errorMsg = err.message || 'Erro ao carregar arquivos';
      setError(errorMsg);
      onError?.(errorMsg);
      toast({
        title: 'Erro',
        description: errorMsg,
        status: 'error',
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }, [downloadId, onError, toast]);

  const buildFileTree = useCallback((fileList) => {
    if (!Array.isArray(fileList)) return [];
    const videoFiles = fileList.filter(file => isVideoFile(file.name));

    // root node with children and a childrenMap for quick lookup
    const root = { children: [], childrenMap: new Map() };

    // folders to skip from the beginning of paths (server internal folders)
    const skipFolders = new Set(['cache', 'downloads', 'hls']);

    videoFiles.forEach((file) => {
      // accept both forward and back slashes
      let parts = (file.path || file.name).split(/[/\\]+/).filter(p => p);
      
      // remove leading system folders (cache, downloads, etc.)
      while (parts.length > 1 && skipFolders.has(parts[0].toLowerCase())) {
        parts = parts.slice(1);
      }
      
      const folders = parts.slice(0, -1);

      let node = root;
      let accumPath = '';

      // create/traverse folder nodes
      folders.forEach((seg) => {
        accumPath = accumPath ? `${accumPath}/${seg}` : seg;
        // use the segment string as key within this node
        if (!node.childrenMap.has(seg)) {
          const folderNode = { name: seg, path: accumPath, isFolder: true, children: [], childrenMap: new Map() };
          node.childrenMap.set(seg, folderNode);
          node.children.push(folderNode);
        }
        node = node.childrenMap.get(seg);
      });

      // push file into the current node's children
      node.children.push({
        name: file.name,
        path: file.path,
        isFolder: false,
        size: file.size,
        index: file.index,
      });
    });

    // sort helper: folders first, then files, both alphabetically
    const sortChildren = (arr) => {
      arr.sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase());
      });
      arr.forEach(n => {
        if (n.isFolder && n.children) sortChildren(n.children);
      });
    };

    // helper to strip childrenMap before returning
    const cleanse = (nodes) => {
      return nodes.map(n => {
        if (n.isFolder) {
          const out = {
            name: n.name,
            path: n.path,
            isFolder: true,
            children: cleanse(n.children || []),
          };
          return out;
        }
        return n;
      });
    };

    sortChildren(root.children);
    const result = cleanse(root.children);

    // small debug log to help diagnose client-side issues
    // eslint-disable-next-line no-console
    console.debug('[TorrentFileExplorer] built tree', result.slice(0, 20));

    return result;
  }, []);

  React.useEffect(() => {
    if (mockFiles && Array.isArray(mockFiles)) {
      const tree = buildFileTree(mockFiles);
      setFiles(tree);
    }
  }, [mockFiles, buildFileTree]);

  const handleFileSelect = useCallback(
    async (file) => {
      if (file.fileIndex === undefined && file.fileIndex !== 0) {
        toast({
          title: 'Aviso',
          description: 'Arquivo sem índice válido',
          status: 'warning',
          duration: 3000,
        });
        return;
      }

      setLoadingFileIndex(file.fileIndex);
      
      try {
        onFileSelected?.({
          fileName: file.name,
          fileIndex: file.fileIndex,
          hlsId: downloadId,
          downloadId,
        });
      } catch (err) {
        toast({
          title: 'Erro',
          description: err.message || 'Erro ao iniciar conversão HLS',
          status: 'error',
          duration: 5000,
        });
        onError?.(err.message);
      } finally {
        setLoadingFileIndex(null);
      }
    },
    [downloadId, onFileSelected, onError, toast]
  );

  if (loading) {
    return (
      <VStack spacing={3} p={4} bg="#2d2d2d" borderRadius="lg">
        <Spinner color="purple.500" />
        <Text fontSize="sm" color="gray.400">Carregando arquivos...</Text>
      </VStack>
    );
  }

  if (error) {
    return (
      <VStack spacing={3} p={4} bg="#2d2d2d" borderRadius="lg">
        <Text color="red.400" fontSize="sm">{error}</Text>
        <Button size="sm" colorScheme="purple" onClick={loadFiles}>
          Tentar novamente
        </Button>
      </VStack>
    );
  }

  if (!files.length) {
    return (
      <Box p={4} bg="#2d2d2d" borderRadius="lg" textAlign="center">
        <Text color="gray.400" fontSize="sm">Nenhum arquivo de vídeo encontrado</Text>
      </Box>
    );
  }

  return (
    <Box
      bg="#1a1a1a"
      borderRadius="lg"
      border="1px solid #2d2d2d"
      p={3}
      maxH="300px"
      overflowY="auto"
    >
      <VStack spacing={2} align="stretch">
        {files.map((file, idx) => (
          <FileTreeNode
            key={file.path || idx}
            name={file.name}
            path={file.path}
            isFolder={file.isFolder}
            files={file.children || []}
            level={0}
            onFileSelect={handleFileSelect}
            isLoading={loadingFileIndex === file.index}
            loadingFileIndex={loadingFileIndex}
            fileIndex={file.index ?? null}
          />
        ))}
      </VStack>
    </Box>
  );
};

export default TorrentFileExplorer;

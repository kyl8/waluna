import React, { useState, useCallback } from 'react';
import { Box, Flex, useBreakpointValue, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton } from '@chakra-ui/react';
import { Global } from '@emotion/react';
import { ApiProvider } from './contexts/ApiContext';
import { Navbar, SearchContainer, VideoPlayer, ConfigModal } from './components';
import TorrentDownloadModal from './components/modals/TorrentDownloadModal';
import TorrentFileExplorer from './components/modals/TorrentFileExplorer';

function App() {
  const [isFavorited, setIsFavorited] = useState(false);
  const [playingHlsId, setPlayingHlsId] = useState(null);
  const [playingVideoUrl, setPlayingVideoUrl] = useState(null);
  const [playingFileIndex, setPlayingFileIndex] = useState(null);
  const [streamMetadata, setStreamMetadata] = useState([]);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [testMockFiles, setTestMockFiles] = useState(null);

  const user = { name: 'kyl', photoUrl: 'https://i.pinimg.com/736x/a9/bc/64/a9bc64837740124cd0ffeeef4c8de068.jpg' };
  const posterUrl = 'https://www.artplayer.cn/assets/sample/poster.jpg';
  const isDesktopLayout = useBreakpointValue({ base: false, lg: true }) ?? false;

  const handleFavoriteToggle = useCallback(() => {
    setIsFavorited(prev => !prev);
  }, []);

  const handleCloseAllModals = useCallback(() => {
    console.log('[App] Closing all modals');
    setIsConfigModalOpen(false);
    setIsTestModalOpen(false);
  }, []);

  const handlePlayTorrent = useCallback((torrent) => {
    console.log('[App] handlePlayTorrent recebeu:', torrent);
    setPlayingHlsId(torrent.hlsId || null);
    setPlayingVideoUrl(torrent.videoUrl || torrent.playlistUrl || null);
    setPlayingFileIndex(torrent.fileIndex ?? null);
    setStreamMetadata(torrent.streamMetadata || []);
  }, []);

  const handleSettingsClick = useCallback(() => {
    setIsConfigModalOpen(true);
  }, []);

  const handleTestModalOpen = useCallback(() => {
    setIsTestModalOpen(true);
  }, []);

  const handleDevClick = useCallback(() => {
    // mocked files with multiple folders for visual testing
    const mockFiles = [
      { name: 'S01E01.mkv', path: '/mock/Serial Experiments Lain/Season 1/S01E01.mkv', index: 0, size: 700 * 1024 * 1024 },
      { name: 'S01E02.mkv', path: '/mock/Serial Experiments Lain/Season 1/S01E02.mkv', index: 1, size: 650 * 1024 * 1024 },
      { name: 'S02E01.mkv', path: '/mock/Serial Experiments Lain/Season 2/S02E01.mkv', index: 2, size: 680 * 1024 * 1024 },
      { name: 'Movie 2020.mkv', path: '/mock/Movies/Movie 2020.mkv', index: 3, size: 1500 * 1024 * 1024 },
      { name: 'Interview.mp4', path: '/mock/Extras/Interview.mp4', index: 4, size: 120 * 1024 * 1024 },
      { name: 'README.md', path: '/mock/README.md', index: 5, size: 2048 },
    ];
    setTestMockFiles(mockFiles);
    setIsExplorerOpen(true);
  }, []);

  const handleTestModalClose = useCallback(() => {
    setIsTestModalOpen(false);
  }, []);

  const handleConfigModalClose = useCallback(() => {
    setIsConfigModalOpen(false);
  }, []);

  return (
    <ApiProvider>
      <Global
        styles={`
          html, body {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }

          /* animation tokens for framer-motion easing/timing */
          :root {
            --anim-duration: 140ms;
            --anim-ease: cubic-bezier(0.22, 0.9, 0.37, 1);
            --anim-ease-snap: cubic-bezier(0.25, 0.8, 0.25, 1);
          }
        `}
      />

    <Flex 
      direction="column" 
      bg="#111111" 
      minHeight="100vh" 
      color="gray.100"
    >
        <Navbar userName={user.name} userPhotoUrl={user.photoUrl} onSettingsClick={handleSettingsClick} onTestOpen={handleTestModalOpen} onDevClick={import.meta.env && import.meta.env.DEV ? handleDevClick : undefined} />
        <Flex
          as="main"
          direction="column"
          flex="1"
          px={4}
          py={{ base: 4, md: 8 }}
          css={{
            contain: 'layout style paint',
            perspective: '1000px',
            transform: 'translate3d(0, 0, 0)',
            overflow: 'auto'
          }}
        >
          
          <Box mb={{ base: 6, md: 8 }} w="100%">
              <SearchContainer 
                onCloseAllModals={handleCloseAllModals}
                onPlayTorrent={handlePlayTorrent}
              />
          </Box>

          <Box mb={{ base: 6, md: 8 }} w="100%">
              <VideoPlayer 
                videoUrl={playingVideoUrl} 
                posterUrl={posterUrl} 
                hlsId={playingHlsId}
                fileIndex={playingFileIndex}
              />
          </Box>
        </Flex>
      
      <ConfigModal 
          isOpen={isConfigModalOpen} 
        onClose={handleConfigModalClose}
          userName={user.name}
          userPhotoUrl={user.photoUrl}
      />

      <TorrentDownloadModal
        isOpen={isTestModalOpen}
        onClose={handleTestModalClose}
        onPlayTorrent={handlePlayTorrent}
        mockFiles={testMockFiles}
      />
      <Modal isOpen={isExplorerOpen} onClose={() => setIsExplorerOpen(false)} size="4xl">
        <ModalOverlay />
        <ModalContent bg="#111" color="gray.100">
          <ModalHeader>Seletor de Arquivos (DEV)</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <TorrentFileExplorer
              downloadId={null}
              mockFiles={testMockFiles}
              onFileSelected={handlePlayTorrent}
              onError={(e) => console.warn('[Dev Explorer] error', e)}
            />
          </ModalBody>
        </ModalContent>
      </Modal>
    </Flex>
    </ApiProvider>
  );
}

export default App;
import React, { useState, useCallback } from 'react';
import { Box, Flex, useBreakpointValue } from '@chakra-ui/react';
import { Global } from '@emotion/react';
import { ApiProvider } from './contexts/ApiContext';
import Navbar from './components/Navbar';
import SearchContainer from './components/SearchContainer.jsx';
import VideoPlayer from './components/VideoPlayer';
import PlayerControls from './components/PlayerControls';

function App() {
  const [isFavorited, setIsFavorited] = useState(false);

  const user = { name: 'kyl', photoUrl: 'https://i.pinimg.com/736x/a9/bc/64/a9bc64837740124cd0ffeeef4c8de068.jpg' };
  const videoUrl = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
  const posterUrl = 'https://www.artplayer.cn/assets/sample/poster.jpg';

  const isDesktopLayout = useBreakpointValue({ base: false, lg: true }) ?? false;

  const handleFavoriteToggle = useCallback(() => {
    setIsFavorited(prev => !prev);
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
        <Navbar userName={user.name} userPhotoUrl={user.photoUrl} onSettingsClick={() => {}} />

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
            <SearchContainer />
          </Box>

          <Box mb={{ base: 6, md: 8 }} w="100%">
            <VideoPlayer videoUrl={videoUrl} posterUrl={posterUrl} />
          </Box>

          <Box mb={{ base: 6, md: 8 }} w="100%">
            <PlayerControls isFavorited={isFavorited} onFavoriteToggle={handleFavoriteToggle} />
          </Box>
        </Flex>
      </Flex>
    </ApiProvider>
  );
}

export default App;
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, Button, HStack, Input, VStack, Text } from '@chakra-ui/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { motion } from 'framer-motion';
const MotionBox = motion(Box);

const VideoPlayer = ({ videoUrl, posterUrl, torrentHash }) => {
  const artRef = useRef(null);
  const [testMode, setTestMode] = useState(true);
  const [testHash, setTestHash] = useState('f7826e06601961c1a178e34fa72507d1e3bd28f1');
  const [currentUrl, setCurrentUrl] = useState('');
  const savedTimeRef = useRef(0);
  const isReloadingRef = useRef(false);
  const artInstanceRef = useRef(null);

  const playHls = useCallback((video, url) => {
    console.log('[playHls] Loading HLS URL:', url);
    if (Hls.isSupported()) {
      console.log('[playHls] Hls.js is supported');
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 15,
        maxMaxBufferLength: 40,
        maxBufferSize: 50 * 1000 * 1000,
        backBufferLength: 10,
        maxFragLookUpTolerance: 1.5,
        fragLoadingMaxRetry: 100,
        fragLoadingTimeOut: 15000,
        manifestLoadingMaxRetry: 100,
        manifestLoadingTimeOut: 45000,
        testBitrates: false,
        stopBufferingOnPause: false,
        startFragPrefetching: true,
        minBufferLength: 1,
        minBufferLengthCapping: 3,
        maxStarvationDelay: 4,
        lowBufferWatchdogPeriod: 1,
        highBufferWatchdogPeriod: 5,
      });
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        console.log('[Hls.js Error]', data.details, data.error?.message);
        if (!data.fatal) {
          console.log('[Hls.js] Non-fatal error, continuing...');
          return;
        }
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('[Hls.js] Network error, attempting to recover');
              setTimeout(() => hls.startLoad(), 3000);
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('[Hls.js] Media error, attempting to recover');
              hls.recoverMediaError();
              break;
          }
        }
      });
      
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log('[Hls.js] Manifest parsed successfully');
      });

      hls.on(Hls.Events.FRAG_LOADING, (event, data) => {
        console.log('[Hls.js] Loading fragment:', data.frag.sn);
      });

      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        console.log('[Hls.js] Fragment loaded:', data.frag.sn);
      });

      hls.on(Hls.Events.FRAG_LOAD_ERROR, (event, data) => {
        console.log('[Hls.js] Fragment load error:', data.frag.sn);
        if (video && !isReloadingRef.current) {
          isReloadingRef.current = true;
          savedTimeRef.current = video.currentTime || 0;
          console.log('[Hls.js] Saving position:', savedTimeRef.current, 'and reloading playlist');
          setTimeout(() => {
            hls.loadSource(url);
            isReloadingRef.current = false;
          }, 1000);
        }
      });
      
      hls.loadSource(url);
      hls.attachMedia(video);
      video._hlsInstance = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('[playHls] Using native HLS support');
      video.src = url;
    } else {
      console.error('[playHls] HLS not supported');
    }
  }, []);

  useEffect(() => {
    const hashToUse = testMode ? testHash : torrentHash;
    const hlsUrl = testMode 
      ? `http://127.0.0.1:8080/hls/playlist/${testHash}`
      : (hashToUse ? `http://127.0.0.1:8080/hls/playlist/${hashToUse}` : videoUrl);

    setCurrentUrl(hlsUrl);
    console.log('[VideoPlayer] Loading:', { torrentHash, testHash, testMode, hlsUrl });

    if (!artRef.current) {
      console.error('[VideoPlayer] artRef.current is null');
      return;
    }

    if (artInstanceRef.current && artInstanceRef.current.destroy) {
      try {
        artInstanceRef.current.destroy(false);
      } catch (e) {
        console.error('[VideoPlayer] Error destroying previous instance:', e);
      }
      artInstanceRef.current = null;
    }

    const art = new Artplayer({
      container: artRef.current,
      url: hlsUrl,
      type: 'm3u8',
      poster: posterUrl,
      theme: '#9F7AEA',
      customType: { 
        m3u8: playHls
      },
      volume: 0.5,
      isLive: false,
      muted: false,
      autoplay: false,
      pip: true,
      autoSize: true,
      autoMini: true,
      loop: false,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      setting: true,
      miniProgressBar: true,
      playsInline: true,
    });

    art.on('ready', () => {
      console.log('[VideoPlayer] Player ready');
      if (savedTimeRef.current > 0) {
        console.log('[VideoPlayer] Restoring to:', savedTimeRef.current);
        art.currentTime = savedTimeRef.current;
        savedTimeRef.current = 0;
      }
    });

    art.on('canplay', () => {
      console.log('[VideoPlayer] Can play');
      if (savedTimeRef.current > 0 && !isReloadingRef.current) {
        console.log('[VideoPlayer] Restoring to:', savedTimeRef.current);
        art.currentTime = savedTimeRef.current;
        savedTimeRef.current = 0;
      }
    });

    art.on('ended', () => {
      console.log('[VideoPlayer] Video finished');
      art.pause();
    });

    art.on('seek', () => {
      const currentTime = art.currentTime;
      const duration = art.duration;
      console.log(`[VideoPlayer] Seek to: ${currentTime.toFixed(2)}s / ${duration.toFixed(2)}s`);
    });

    artInstanceRef.current = art;

    return () => {
      if (artInstanceRef.current && artInstanceRef.current.destroy) {
        try {
          if (artInstanceRef.current.video && artInstanceRef.current.video._hlsInstance) {
            artInstanceRef.current.video._hlsInstance.destroy();
            artInstanceRef.current.video._hlsInstance = null;
          }
          artInstanceRef.current.destroy(false);
        } catch (e) {
          console.error('[VideoPlayer] Error destroying instance on cleanup:', e);
        }
        artInstanceRef.current = null;
      }
    };
  }, [videoUrl, posterUrl, torrentHash, testHash, testMode, playHls]);

  return (
    <VStack spacing={4} w="100%">
      <HStack spacing={2} w="100%" bg="#2d2d2d" p={3} borderRadius="md" flexWrap="wrap">
        <Text fontSize="sm" fontWeight="bold" whiteSpace="nowrap">🧪 TEST:</Text>
        <Input 
          value={testHash}
          onChange={(e) => setTestHash(e.target.value)}
          placeholder="Enter hash to test"
          size="sm"
          bg="#1a1a1a"
          color="gray.300"
          isDisabled={!testMode}
          w="200px"
        />
        <Button 
          size="sm" 
          colorScheme={testMode ? "purple" : "gray"} 
          onClick={() => setTestMode(!testMode)}
          whiteSpace="nowrap"
        >
          {testMode ? 'ON' : 'OFF'}
        </Button>
        <Text fontSize="xs" color="gray.400" noOfLines={1} maxW="300px">
          {currentUrl}
        </Text>
      </HStack>
      
      <MotionBox
        ref={artRef}
        className="gpu-accelerate"
        width={{ base: '90%', md: '70%', lg: '50%', xl: '45%' }}
        maxW="900px"
        mx="auto"
        initial={{ opacity: 0, scale: 0.995, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 16 } }}
        sx={{
          aspectRatio: '16 / 9',
          margin: '0 auto',
          borderRadius: '1rem',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
          position: 'relative',
          zIndex: 0,
        }}
      />
    </VStack>
  );
};

export default React.memo(VideoPlayer, (prevProps, nextProps) => {
  return prevProps.videoUrl === nextProps.videoUrl && 
         prevProps.posterUrl === nextProps.posterUrl &&
         prevProps.torrentHash === nextProps.torrentHash;
});
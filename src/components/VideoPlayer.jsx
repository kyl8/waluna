import React, { useRef, useEffect, useCallback } from 'react';
import { Box } from '@chakra-ui/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { motion } from 'framer-motion';
const MotionBox = motion(Box);

const VideoPlayer = ({ videoUrl, posterUrl }) => {
  const artRef = useRef(null);

  const playHls = useCallback((video, url) => {
    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    }
  }, []);

  useEffect(() => {
    const art = new Artplayer({
      container: artRef.current,
      url: videoUrl,
      poster: posterUrl,
      theme: '#9F7AEA',
      customType: { m3u8: playHls },
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

    return () => { if (art && art.destroy) art.destroy(false); };
  }, [videoUrl, posterUrl, playHls]);

  return (
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
  );
};

export default React.memo(VideoPlayer, (prevProps, nextProps) => {
  return prevProps.videoUrl === nextProps.videoUrl && prevProps.posterUrl === nextProps.posterUrl;
});
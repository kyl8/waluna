import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, VStack, useToast, Text, Spinner } from '@chakra-ui/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { motion } from 'framer-motion';
import artplayerPluginLibass from 'artplayer-plugin-libass';
import { fetchSubtitleMetadata, getSubtitleTemplate } from '../../utils/api/waluna';
import logger, { Logger } from '../../utils/helpers/logger';

const log = new Logger('VideoPlayer');
const MotionBox = motion(Box);

const DEFAULT_ASS_TEMPLATE = `[Script Info]
Title: Default
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

const formatTime = (secs) => {
    if (!Number.isFinite(secs) || secs <= 0) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const VideoPlayer = ({ videoUrl, posterUrl, torrentHash, hlsId }) => {
    const artRef = useRef(null);
    const artInstance = useRef(null);
    const hlsInstance = useRef(null);
    const abortController = useRef(null);
    const subtitlePollingRef = useRef(null);
    const durationInjected = useRef(false);
    const knownDuration = useRef(0);
    const subtitlesLoaded = useRef(false);

    const [displayTotal, setDisplayTotal] = useState('00:00');
    const [displayCurrent, setDisplayCurrent] = useState('00:00');
    const [isLoading, setIsLoading] = useState(true);
    const [subContentTemplate, setSubContentTemplate] = useState(DEFAULT_ASS_TEMPLATE);

    const toast = useToast();
    const defaultPoster = '';

    const injectDurationToVideo = useCallback((video, duration) => {
        if (!video || !duration || duration <= 0) return;
        try {
            if (durationInjected.current === duration) return;
            const descriptor = Object.getOwnPropertyDescriptor(video, 'duration');
            if (descriptor && !descriptor.configurable) return;
            Object.defineProperty(video, 'duration', {
                get: () => duration,
                configurable: true,
            });
            durationInjected.current = duration;
            setDisplayTotal(formatTime(duration));
        } catch (e) { }
    }, []);

    const getStorageKey = useCallback(() => `waluna_player_pos_${torrentHash || videoUrl}`, [torrentHash, videoUrl]);

    const savePlaybackPosition = useCallback(() => {
        if (artInstance.current && artInstance.current.currentTime > 5) {
            localStorage.setItem(getStorageKey(), artInstance.current.currentTime.toString());
        }
    }, [getStorageKey]);

    const restorePlaybackPosition = useCallback((art) => {
        try {
            const savedTime = localStorage.getItem(getStorageKey());
            if (savedTime) {
                const time = parseFloat(savedTime);
                if (!isNaN(time) && time > 0 && (art.duration === 0 || time < art.duration - 10)) {
                    art.currentTime = time;
                    toast({
                        title: 'Reprodução retomada',
                        description: `Continuando de ${formatTime(time)}`,
                        status: 'success',
                        duration: 3000,
                        position: 'top-left',
                        isClosable: true,
                        containerStyle: { zIndex: 9999 }
                    });
                }
            }
        } catch (e) { log.warn('Seek falhou', e); }
    }, [getStorageKey, toast]);

    const fetchAndValidateSubtitles = useCallback(async (hash) => {
        if (!hash) return [];
        try {
            const subtitlesUrl = `http://127.0.0.1:8080/streams/subs/${hash}`;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); 
                const resp = await fetch(subtitlesUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!resp.ok) return [];
                const data = await resp.json();
                const subs = data.subtitles || data;
                
                if (!Array.isArray(subs) || subs.length === 0) return [];

                const langNames = { 'eng': 'Inglês', 'por': 'Português', 'spa': 'Espanhol', 'jpn': 'Japonês' };

                return subs.filter(sub => sub.url).map(sub => {
                    let url = sub.url;
                    if (!url.startsWith('http')) url = `http://127.0.0.1:8080${url}`;
                    const langName = langNames[sub.language] || sub.language.toUpperCase();
                    const displayName = sub.title ? `${langName} (${sub.title})` : langName;

                    return {
                        default: sub.default || false,
                        html: displayName,
                        url: url,
                        language: sub.language,
                        title: sub.title
                    };
                });
            } catch (e) { return []; }
        } catch (e) { return []; }
    }, []);

    const startSubtitlePolling = useCallback((art, hash) => {
        if (subtitlePollingRef.current) clearInterval(subtitlePollingRef.current);
        
        let attempts = 0;
        const maxAttempts = 30;

        const poll = async () => {
            if (!art || !art.template || !art.template.$player) {
                if (subtitlePollingRef.current) clearInterval(subtitlePollingRef.current);
                return;
            }
            if (subtitlesLoaded.current || attempts >= maxAttempts) {
                if (subtitlePollingRef.current) clearInterval(subtitlePollingRef.current);
                return;
            }

            attempts++;
            const validated = await fetchAndValidateSubtitles(hash);

            if (validated.length > 0) {
                if (!art.libass) return;

                subtitlesLoaded.current = true;
                if (subtitlePollingRef.current) clearInterval(subtitlePollingRef.current);

                try {
                    const subtitleMenu = {
                        html: 'Legendas',
                        width: 250,
                        name: 'subtitle',
                        tooltip: 'Selecionar',
                        icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-8 7H5v-1h7v1zm0-4H5V6h7v1zm6 8H5v-1h13v1zm0-4h-4V6h4v1z"/></svg>',
                        selector: [
                            { html: 'Desativado', url: 'off', default: true },
                            ...validated
                        ],
                        onSelect: function (item) {
                            if (!art.libass) {
                                art.notice.show = 'Erro: Plugin indisponível';
                                return item.html;
                            }
                            if (item.url === 'off') {
                                art.libass.hide();
                                art.notice.show = 'Legenda Desativada';
                            } else {
                                art.libass.switch(item.url);
                                art.libass.show();
                                art.notice.show = `Legenda: ${item.html.replace(/<[^>]*>?/gm, '')}`;
                            }
                            return item.html;
                        },
                    };

                    if (art.setting.find('subtitle')) {
                        art.setting.update(subtitleMenu);
                    } else {
                        art.setting.add(subtitleMenu);
                    }
                    art.notice.show = 'Legendas Disponíveis';
                } catch (err) { }
            }
        };
        poll();
        subtitlePollingRef.current = setInterval(poll, 3000);
    }, [fetchAndValidateSubtitles]);

    const waitForHlsReady = useCallback(async (hash, signal) => {
        const check = async () => {
            try {
                const statusResp = await fetch(`http://127.0.0.1:8080/hls/status/${hash}`, { signal });
                if (statusResp.ok) {
                    const data = await statusResp.json();
                    if (data.duration > 0) {
                        knownDuration.current = data.duration;
                        setDisplayTotal(formatTime(data.duration));
                        return true;
                    }
                    if (data.segments_count > 0) return true;
                }
                const playlistResp = await fetch(`http://127.0.0.1:8080/hls/playlist/${hash}`, { method: 'HEAD', signal });
                if (playlistResp.ok) return true;
            } catch (e) { }
            return false;
        };

        const startTime = Date.now();
        while (Date.now() - startTime < 60000) { 
            if (signal.aborted) throw new Error('Aborted');
            if (await check()) return true;
            await new Promise(r => setTimeout(r, 1500));
        }
        return false;
    }, []);

    const initPlayer = useCallback(async () => {
        log.info('initPlayer disparado');
        
        if (artInstance.current) {
            savePlaybackPosition();
            artInstance.current.destroy(false);
            artInstance.current = null;
        }
        if (hlsInstance.current) {
            hlsInstance.current.destroy();
            hlsInstance.current = null;
        }
        if (abortController.current) abortController.current.abort();
        if (subtitlePollingRef.current) {
            clearInterval(subtitlePollingRef.current);
            subtitlePollingRef.current = null;
        }
        if (artRef.current) artRef.current.innerHTML = '';

        const controller = new AbortController();
        abortController.current = controller;
        const signal = controller.signal;

        setIsLoading(true);
        durationInjected.current = false;
        subtitlesLoaded.current = false;

        try {
            const hashToUse = hlsId || torrentHash;
            const isHls = !!hashToUse;
            const finalUrl = isHls 
                ? `http://127.0.0.1:8080/hls/playlist/${hashToUse}`
                : videoUrl;

            if (!finalUrl) return;
            if (isHls) {
                log.info('Aguardando HLS ready...');
                const ready = await waitForHlsReady(hashToUse, signal);
                if (!ready) {
                    if (!signal.aborted) toast({ title: 'Erro', description: 'Tempo limite excedido.', status: 'error' });
                    return;
                }
                log.info('Esperando buffer do servidor (2s)...');
                await new Promise(r => setTimeout(r, 2000));
            }

            if (signal.aborted) return;
            if (!artRef.current) return;

            log.info('Instanciando Artplayer...');

            const art = new Artplayer({
                container: artRef.current,
                url: finalUrl,
                type: isHls ? 'm3u8' : 'video/mp4',
                poster: posterUrl || defaultPoster,
                theme: '#9F7AEA',
                volume: 0.5,
                autoplay: true,
                pip: true,
                autoSize: true,
                autoMini: true,
                fullscreen: true,
                fullscreenWeb: true,
                setting: true,
                playbackRate: true,
                aspectRatio: true,
                flip: true,
                playsInline: true,
                customType: {
                    m3u8: (video, url) => {
                        if (knownDuration.current > 0) injectDurationToVideo(video, knownDuration.current);
                        
                        if (Hls.isSupported()) {
                            const hls = new Hls({ 
                                debug: false, 
                                enableWorker: true,
                                manifestLoadingTimeOut: 20000, 
                                manifestLoadingMaxRetry: 20, 
                                manifestLoadingRetryDelay: 2000, 
                                levelLoadingTimeOut: 20000,
                                levelLoadingMaxRetry: 10,
                                fragLoadingTimeOut: 20000,
                                fragLoadingMaxRetry: 10,
                            });
                            
                            hlsInstance.current = hls;
                            hls.loadSource(url);
                            hls.attachMedia(video);
                            
                            hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));

                            hls.on(Hls.Events.ERROR, function (event, data) {
                                if (data.fatal) {
                                    switch (data.type) {
                                        case Hls.ErrorTypes.NETWORK_ERROR:
                                            log.warn('Erro de Rede HLS, tentando recuperar...', data.details);
                                            hls.startLoad();
                                            break;
                                        case Hls.ErrorTypes.MEDIA_ERROR:
                                            log.warn('Erro de Mídia HLS, tentando recuperar...');
                                            hls.recoverMediaError();
                                            break;
                                        default:
                                            log.error('Erro Fatal HLS');
                                            hls.destroy();
                                            break;
                                    }
                                }
                            });

                        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                            video.src = url;
                        }
                    },
                },
                plugins: [
                    artplayerPluginLibass({
                        workerUrl: '/assets/subtitles-octopus-worker.js',
                        wasmUrl: '/assets/subtitles-octopus-worker.wasm',
                        fallbackFont: '/assets/misc/SourceHanSansCN-Bold.woff2',
                        subContent: subContentTemplate 
                    }),
                ],
            });

            art.on('artplayerPluginLibass:init', (adapter) => {
                art.libass = adapter;
            });

            art.on('ready', () => {
                if (signal.aborted) {
                    art.destroy(false);
                    return;
                }
                log.info('Player Ready');
                setIsLoading(false);
                restorePlaybackPosition(art);

                if (isHls) startSubtitlePolling(art, hashToUse);
            });

            art.on('video:timeupdate', () => {
                if (art.video) setDisplayCurrent(formatTime(art.video.currentTime));
            });

            art.on('video:loadedmetadata', () => {
                if (art.video && (!durationInjected.current || art.video.duration > durationInjected.current)) {
                     setDisplayTotal(formatTime(art.video.duration));
                     if (art.video.duration > 1) injectDurationToVideo(art.video, art.video.duration);
                }
            });

            art.on('destroy', () => savePlaybackPosition());

            const saveInterval = setInterval(() => {
                if (art && art.playing) savePlaybackPosition();
            }, 5000);
            art.on('destroy', () => clearInterval(saveInterval));

            artInstance.current = art;

        } catch (error) {
            log.error('Player setup exception:', error);
            if (!signal.aborted) setIsLoading(false);
        }
    }, [
        videoUrl, torrentHash, hlsId, posterUrl, defaultPoster, subContentTemplate, 
        injectDurationToVideo, toast, savePlaybackPosition, restorePlaybackPosition, 
        waitForHlsReady, startSubtitlePolling
    ]);

    useEffect(() => {
        getSubtitleTemplate().then(tmpl => { if (tmpl) setSubContentTemplate(tmpl); });
    }, []);

    useEffect(() => {
        initPlayer();
        return () => {
            if (abortController.current) abortController.current.abort();
            if (subtitlePollingRef.current) clearInterval(subtitlePollingRef.current);
            if (hlsInstance.current) { hlsInstance.current.destroy(); hlsInstance.current = null; }
            if (artInstance.current) {
                if(artInstance.current.currentTime > 5) {
                    const key = `waluna_player_pos_${torrentHash || videoUrl}`;
                    localStorage.setItem(key, artInstance.current.currentTime.toString());
                }
                artInstance.current.destroy(false);
                artInstance.current = null;
            }
            if (artRef.current) artRef.current.innerHTML = '';
        };
    }, [initPlayer, torrentHash, hlsId, videoUrl]);

return (
        <VStack spacing={4} w="100%">
            <MotionBox
                key={hlsId || torrentHash || videoUrl}
                width={{ base: '90%', md: '70%', lg: '50%', xl: '45%' }}
                maxW="900px"
                mx="auto"
                initial={{ opacity: 0, scale: 0.995, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                sx={{
                    position: 'relative',
                    aspectRatio: '16 / 9',
                    borderRadius: '1rem',
                    overflow: 'hidden',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
                    backgroundColor: '#000'
                }}
            >
                <Box ref={artRef} position="absolute" inset={0} zIndex={10} />

                {isLoading && (
                    <Box
                        position="absolute"
                        inset={0}
                        zIndex={20}
                        style={{
                            backgroundImage: "url('https://static0.polygonimages.com/wordpress/wp-content/uploads/chorus/uploads/chorus_asset/file/25125210/frieren_beyond_journeys_end_gallery_sekw.jpg')", 
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat'
                        }}
                    >
                        {/*camada sobre a imagem */}
                        <Box
                            position="absolute"
                            inset={0}
                            bg="blackAlpha.500"
                            backdropFilter="blur(2px)" 
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                        >
                            {/* texto*/}
                            <VStack
                                spacing={4}
                                p={8}
                                //bg="rgba(0, 0, 0, 0.2)"
                                //borderRadius="xl"
                                //	border="1px solid rgba(255, 255, 255, 0.1)"
                                textAlign="center"
                            >
                                <Spinner size="xl" color="purple.400" thickness="3px" mb={2} />
                                <Box>
                                    <Text color="white" fontSize="xl" fontWeight="bold" mb={1} textShadow="0 2px 4px rgba(0,0,0,0.8)">
                                        Esperando algo acontecer...
                                    </Text>
                                </Box>
                            </VStack>
                        </Box>
                    </Box>
                )}
            </MotionBox>
        </VStack>
    );
};

export default React.memo(VideoPlayer);
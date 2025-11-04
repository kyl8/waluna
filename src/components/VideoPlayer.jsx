import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

const VideoPlayer = ({ videoUrl, posterUrl, torrentHash }) => {
	const artRef = useRef(null);
	const [currentUrl, setCurrentUrl] = useState('');
	const artInstanceRef = useRef(null);
	const statusPollRef = useRef(null);
	const [durationSeconds, setDurationSeconds] = useState(null);
	const [displayTotal, setDisplayTotal] = useState('00:00');
	const [displayCurrent, setDisplayCurrent] = useState('00:00');
	const currentDurationRef = useRef(null);
	const creatingRef = useRef(false);
	const hlsRef = useRef(null); 
	const playbackMonitorRef = useRef(null); 
	const playbackStuckAttemptsRef = useRef(0); 
	const durationInjectedRef = useRef(false);
	const initialSkipAttemptRef = useRef(0); 

	const lastPolledDurationRef = useRef(null);
	const pollStableCountRef = useRef(0);
	
	const injectDurationToVideo = (video, duration) => {
		if (!video || !duration || typeof duration !== 'number' || duration <= 0) return;
		try {
			// evita redefinir se já injetado com o mesmo valor
			if (durationInjectedRef.current === duration) return;

			Object.defineProperty(video, 'duration', {
				get: () => duration,
				configurable: true,
			});

			durationInjectedRef.current = duration;
		} catch (e) {
			console.warn('Could not inject duration getter:', e.message);
		}
	};

	const poster = 'https://i.pinimg.com/1200x/06/24/76/06247693547f1ae58fd4ddf1c94869ba.jpg';

	// helper: format seconds -> mm:ss or h:mm:ss
	const formatTime = (secs) => {
		if (!isFinite(secs) || secs <= 0) return '00:00';
		const h = Math.floor(secs / 3600);
		const m = Math.floor((secs % 3600) / 60);
		const s = Math.floor(secs % 60);
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	};

	// poller
	const startStatusPolling = useCallback((hlsId) => {
		if (statusPollRef.current) clearInterval(statusPollRef.current);
		const statusUrl = `http://127.0.0.1:8080/hls/status/${hlsId}`;
		console.log('[Status] Polling:', statusUrl);

		const poll = async () => {
			try {
				const response = await fetch(statusUrl, { cache: 'no-store' });
				if (!response.ok) return;

				const data = await response.json();
				const totalSeconds = data.duration || 0;

				if (typeof totalSeconds === 'number' && totalSeconds > 0) {
					// atualizar referência sempre
					const prev = lastPolledDurationRef.current;
					if (prev !== null && Math.abs(prev - totalSeconds) < 0.001) {
						// mesmo valor consecutivo
						pollStableCountRef.current = (pollStableCountRef.current || 0) + 1;
					} else {
						// novo valor visto -> reset contador
						lastPolledDurationRef.current = totalSeconds;
						pollStableCountRef.current = 1;
					}

					// atualizar estado/label imediatamente (sem injetar)
					if (Math.abs((currentDurationRef.current || 0) - totalSeconds) > 1) {
						currentDurationRef.current = totalSeconds;
						setDurationSeconds(totalSeconds);
						setDisplayTotal(formatTime(totalSeconds));
					}

					if (pollStableCountRef.current >= 2) {
						injectDurationToVideo(artInstanceRef.current?.video, totalSeconds);
					}
				}
			} catch (error) {
				console.warn('[Status] Polling error:', error.message);
			}
		};

		// reset counters ao iniciar poll
		lastPolledDurationRef.current = null;
		pollStableCountRef.current = 0;

		poll();
		statusPollRef.current = setInterval(poll, 10000); // 10s
	}, []);

	const waitForHlsReady = useCallback(async (id, { timeout = 60000, interval = 1000 } = {}) => {
		if (!id) return false;

		const checkEndpoint = async (url) => {
			try {
				const resp = await fetch(url, { cache: 'no-store' });
				if (!resp.ok) return 0;

				if (url.includes('/status/')) {
					const data = await resp.json();
					if (typeof data.duration === 'number' && data.duration > 0) {
						currentDurationRef.current = data.duration;
						setDurationSeconds(data.duration);
					}
					return data.segments_count || 0;
				} else {
					const text = await resp.text();
					return (text.match(/#EXTINF:/g) || []).length;
				}
			} catch (e) {
				return 0;
			}
		};

		const start = Date.now();
		while (Date.now() - start < timeout) {
			const statusUrl = `http://127.0.0.1:8080/hls/status/${id}`;
			const count = await checkEndpoint(statusUrl);
			if (count > 0) {
				console.log('[HLS Ready] status indicates', count, 'segments');
				return true;
			}

			const playlistUrl = `http://127.0.0.1:8080/hls/playlist/${id}`;
			const plCount = await checkEndpoint(playlistUrl);
			if (plCount > 0) {
				console.log('[HLS Ready] playlist contains', plCount, 'segments');
				return true;
			}

			await new Promise(r => setTimeout(r, interval));
		}

		console.warn('[HLS Ready] timeout reached');
		return false;
	}, []);

	useEffect(() => {
		const destroyPlayer = () => {
			try { if (playbackMonitorRef.current) { clearTimeout(playbackMonitorRef.current); playbackMonitorRef.current = null; } } catch(_) {}
			if (artInstanceRef.current?.destroy) {
				try {
					artInstanceRef.current.destroy(false);
				} catch (e) {
					console.error('[Player] Destroy error:', e.message);
				}
			}
			try { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch(_) {} hlsRef.current = null; } } catch(_) {}
			durationInjectedRef.current = false;
			creatingRef.current = false;
			artInstanceRef.current = null;
			playbackStuckAttemptsRef.current = 0;
			initialSkipAttemptRef.current = 0;
		};

		const hashToUse = torrentHash;
		const hlsUrl = hashToUse ? `http://127.0.0.1:8080/hls/playlist/${hashToUse}` : videoUrl;
		setCurrentUrl(hlsUrl);
		setDurationSeconds(null);
		currentDurationRef.current = null;
		destroyPlayer();
		setTimeout(() => {
			if (!artRef.current) {
				console.error('[Player] Container not found');
				return;
			}
			// evitar criar se já estiver criando/instanciado
			if (creatingRef.current || artInstanceRef.current) return;
			createPlayer();
		}, 0);

		const createPlayer = async () => {
			if (creatingRef.current) return;
			creatingRef.current = true;
			destroyPlayer();

			if (hashToUse) {
				const ready = await waitForHlsReady(hashToUse, { timeout: 60000, interval: 1000 });
				if (!ready) console.warn('[Player] HLS ready timeout');
			}

			try {
				let hlsInstance = null;
				let playInitiated = false;

				const art = new Artplayer({
					container: artRef.current,
					url: hlsUrl,
					type: 'm3u8',
					poster: posterUrl || poster,
					theme: '#9F7AEA',
					volume: 0.5,
					isLive: false,
					autoplay: false,
					pip: true,
					autoSize: true,
					autoMini: true,
					playbackRate: true,
					aspectRatio: true,
					fullscreen: true,
					fullscreenWeb: true,
					setting: true,
					miniProgressBar: true,
					playsInline: true,
					muted: false,
					contextMenu: true,
					customType: {
						m3u8: (video, url) => {
							if (Hls.isSupported()) {
								const known = currentDurationRef.current || durationSeconds;
								if (known && known > 0) {
									injectDurationToVideo(video, known);
								}

								const hls = new Hls({
									debug: false,
									enableWorker: true,
									lowLatencyMode: false,
									maxBufferLength: 600,       
									maxMaxBufferLength: 1200,
									backBufferLength: 300,
									manifestLoadingTimeOut: 20000,
									manifestLoadingMaxRetry: 6,
								});

								hlsInstance = hls;
								hlsRef.current = hls;
								hls.on(Hls.Events.MANIFEST_PARSED, () => {
									if (playInitiated) return;
									playInitiated = true;
									// tentativa inicial de pular pequeno offset para evitar ponto problemático em 0s
									try {
										if ((video.currentTime || 0) < 0.05 && initialSkipAttemptRef.current === 0) {
											initialSkipAttemptRef.current = 1;
											const target = Math.min(1, (currentDurationRef.current && currentDurationRef.current > 2) ? 1 : 0.5);
											try { video.currentTime = target; } catch (e) {}
										}
									} catch (_) {}

									video.play().catch(() => {});
									if (playbackMonitorRef.current) clearTimeout(playbackMonitorRef.current);
									playbackMonitorRef.current = setTimeout(() => {
										try {
											const cur = video.currentTime || 0;
											if (cur < 0.1 && playbackStuckAttemptsRef.current < 2) {
												playbackStuckAttemptsRef.current += 1;
												try { hlsRef.current?.startLoad(); } catch (_) {}
												try { video.muted = true; } catch (_) {}
												try { video.currentTime = Math.min(1, (currentDurationRef.current && currentDurationRef.current > 2) ? 1 : 0.5); } catch (_) {}
												setTimeout(() => {
													video.play().catch(() => {});
													setTimeout(() => { try { video.muted = false; } catch (_) {} }, 500);
												}, 250);
											}
										} catch (e) {}
										playbackMonitorRef.current = null;
									}, 700);
								});
 								let metadataLoaded = false;
 								const onLoadedMeta = async () => {
 									if (metadataLoaded) return;
 									metadataLoaded = true;
 									try {
 										if (hashToUse) {
 											const statusUrl = `http://127.0.0.1:8080/hls/status/${hashToUse}`;
 											const resp = await fetch(statusUrl, { cache: 'no-store' });
 											if (resp.ok) {
 												const data = await resp.json();
 												if (typeof data.duration === 'number' && data.duration > 0) {
 													currentDurationRef.current = data.duration;
 													setDurationSeconds(data.duration);
 													setDisplayTotal(formatTime(data.duration));
 												}
 											}
 										}
 									} catch (e) {
 										console.warn('status fetch failed:', e.message);
 									}
 									if (!currentDurationRef.current || currentDurationRef.current <= 0) {
 										if (currentDurationRef.current && currentDurationRef.current > 0) {
 											setDurationSeconds(currentDurationRef.current);
 											setDisplayTotal(formatTime(currentDurationRef.current));
 										} else if (video.duration && video.duration > 0) {
 											currentDurationRef.current = video.duration;
 											setDurationSeconds(video.duration);
 											setDisplayTotal(formatTime(video.duration));
 										}
 									}
 									setDisplayCurrent(formatTime(0));
 								};
 								video.addEventListener('loadedmetadata', onLoadedMeta);
 								const onTimeUpdate = () => {
 									try {
 										const t = video.currentTime || 0;
 										setDisplayCurrent(formatTime(t));
 									} catch (e) {}
 								};
 								video.addEventListener('timeupdate', onTimeUpdate);
 
 								// cleanup específico do video/hls
 								video.addEventListener('destroy', () => {
 									try { video.removeEventListener('loadedmetadata', onLoadedMeta); } catch(e) {}
 									try { video.removeEventListener('timeupdate', onTimeUpdate); } catch(e) {}
 									try { if (playbackMonitorRef.current) { clearTimeout(playbackMonitorRef.current); playbackMonitorRef.current = null; } } catch(_) {}
 									try { hls.destroy(); } catch(e) {}
 									hlsRef.current = null;
 								});
 
 								hls.loadSource(url);
 								hls.attachMedia(video);
 							} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
 								video.src = url;
 							}
 						},
 					},
 				});
 				if (art.video && currentDurationRef.current && currentDurationRef.current > 0) {
 					try {
 						injectDurationToVideo(art.video, currentDurationRef.current);
 						setDisplayTotal(formatTime(currentDurationRef.current));
 						setDurationSeconds(currentDurationRef.current);
 					} catch (e) {
 						console.warn('Early injection failed:', e.message);
 					}
 				}
				art.on('ready', () => {
					try {
						art.seek = 0;
					} catch (e) { /* silent */ }
					if (hashToUse) startStatusPolling(hashToUse);
					if (currentDurationRef.current) setDisplayTotal(formatTime(currentDurationRef.current));
					setDisplayCurrent(formatTime(0));
				});

				if (art.video) {
					const fallbackOnTime = () => setDisplayCurrent(formatTime(art.video.currentTime || 0));
					art.video.addEventListener('timeupdate', fallbackOnTime);
				}

				artInstanceRef.current = art;
				creatingRef.current = false;
			} catch (err) {
				creatingRef.current = false;
				console.error('[Player] Create error:', err.message);
			}
		};
		return () => {
			if (statusPollRef.current) {
				clearInterval(statusPollRef.current);
				statusPollRef.current = null;
			}
			destroyPlayer();
		};
	}, [videoUrl, posterUrl, torrentHash, startStatusPolling, waitForHlsReady]);

	useEffect(() => {
		if (durationSeconds) {
			setDisplayTotal(formatTime(durationSeconds));
		}
	}, [durationSeconds]);

	return (
		<VStack spacing={4} w="100%">
			<Text fontSize="xs" color="gray.400" noOfLines={1} maxW="100%">
				{currentUrl}
			</Text>

			<MotionBox
				ref={artRef}
				width={{ base: '90%', md: '70%', lg: '50%', xl: '45%' }}
				maxW="900px"
				mx="auto"
				initial={{ opacity: 0, scale: 0.995, y: 6 }}
				animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 120, damping: 16 } }}
				sx={{
					position: 'relative', // permite overlay absoluto
					aspectRatio: '16 / 9',
					borderRadius: '1rem',
					overflow: 'hidden',
					boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
				}}
			>
				<Box
					position="absolute"
					bottom={{ base: '48px', md: '60px' }}
					left="50%"
					transform="translateX(-50%)"
					zIndex={50}
					pointerEvents="none"
					color="white"
					fontFamily="mono"
					fontSize={{ base: 'sm', md: 'md' }}
					textShadow="0 2px 8px rgba(0,0,0,0.6)"
					px={3}
					py={1}
					borderRadius="md"
					bg="rgba(0,0,0,0.18)"
				>
					{displayCurrent} / {displayTotal}
				</Box>
			</MotionBox>
		</VStack>
	);
};

export default React.memo(VideoPlayer, (prevProps, nextProps) => {
	return prevProps.videoUrl === nextProps.videoUrl && 
		prevProps.posterUrl === nextProps.posterUrl &&
		prevProps.torrentHash === nextProps.torrentHash;
});
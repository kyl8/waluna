import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Box, VStack, Text } from '@chakra-ui/react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { motion } from 'framer-motion';
import artplayerPluginLibass from 'artplayer-plugin-libass';
import { fetchSubtitleMetadata, getSubtitleTemplate } from '../../utils/api/waluna';
import { Logger } from '../../utils/helpers/logger';

const log = new Logger('VideoPlayer');

const MotionBox = motion(Box);

const VideoPlayer = ({ videoUrl, posterUrl, torrentHash }) => {
	const artRef = useRef(null);
	const [currentUrl, setCurrentUrl] = useState('');
	const artInstanceRef = useRef(null);
	const libassAdapterRef = useRef(null);
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
	const [subtitles, setSubtitles] = useState([]);
	const subtitlesRef = useRef([]); 
	const [subContentTemplate, setSubContentTemplate] = useState('');

	const lastPolledDurationRef = useRef(null);
	const pollStableCountRef = useRef(0);
	const subtitleQueueRef = useRef(null);
	const loadingSubtitleRef = useRef(false);
	const lastTorrentHashRef = useRef(null);
	const subtitleAbortRef = useRef(new AbortController());
	
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
			log.warn('Could not inject duration getter', { error: e.message });
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
		log.debug('Polling', { url: statusUrl });

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
				log.warn('Polling error', { error: error.message });
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
				log.debug('HLS Ready', { segments: count });
				return true;
			}

			const playlistUrl = `http://127.0.0.1:8080/hls/playlist/${id}`;
			const plCount = await checkEndpoint(playlistUrl);
			if (plCount > 0) {
				log.debug('HLS Ready', { segments: plCount });
				return true;
			}

			await new Promise(r => setTimeout(r, interval));
		}

		log.warn('HLS Ready timeout reached');
		return false;
	}, []);

	// Carregar legendas do API
	const loadSubtitles = useCallback(async (torrentId) => {
		if (!torrentId) return null;

		try {
			const subs = await fetchSubtitleMetadata(torrentId);
			if (subs && subs.length > 0) {
				subtitlesRef.current = subs;
				setSubtitles(subs);
				return subs;
			}
			return null;
		} catch (error) {
			log.warn('Load error', { error: error.message });
			return null;
		}
	}, []);

	const loadSubtitleInPlayer = useCallback((art, subtitleUrl) => {
		if (!art || !subtitleUrl) return;

		let fullUrl = subtitleUrl;
		if (!fullUrl.startsWith('http')) {
			fullUrl = `http://127.0.0.1:8080${fullUrl}`;
		}

		subtitleQueueRef.current = fullUrl;
		
		const processQueue = async () => {
			if (loadingSubtitleRef.current || !subtitleQueueRef.current) return;

			loadingSubtitleRef.current = true;
			const urlToLoad = subtitleQueueRef.current;
			subtitleQueueRef.current = null;

			try {
			// Check if operation was aborted
			if (subtitleAbortRef.current.signal.aborted) {
				log.debug('Operation aborted');
				loadingSubtitleRef.current = false;
				return;
			}				// Extra safety check for destroyed adapter
				if (!libassAdapterRef.current?.switch) {
					loadingSubtitleRef.current = false;
					return;
				}

				// Validate file exists and has content
			try {
				const headResponse = await fetch(urlToLoad, { method: 'HEAD' });
				if (!headResponse.ok) {
					log.warn('File not accessible', { url: urlToLoad, status: headResponse.status });
					loadingSubtitleRef.current = false;
					return;
				}
				
				const contentLength = headResponse.headers.get('content-length');
				if (!contentLength || parseInt(contentLength) === 0) {
					log.warn('File is empty or missing', { url: urlToLoad });
					loadingSubtitleRef.current = false;
					return;
				}
			} catch (checkError) {
				log.warn('Cannot validate file', { url: urlToLoad, error: checkError.message });
				loadingSubtitleRef.current = false;
				return;
			}				// Longer delay to ensure worker is fully ready
				await new Promise(r => setTimeout(r, 300));
				
			// Check abort before proceeding
			if (subtitleAbortRef.current.signal.aborted) {
				log.debug('Operation aborted during delay');
				loadingSubtitleRef.current = false;
				return;
			}
			// Triple-check adapter still exists after delay (critical!)
			if (!libassAdapterRef.current || !libassAdapterRef.current.switch) {
				log.warn('Adapter destroyed during load, aborting');
				loadingSubtitleRef.current = false;
				return;
			}
			
			try {
				libassAdapterRef.current.switch(urlToLoad);
				libassAdapterRef.current.show?.();
				log.info('✓ Injected');
			} catch (switchError) {
				log.error('Failed to switch subtitle', switchError);
				// Try to recover by retrying after longer delay
				subtitleQueueRef.current = urlToLoad;
				loadingSubtitleRef.current = false;
				setTimeout(processQueue, 500);
				return;
			}
		} catch (error) {
			log.warn('Error', { error: error.message });
		} finally {
			loadingSubtitleRef.current = false;
			if (subtitleQueueRef.current) processQueue();
		}
		};

		processQueue();
	}, []);

	const createSubtitleSelector = useCallback((art, subs) => {
		if (!art || !subs || subs.length === 0) return;

		try {
			const options = [
				{ html: 'Off', value: 'off' },
				...subs.map((sub) => {
					let url = sub.url || '';
					if (!url.startsWith('http') && url) {
						url = `http://127.0.0.1:8080${url}`;
					}
					return {
						html: `${sub.language || 'Unknown'} - ${sub.title || 'Subtitle'}`,
						value: url
					};
				})
			];

			art.setting.add({
				html: 'Subtitle',
				icon: '<svg viewBox="0 0 24 24" fill="currentColor"><text x="2" y="18" font-size="14">CC</text></svg>',
				tooltip: 'Select subtitle',
				selector: options,
				onSelect: function(item) {
					if (item.value === 'off') {
						log.debug('Off');
						art.emit('artplayerPluginLibass:visible', false);
					} else {
						log.debug('Select', { url: item.value });
						loadSubtitleInPlayer(art, item.value);
					}
					return item.html;
				}
			});
		} catch (error) {
			log.warn('Selector error', { error: error.message });
		}
	}, [loadSubtitleInPlayer]);

	// Buscar template de legenda do backend
	useEffect(() => {
		const loadTemplate = async () => {
			try {
				const template = await getSubtitleTemplate();
				if (template) {
					setSubContentTemplate(template);
				}
			} catch (error) {
				log.warn('Error loading subtitle template', { error: error.message });
			}
		};

		loadTemplate();
	}, []);

	useEffect(() => {
		const destroyPlayer = () => {
			try { if (playbackMonitorRef.current) { clearTimeout(playbackMonitorRef.current); playbackMonitorRef.current = null; } } catch(_) {}
			if (artInstanceRef.current?.destroy) {
				try {
					artInstanceRef.current.destroy(false);
				} catch (e) {
					log.error('Player destroy error', e);
				}
			}
			try { if (hlsRef.current) { try { hlsRef.current.destroy(); } catch(_) {} hlsRef.current = null; } } catch(_) {}
			durationInjectedRef.current = false;
			creatingRef.current = false;
			artInstanceRef.current = null;
			playbackStuckAttemptsRef.current = 0;
			initialSkipAttemptRef.current = 0;
			// Clear subtitle queue and adapter when destroying
			libassAdapterRef.current = null;
			subtitleQueueRef.current = null;
			loadingSubtitleRef.current = false;
			// Abort any pending subtitle operations
			subtitleAbortRef.current.abort();
			subtitleAbortRef.current = new AbortController();
		};

		if (!loadSubtitles || !createSubtitleSelector || !loadSubtitleInPlayer) return;

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
				// Just wait for HLS, legendas já estão extraídas
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
				plugins: [
					artplayerPluginLibass({
						workerUrl: '/assets/subtitles-octopus-worker.js',
						fallbackFont: '/assets/misc/SourceHanSansCN-Bold.woff2',
						wasmUrl: '/assets/subtitles-octopus-worker.wasm',
						subContent: subContentTemplate || `[Script Info]
Title: Default
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`,
					}),
				],
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
			// LibASS Plugin Event Listeners
			art.on('artplayerPluginLibass:init', async (adapter) => {
				libassAdapterRef.current = adapter;
				
				if (hashToUse && adapter) {
					// Apenas carrega legendas se for episódio novo
					if (lastTorrentHashRef.current !== hashToUse) {
						lastTorrentHashRef.current = hashToUse;
						
						try {
							const subs = await loadSubtitles(hashToUse);
							
							if (subs && subs.length > 0) {
								const firstSub = subs[0];
								if (firstSub.url) {
									loadSubtitleInPlayer(art, firstSub.url);
									console.log('[Subtitles] ✓ Injected');
								}
								createSubtitleSelector(art, subs);
							}
						} catch (error) {
							console.warn('[Subtitles] Error:', error.message);
						}
					}
				}
			});

			art.on('artplayerPluginLibass:switch', (url) => {});
			art.on('artplayerPluginLibass:visible', (visible) => {});
			art.on('artplayerPluginLibass:destroy', () => {
				libassAdapterRef.current = null;
			});

			art.on('ready', async () => {
				try {
					art.seek = 0;
				} catch (e) { /* silent */ }
				if (hashToUse) startStatusPolling(hashToUse);
				if (currentDurationRef.current) setDisplayTotal(formatTime(currentDurationRef.current));
				setDisplayCurrent(formatTime(0));
			});				if (art.video) {
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
	}, [videoUrl, posterUrl, torrentHash, startStatusPolling, waitForHlsReady, loadSubtitles, createSubtitleSelector, loadSubtitleInPlayer]);

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

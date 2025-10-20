// sorting hook using web worker
import { useState, useEffect, useRef, useMemo, startTransition } from 'react';

export function useSortWorker(episodes, sortMode, animeId) {
	const [sortedEpisodes, setSortedEpisodes] = useState([]);
	const [isPending, setIsPending] = useState(false);
	
	const workerRef = useRef(null);
	const taskIdRef = useRef(0);
	const prevAnimeIdRef = useRef(null);
	const isCurrentAnimeRef = useRef(true);
	const isCleaningUpRef = useRef(false);
	const debounceRef = useRef(null);
	
	// Normalize sort mode
	const normalizedSortMode = sortMode === 'descending' ? 'descending' : 'ascending';
	
	useEffect(() => {
		// Reset cleanup flag
		isCleaningUpRef.current = false;
		
		// Check if anime changed
		const animeChanged = animeId !== prevAnimeIdRef.current;
		prevAnimeIdRef.current = animeId;
		
		// CLEAR episodes immediately on anime change
		if (animeChanged) {
			isCurrentAnimeRef.current = false;
			
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
			
			if (workerRef.current) {
				workerRef.current.terminate();
				workerRef.current = null;
			}
			
			taskIdRef.current++;
			isCurrentAnimeRef.current = true;
			
			// Clear immediately without blocking
			startTransition(() => {
				setSortedEpisodes([]);
			});
		}
		
		// Don't process if no episodes
		if (!episodes || episodes.length === 0) {
			setSortedEpisodes([]);
			setIsPending(false);
			return;
		}

		// Debounce by 50ms only
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		const currentTaskId = ++taskIdRef.current;
		setIsPending(true);

		debounceRef.current = setTimeout(() => {
			if (workerRef.current) {
				workerRef.current.terminate();
				workerRef.current = null;
			}

			try {
				// Load worker from src/workers folder using URL constructor
				const workerUrl = new URL('../../workers/sort.worker.js', import.meta.url);
				const worker = new Worker(workerUrl, { type: 'module' });
				workerRef.current = worker;

				const timeoutId = setTimeout(() => {
					if (workerRef.current === worker) {
						worker.terminate();
						workerRef.current = null;
						if (taskIdRef.current === currentTaskId && isCurrentAnimeRef.current) {
							setIsPending(false);
						}
					}
				}, 3000);

				// Use MessageChannel for true async communication
				const channel = new MessageChannel();
				const responsePort = channel.port1;

				// Handle message WITHOUT blocking main thread
				responsePort.onmessage = (ev) => {
					clearTimeout(timeoutId);
					
					if (isCleaningUpRef.current || !isCurrentAnimeRef.current || taskIdRef.current !== currentTaskId) {
						return;
					}
					
					const { sorted, error } = ev.data;

					// Schedule state update with LOWER priority - spread across frames
					if (typeof scheduler !== 'undefined' && scheduler.yield) {
						scheduler.yield().then(() => {
							if (!isCurrentAnimeRef.current || taskIdRef.current !== currentTaskId || isCleaningUpRef.current) {
								return;
							}

							if (error) {
								startTransition(() => {
									setSortedEpisodes([]);
								});
								setIsPending(false);
							} else if (sorted && Array.isArray(sorted) && sorted.length > 0) {
								startTransition(() => {
									setSortedEpisodes(sorted);
								});
								setIsPending(false);
							} else {
								setIsPending(false);
							}
						});
					} else {
						startTransition(() => {
							if (error) {
								setSortedEpisodes([]);
							} else if (sorted && Array.isArray(sorted) && sorted.length > 0) {
								setSortedEpisodes(sorted);
							}
							setIsPending(false);
						});
					}
				};

				worker.onerror = (err) => {
					clearTimeout(timeoutId);
					responsePort.close();
					if (taskIdRef.current === currentTaskId && isCurrentAnimeRef.current) {
						setIsPending(false);
					}
				};

				// Send task with MessageChannel port
				worker.postMessage(
					{
						episodes,
						sortMode: normalizedSortMode,
						animeId,
						taskId: currentTaskId,
						port: channel.port2
					},
					[channel.port2] // Transfer port ownership
				);

			} catch (err) {
				if (taskIdRef.current === currentTaskId && isCurrentAnimeRef.current) {
					setIsPending(false);
				}
			}
		}, 50);

		return () => {
			isCleaningUpRef.current = true;
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
				debounceRef.current = null;
			}
		};
	}, [episodes, sortMode, animeId, normalizedSortMode]);

	return useMemo(() => {
		return {
			episodes: sortedEpisodes,
			isPending
		};
	}, [sortedEpisodes, isPending]);
}

export default useSortWorker;

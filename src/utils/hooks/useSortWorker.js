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
	
	// normalize sort mode
	const normalizedSortMode = sortMode === 'descending' ? 'descending' : 'ascending';
	
	useEffect(() => {
		// reset
		isCleaningUpRef.current = false;
		
		// check if animeId changed
		const animeChanged = animeId !== prevAnimeIdRef.current;
		prevAnimeIdRef.current = animeId;
		
		// clear episodes immediately on anime change
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
			
			// clear without blocking main thread
			startTransition(() => {
				setSortedEpisodes([]);
			});
		}
		
		// don't process if no episodes
		if (!episodes || episodes.length === 0) {
			setSortedEpisodes([]);
			setIsPending(false);
			return;
		}

		// 50ms debounce
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
				// loading worker
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

				const channel = new MessageChannel();
				const responsePort = channel.port1;
				responsePort.onmessage = (ev) => {
					clearTimeout(timeoutId);
					
					if (isCleaningUpRef.current || !isCurrentAnimeRef.current || taskIdRef.current !== currentTaskId) {
						return;
					}
					
					const { sorted, error } = ev.data;
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

				worker.postMessage(
					{
						episodes,
						sortMode: normalizedSortMode,
						animeId,
						taskId: currentTaskId,
						port: channel.port2
					},
					[channel.port2] 
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

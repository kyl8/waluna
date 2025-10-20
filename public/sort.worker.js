/**
 * Web Worker for sorting episodes
 * Served from public folder
 */

self.onmessage = (ev) => {
  const { episodes, sortMode, taskId } = ev.data;
  
  console.log(`[Worker] Received ${episodes?.length} episodes, mode: ${sortMode}`);
  
  if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
    console.error('[Worker] Invalid episodes array');
    self.postMessage({ sorted: [], error: 'Invalid episodes' });
    return;
  }

  try {
    const sorted = [...episodes].sort((a, b) => {
      const aNum = Number(a?.number ?? a?.ep ?? a?.episode ?? 0);
      const bNum = Number(b?.number ?? b?.ep ?? b?.episode ?? 0);
      
      if (sortMode === 'descending') {
        return bNum - aNum;
      }
      return aNum - bNum;
    });

    console.log(`[Worker] Sorted ${sorted.length} episodes in ${sortMode} mode`);
    
    self.postMessage({
      sorted,
      error: null
    });
  } catch (error) {
    console.error('[Worker] Sort error:', error);
    self.postMessage({
      sorted: [],
      error: error.message
    });
  }
};

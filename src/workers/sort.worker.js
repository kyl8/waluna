const CHUNK_SIZE = 100; 

self.onmessage = (ev) => {
  const { episodes, sortMode, taskId, port } = ev.data;
  
  if (!episodes || !Array.isArray(episodes) || episodes.length === 0) {
    port?.postMessage({ sorted: [], error: 'Invalid episodes' });
    return;
  }

  try {
    const sorted = [...episodes].sort((a, b) => {
      const aNum = Number(a?.number ?? a?.ep ?? a?.episode ?? 0);
      const bNum = Number(b?.number ?? b?.ep ?? b?.episode ?? 0);
      
      return sortMode === 'descending' ? bNum - aNum : aNum - bNum;
    });
    if (port) {
      port.postMessage({ sorted, error: null, taskId });
    } else {
      self.postMessage({ sorted, error: null, taskId });
    }
  } catch (error) {
    const errorMsg = error?.message || String(error);
    if (port) {
      port.postMessage({ sorted: [], error: errorMsg, taskId });
    } else {
      self.postMessage({ sorted: [], error: errorMsg, taskId });
    }
  }
};

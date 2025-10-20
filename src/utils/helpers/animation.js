import logger from './logger.js';

let frameRate = 60; // default
let frameTime = 1000 / frameRate;
const subscribers = new Set();

// detecta refresh rate usando requestAnimationFrame
export function detectRefreshRate() {
  return new Promise((resolve) => {
    logger.group('Display Refresh Rate Detection');
    logger.debug('Starting frame rate measurement...');
    
    let lastTime = performance.now();
    let frameCount = 0;
    const frameTimes = [];

    function measureFrame(currentTime) {
      const delta = currentTime - lastTime;
      lastTime = currentTime;
      frameCount++;
      frameTimes.push(delta);

      // mede 120 frames para mais precisão
      if (frameCount < 120) {
        requestAnimationFrame(measureFrame);
      } else {
        // calcula estatísticas
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameCount;
        const minFrameTime = Math.min(...frameTimes);
        const maxFrameTime = Math.max(...frameTimes);
        const medianFrameTime = frameTimes.sort((a, b) => a - b)[Math.floor(frameCount / 2)];
        
        // detecta Hz pela média e mediana
        const avgHz = Math.round(1000 / avgFrameTime);
        const medianHz = Math.round(1000 / medianFrameTime);
        
        // usa mediana como mais confiável
        frameRate = medianHz;
        frameTime = 1000 / frameRate;

        // quando a medição termina atualiza frameRate/frameTime e notifica inscritos
        subscribers.forEach((fn) => {
          try { fn(frameRate); } catch (e) { /* ignore */ }
        });

        logger.info('Measurements completed', {
          framesSampled: frameCount,
          avgFrameTime: `${avgFrameTime.toFixed(2)}ms`,
          medianFrameTime: `${medianFrameTime.toFixed(2)}ms`,
          minFrameTime: `${minFrameTime.toFixed(2)}ms`,
          maxFrameTime: `${maxFrameTime.toFixed(2)}ms`,
          avgDetectedHz: avgHz,
          medianDetectedHz: medianHz,
          finalRefreshRate: `${frameRate}Hz`,
          frameTime: `${frameTime.toFixed(2)}ms per frame`
        });

        resolve(frameRate);
      }
    }

    requestAnimationFrame(measureFrame);
  });
}

// retorna duração de transição otimizada para o refresh rate
export function getOptimalDuration(baseDuration = 100) {
  const frames = Math.round((baseDuration / 1000) * frameRate);
  const optimalDuration = (frames / frameRate) * 1000;
  
  if (baseDuration !== 0) {
    logger.debug('Duration optimization', {
      baseDuration: `${baseDuration}ms`,
      optimalDuration: `${optimalDuration.toFixed(2)}ms`,
      frames: `${frames} frames @ ${frameRate}Hz`
    });
  }
  
  return optimalDuration;
}

// executa callback sincronizado com refresh rate
export function onNextFrame(callback) {
  requestAnimationFrame(callback);
}

// executa callback após N frames
export function afterFrames(frames, callback) {
  let count = 0;
  function tick() {
    count++;
    if (count >= frames) {
      callback();
    } else {
      requestAnimationFrame(tick);
    }
  }
  requestAnimationFrame(tick);
}

// retorna duração em ms para N frames
export function framesToMs(frames) {
  return (frames / frameRate) * 1000;
}

// retorna número de frames para N ms
export function msToFrames(ms) {
  return Math.round((ms / 1000) * frameRate);
}

// subscription helpers (ja exportadas)
export function subscribeFrameRate(fn) {
  if (typeof fn === 'function') {
    subscribers.add(fn);
    // notifica imediatamente com o valor atual
    try { fn(frameRate); } catch (e) { /* ignore */ }
  }
  return () => unsubscribeFrameRate(fn);
}

export function unsubscribeFrameRate(fn) {
  subscribers.delete(fn);
}

export function getFrameRate() {
  logger.info(`Current frame rate: ${frameRate}Hz`);
  return frameRate;
}

export default {
  detectRefreshRate,
  getOptimalDuration,
  onNextFrame,
  afterFrames,
  framesToMs,
  msToFrames,
  getFrameRate,
  subscribeFrameRate,
  unsubscribeFrameRate,
};

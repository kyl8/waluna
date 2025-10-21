import logger from './logger.js';

let frameRate = 60; // default
let frameTime = 1000 / frameRate;
const subscribers = new Set();

// detect refresh rate of the display
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

      // measure 120 frames for more accuracy
      if (frameCount < 120) {
        requestAnimationFrame(measureFrame);
      } else {
        // calculate statistics
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameCount;
        const minFrameTime = Math.min(...frameTimes);
        const maxFrameTime = Math.max(...frameTimes);
        const medianFrameTime = frameTimes.sort((a, b) => a - b)[Math.floor(frameCount / 2)];
        
        // detect hz by mean and median
        const avgHz = Math.round(1000 / avgFrameTime);
        const medianHz = Math.round(1000 / medianFrameTime);

        // use median as more reliable
        frameRate = medianHz;
        frameTime = 1000 / frameRate;

        // when measurement ends, update frameRate/frameTime and notify subscribers
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

// returns optimal duration in ms for given base duration
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

// executes callback synchronized with refresh rate
export function onNextFrame(callback) {
  requestAnimationFrame(callback);
}

// executes callback after N frames
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

// returns duration in ms for N frames
export function framesToMs(frames) {
  return (frames / frameRate) * 1000;
}

// returns number of frames for N ms
export function msToFrames(ms) {
  return Math.round((ms / 1000) * frameRate);
}

// subscription helpers (already exported)
export function subscribeFrameRate(fn) {
  if (typeof fn === 'function') {
    subscribers.add(fn);
    // notify immediately with current value
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

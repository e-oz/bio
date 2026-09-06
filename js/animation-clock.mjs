export const FRAME_INTERVAL_MS = 1000 / 120;

/** Preserve fractional frame time so refresh-rate jitter does not halve the render rate. */
export function createFrameLimiter() {
  let nextFrameAt;
  return {
    reset() { nextFrameAt = undefined; },
    delay(now) { return nextFrameAt === undefined ? 0 : Math.max(0, nextFrameAt - now); },
    shouldRender(now) {
      if (nextFrameAt === undefined) { nextFrameAt = now + FRAME_INTERVAL_MS; return true; }
      if (now + 0.5 < nextFrameAt) return false;
      const intervals = Math.max(1, Math.floor((now - nextFrameAt + 0.0000001) / FRAME_INTERVAL_MS) + 1);
      nextFrameAt += intervals * FRAME_INTERVAL_MS;
      return true;
    },
  };
}

/** Accumulate visible animation time without coupling its speed to rendered frame count. */
export function createAnimationClock() {
  let elapsed = 0;
  let previous = 0;
  let running = false;
  return {
    resume(now) { previous = now; running = true; },
    pause() { running = false; },
    advance(now) {
      const delta = running ? Math.max(0, now - previous) / 1000 : 0;
      if (running) previous = Math.max(previous, now);
      elapsed += delta;
      return { elapsed, delta };
    },
  };
}

/** Exponential easing converges at the same rate for any subdivision of elapsed time. */
export function dampingFactor(delta, rate) {
  return 1 - Math.exp(-delta * rate);
}

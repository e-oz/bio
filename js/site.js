const scene = document.querySelector('#scene');
const canvas = document.querySelector('#scene-canvas');
const hero = document.querySelector('#hero');
const dialog = document.querySelector('#scene-dialog');
const sceneInstruction = dialog.querySelector('.scene-instruction');
const exploreButton = document.querySelector('#explore-scene');
const motionButtons = [...document.querySelectorAll('[data-motion-toggle]')];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compactViewport = matchMedia('(max-width: 700px)');
const finePointer = matchMedia('(any-pointer: fine)');
let worker;
let starting = false;
let failed = false;
let heroVisible = true;
let pageVisible = !document.hidden;
let paused = reducedMotion.matches || Boolean(navigator.connection?.saveData);
let manualPause = null;
let pointerFrame;
let latestPointer = [0, 0];
let resizeTimer;
let readinessTimer;

try {
  const savedPreference = localStorage.getItem('oz-scene-paused');
  if (savedPreference !== null) manualPause = savedPreference === 'true';
  if (manualPause !== null && !reducedMotion.matches) paused = manualPause;
} catch { /* Storage is optional; motion controls also work in restricted browsing modes. */ }

function viewport() {
  return { width: innerWidth, height: innerHeight, pixelRatio: devicePixelRatio || 1, compact: compactViewport.matches };
}

function updateMotion() {
  motionButtons.forEach(button => {
    button.setAttribute('data-paused', String(paused));
    button.querySelector('[data-motion-label]').textContent = paused ? 'Play motion' : 'Pause motion';
    button.querySelector('[data-motion-icon]').textContent = paused ? '▷' : 'Ⅱ';
  });
  const running = pageVisible && (dialog.open || (!paused && heroVisible));
  scene.dataset.motion = running && !failed ? 'playing' : 'paused';
  sceneInstruction.textContent = failed ? 'Enjoy the still view.' : 'Move your pointer. Follow the current.';
  worker?.postMessage({ type: 'running', value: running, exploring: dialog.open && finePointer.matches });
  if (running && !worker && !starting && !failed) startScene();
}

function useStillScene(event) {
  failed = true;
  starting = false;
  clearTimeout(readinessTimer);
  worker?.terminate();
  worker = undefined;
  scene.dataset.renderer = 'still';
  scene.dataset.error = event?.data?.reason || event?.message || 'Renderer unavailable';
  scene.dataset.motion = 'unavailable';
  sceneInstruction.textContent = 'Enjoy the still view.';
  motionButtons.forEach(button => { button.hidden = true; });
}

function startScene() {
  if (!('Worker' in window) || !canvas.transferControlToOffscreen) { useStillScene(); return; }
  starting = true;
  try {
    worker = new Worker(new URL('./scene-worker.js?v=3d-14', import.meta.url), { type: 'module', name: 'pelagic-orbit' });
    worker.addEventListener('error', useStillScene);
    worker.addEventListener('message', event => {
      if (event.data.type === 'ready') {
        clearTimeout(readinessTimer);
        starting = false;
        scene.dataset.renderer = 'worker';
        updateMotion();
      }
      if (event.data.type === 'unavailable') useStillScene(event);
      if (event.data.type === 'ship-ready') scene.dataset.ship = 'ready';
      if (event.data.type === 'resolution') {
        scene.dataset.resolution = `${event.data.width}×${event.data.height}`;
        scene.dataset.quality = String(event.data.quality);
        scene.dataset.antialias = String(event.data.samples);
      }
      if (event.data.type === 'performance') {
        scene.dataset.fps = String(event.data.fps);
        scene.dataset.cpuMs = String(event.data.cpuMs);
        scene.dataset.drawCalls = String(event.data.drawCalls);
        scene.dataset.triangles = String(event.data.triangles);
        scene.dataset.elapsed = String(event.data.elapsed);
      }
    });
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({ type: 'init', canvas: offscreen, viewport: viewport(), running: pageVisible && (dialog.open || (!paused && heroVisible)), exploring: dialog.open && finePointer.matches }, [offscreen]);
    readinessTimer = setTimeout(() => useStillScene({ message: 'Scene initialization timed out' }), 15_000);
  } catch (error) { useStillScene(error); }
}

motionButtons.forEach(button => {
  button.hidden = false;
  button.addEventListener('click', () => {
    paused = !paused;
    manualPause = paused;
    try { localStorage.setItem('oz-scene-paused', String(paused)); } catch { /* The current visit still retains the preference. */ }
    updateMotion();
  });
});

exploreButton.hidden = false;
exploreButton.addEventListener('click', () => {
  dialog.showModal();
  document.body.classList.add('is-exploring');
  updateMotion();
});
document.querySelector('#close-scene').addEventListener('click', () => { dialog.close(); });
dialog.addEventListener('close', () => {
  document.body.classList.remove('is-exploring');
  updateMotion();
  exploreButton.focus({ preventScroll: true });
});

new IntersectionObserver(entries => {
  heroVisible = entries[0].isIntersecting && entries[0].intersectionRatio > 0.08;
  updateMotion();
}, { threshold: [0, 0.08] }).observe(hero);

document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; updateMotion(); });
window.addEventListener('pagehide', () => { pageVisible = false; updateMotion(); });
window.addEventListener('pageshow', () => { pageVisible = !document.hidden; updateMotion(); });
reducedMotion.addEventListener('change', event => {
  paused = event.matches || manualPause === true || Boolean(navigator.connection?.saveData);
  updateMotion();
});
finePointer.addEventListener('change', updateMotion);
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { worker?.postMessage({ type: 'resize', viewport: viewport() }); }, 140);
}, { passive: true });
window.addEventListener('pointermove', event => {
  if (!finePointer.matches || event.pointerType === 'touch' || (paused && !dialog.open) || !worker || (!heroVisible && !dialog.open)) return;
  latestPointer = [event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1];
  if (pointerFrame) return;
  pointerFrame = requestAnimationFrame(() => {
    worker?.postMessage({ type: 'pointer', value: latestPointer });
    pointerFrame = undefined;
  });
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => {
  cancelAnimationFrame(pointerFrame);
  pointerFrame = undefined;
  latestPointer = [0, 0];
  worker?.postMessage({ type: 'pointer', value: latestPointer });
});

document.querySelectorAll('[data-email]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', () => {
    const email = button.dataset.email.replace(' at ', '@').replace('_dotcom', '.com').replace('_dotdev', '.dev');
    const link = document.createElement('a');
    link.href = `mailto:${email}`;
    link.className = button.className;
    link.textContent = email;
    link.dataset.revealed = 'true';
    if (button.dataset.testId) link.dataset.testId = button.dataset.testId;
    button.replaceWith(link);
    link.focus({ preventScroll: true });
  });
});

updateMotion();

# Scene development and maintenance

The scene is a real-time Three.js ocean with a ringed planet, bioluminescent manta rays, and a graphite survey vessel. This document covers local development and the rendering details that matter when changing it. [README.md](README.md) contains the personal biography only.

## Run locally

From the repository root, with Python 3 installed:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). Keep the terminal running; Ctrl+C stops the server. If the port is occupied, use another port, such as `4175`, and change the URL accordingly.

Any static HTTP server works. Python is just a convenient option. There is **no build step, package installation, framework, or Blender dependency**. Node.js is needed only for the automated tests. The runtime JavaScript, fonts, and fallback image are included in the repository; the retained YouTube player is external.

Serve the page over HTTP. Opening `index.html` with `file://` cannot reliably load its module worker and imports.

### Preview without HTTP caching

For repeated shader edits, this alternative server sends `Cache-Control: no-store` and handles concurrent module requests:

```sh
python3 -u - <<'PY'
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class PreviewHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

print('Preview: http://127.0.0.1:4173/', flush=True)
ThreadingHTTPServer(('127.0.0.1', 4173), PreviewHandler).serve_forever()
PY
```

Reload after editing. A local server's cache policy does not replace the module-version update needed for publishing changes.

## What to preserve

- Visual quality, atmosphere, and readability take priority over higher frame rates. Preserve the dark blue ocean, cyan bioluminescence, and restrained warm horizon light.
- Keep the ship's scientific, industrial design and dark palette, and the manta rays' existing anatomy and luminous wing patterns. The ship is volumetric geometry with changing views and lighting; a moving flat hull image is not a substitute.
- Keep fine ripples visible on darker wave slopes. Foam should be sparse, softly edged crest froth, without repeated bright marks, broad painted coverage, or large connected bubble outlines.
- Preserve biography text, prominent contact actions, link destinations, and the YouTube video with ID `pYflrrJu9PI`. Scene work does not authorize new visitor-facing copy or edits to existing copy.
- Keep all biography text available on mobile. Reduce non-critical rendering effects only when such a visual tradeoff is explicitly in scope.
- With the renderer available, exploration animates whenever the document is visible, even if the biography's background was paused. Its only interactive control is **Back to the page**; Escape also closes it. Returning restores the biography's motion preference and focus.
- Preserve the independent fallback image and usable HTML when rendering or JavaScript is unavailable.
- Keep technical documentation here, not in the personal README. Local editing and verification must not push or deploy the site.

The target browsers are current desktop Chrome and current iOS Safari. A narrow desktop viewport checks layout, not Safari compatibility or iPhone performance.

## File map

| File | Responsibility |
| --- | --- |
| [index.html](index.html) | Biography, navigation, contact actions, YouTube iframe, fallback image, canvas, and scene dialog |
| [styles.css](styles.css) | Responsive typography/layout, scene overlays, dialog presentation, accessibility, and print rules |
| [js/site.js](js/site.js) | DOM controls, motion preferences, visibility, pointer/resize messages, worker startup/failure, and email reveal |
| [js/scene-worker.js](js/scene-worker.js) | Three.js scene, lighting, camera, object flight paths, reflection pass, frame scheduling, and diagnostics |
| [js/animation-clock.mjs](js/animation-clock.mjs) | 120 fps ceiling, elapsed animation time, and frame-rate-independent easing |
| [js/scene-models.js](js/scene-models.js) | Procedural ship and manta geometry, material batching, particles, ring-density texture, and ocean grid |
| [js/scene-shaders.js](js/scene-shaders.js) | GLSL for sky, planet, rings, ocean, ray deformation/lighting, and particles |
| [js/scene-finish.js](js/scene-finish.js) | Multisampled scene target, small bloom passes, tone mapping, and final output |
| [js/scene-math.mjs](js/scene-math.mjs) | Pixel budgets, responsive framing, and retained poster/crop helpers |
| [assets/pelagic-orbit.jpg](assets/pelagic-orbit.jpg) | Visual reference and independent desktop/mobile fallback |
| [js/vendor/](js/vendor/) | Self-hosted Three.js modules and geometry utilities |
| [tests/](tests/) | Geometry, timing, layout-budget, and local browser checks |

## How rendering works

The renderer uses **WebGL 2**, through `THREE.WebGLRenderer`, with custom GLSL shaders. It does not use WebGPU. Rendering is submitted from a dedicated module worker using a transferred `OffscreenCanvas`; the shaders execute on the graphics backend. Main-thread JavaScript handles page controls and forwards lightweight events. It does not animate the scene through DOM updates or intercept scrolling.

The HTML poster appears independently of JavaScript. When motion can run, `site.js` transfers the canvas and starts the worker. The worker creates its geometry, compiles materials, renders, and reports readiness. CSS then fades in the canvas. The live scene does not sample the poster or load a ship sprite.

Each rendered frame updates time-based poses and shader uniforms. Every other rendered frame also renders a mirrored camera into a reflection texture, with the ocean and nearby motes hidden for that pass. The ocean samples this texture with ripple distortion. The final pass applies tone mapping and the output color conversion; desktop additionally uses small bloom buffers.

### Timing and suspension

`FRAME_INTERVAL_MS` in `animation-clock.mjs` sets an upper limit of **120 fps**, for both wide and compact layouts. The worker uses `requestAnimationFrame` when available and a timer otherwise. The ceiling is not a promise that every display or device can present 120 frames per second.

`createFrameLimiter()` retains fractional frame time and tolerates small presentation-timestamp jitter. Replacing it with a comparison against the previous actual render time can unnecessarily discard frames, especially near the display's refresh rate.

Animation uses the worker's elapsed time in seconds, derived from `performance.now()`. Presentation timestamps control cadence separately. Ship flight, engine animation, wingbeats, tails, waves, and particles use this common time. Camera easing uses `dampingFactor(delta, rate)`.

Do not advance animations by a fixed amount per frame or scale their speed when changing the fps ceiling. Do not clamp ordinary elapsed frame time to a small maximum: that slows motion when frames are dropped. Pause/resume should exclude inactive time through the animation clock instead.

Rendering stops when the document is hidden, when the biography's background is paused, or when the hero is sufficiently out of view. Exploration overrides the biography pause/hero condition, but still respects document visibility. Reduced-motion and data-saving preferences can start the page with its still image. The manual pause preference is stored under `oz-scene-paused` when local storage is available.

### Current rendering budgets

Compact layouts are those at or below `700px` viewport width.

| Setting | Wide layout | Compact layout |
| --- | --- | --- |
| Drawing-buffer pixel budget | Approximately 3,200,000 | Approximately 460,000 |
| Maximum pixel-ratio multiplier | 2 | 1.2 |
| Scene-target MSAA | Up to 4 samples | Up to 2 samples |
| Reflection dimensions | 50% of drawing-buffer width and height | 35% of drawing-buffer width and height |
| Ocean grid | 180 × 180 cells | 100 × 100 cells |
| Manta rays | 5 | 3 |
| Stars / nearby motes | 3,600 / 180 | 1,500 / 70 |
| Bloom | Two quarter-dimension blur passes | Disabled |

The drawing buffer is capped independently of Retina/device pixel density. MSAA is bounded by the GPU's supported sample count. The ocean mesh changes with the compact breakpoint, including after rotation/resizing.

The worker currently keeps `quality = 1`. It does **not** progressively lower resolution to reach the fps ceiling. Preserve image quality when optimizing; reduce redundant work and measure the result at identical settings.

## Editing the scene

### Ocean

`waveHeight()` is shared by the vertex and fragment shaders. It supplies the geometric swells. `detail()` adds smaller ripples for surface shading. The fragment shader derives its normal from screen derivatives of a single height evaluation, avoiding repeated evaluations of the entire wave field around each pixel.

Foam is confined to the higher crests, with continuous density from several scales of isotropic turbulence. Finer detail fades below pixel size. Restrained emission and surface lighting keep it integrated with the water; thresholded, stretched noise islands create conspicuous repeating marks. The subtle `skyFill` contribution also reveals small ripples outside the stronger planetary reflection. Preserve the warm reflection and the sharper blue ripple detail while tuning this fill.

### Ship and rays

`createStarship()` constructs the pressure hull, trusses, radiator panels, centrifuge, sensors, and ion drives. Static geometry is batched by material. The rotating centrifuge and exhaust remain animated. Flight and banking are controlled in `updateObjects()` in the worker.

`createManta()` supplies continuous wings, solid anatomy, eyes/lobes, and an animated tail. Wing deformation and surface patterns live in the manta shaders. Keep outward-facing hull triangles and finite geometry attributes; the geometry tests cover these properties.

### Planet, rings, and camera

The planet's atmospheric rim is shaded on the planet surface. A separately silhouetted shell can introduce an unwanted second circular edge. Ring bands come from the generated, mipmapped radial texture in `createRingProfile()`; filtering matters at shallow angles and small sizes.

`sceneLayout()` controls responsive framing. `updateObjects()` controls the live perspective camera and pointer response. `coverTransform()` and `cameraTransform()` remain in the math module and have tests, but the live Three.js worker does not use them for its camera. The fallback's crop is controlled by CSS `object-position`.

## Color and shader pitfalls

The main multisampled target uses `UnsignedByteType` with `SRGBColorSpace`. This preserves dark-gradient precision while using a compatible MSAA color format. The reflection texture also uses sRGB storage. Bloom targets use half-float where supported and unsigned bytes otherwise.

Keep this distinction when modifying the pipeline. Linear eight-bit scene storage causes visible banding in the dark sky. Floating-point multisampled targets produced bright/dark block artifacts during local testing, so buffer-format changes need visual verification on the target browsers.

Custom shaders include Three.js's tone-mapping and color-space chunks at their output. Intermediate render targets and the final display have different conversion requirements; adding manual gamma correction indiscriminately can apply the conversion twice.

Guard normalization of derivative-based normals against zero length. Clamp dot products before expressions such as `pow(1.0 - dot(...), exponent)` so floating-point rounding cannot create invalid values. Non-finite values can spread through bloom into conspicuous artifacts.

## Module caching

Scene imports carry a shared query-string version such as `?v=3d-12`. Find the current references with:

```sh
rg -n '\?v=3d-' index.html js --glob '!**/vendor/**'
```

When releasing changes to the scene modules, update the version consistently in:

- `index.html`: the `site.js` script URL;
- `js/site.js`: the worker URL;
- `js/scene-worker.js`: its scene-module imports;
- `js/scene-models.js`: its shader-module import.

A reload can otherwise combine a new worker with a cached dependency. Symptoms include missing named exports, old visuals, or a fallback image even though the files on disk are correct. A no-cache local server helps during development; versioned URLs also handle returning visitors on the hosted site.

## Tests and visual verification

From the repository root, using a recent Node.js version:

```sh
node --test tests/*.test.mjs
node --check js/site.js
node --check js/scene-worker.js
node --check js/scene-models.js
node --check js/scene-shaders.js
node --check js/scene-finish.js
node --check js/animation-clock.mjs
node --check js/scene-math.mjs
git diff --check
```

These tests use the vendored Three.js modules without npm installation. They cover finite/volumetric geometry, hull winding, mobile geometry budgets, responsive framing, particle reproducibility, frame limiting across refresh rates, animation speed across frame rates, dropped frames, pause/resume, and matching animated poses after equal elapsed time.

With the server running, open [tests/browser-check.html](http://127.0.0.1:4173/tests/browser-check.html), adjusting the port if necessary. Its buttons exercise the real page:

- **Run checks + five-second frame sample**: worker startup, overflow, pause, exploration, focus restoration, story disclosure, email reveal, video identity, suspension while reading, advancing animation time, and main-thread timing while moving the pointer.
- **Test renderer failure**: initializes an isolated worker with WebGL unavailable and verifies its failure signal.
- **Test without JavaScript**: checks the poster, biography, and readable email fallback in a script-disabled iframe. Reload the check page to restore scripting.

Syntax checks and geometry tests do not compile GLSL or establish visual quality. Inspect the live page after shader changes. Check the whole scene, bright ripples, darker wave faces, foam, ring edges, ship silhouette, ray wingbeats, and reflections at several animation times. For comparisons, use the same viewport, drawing-buffer dimensions, camera pose, and animation time.

Check narrow phones, portrait tablets, and landscape orientation. On an actual iPhone, also check scrolling, rotation, the video, and motion controls. The phone needs a page reachable from that device; a `127.0.0.1` URL on the phone refers to the phone itself.

## Diagnostics and performance measurement

Read the scene's diagnostic attributes in the page's DevTools console:

```js
({ ...document.querySelector('#scene').dataset })
```

| Attribute | Meaning |
| --- | --- |
| `renderer` | `worker` when ready, otherwise `still` |
| `motion` | Current requested motion state; rendering failures also use `unavailable` |
| `ship` | `ready` after scene initialization |
| `resolution` | Actual drawing-buffer dimensions reported by the worker |
| `quality` | Rendering-budget factor; currently kept at `1` |
| `antialias` | Configured scene-target MSAA sample count |
| `fps` | Worker rendering rate over its recent reporting interval |
| `cpuMs` | CPU time spent submitting a frame, not isolated GPU execution time |
| `drawCalls`, `triangles` | Counts for the reported frame, including its render passes |
| `elapsed` | Accumulated animation time in seconds |
| `error` | Startup/rendering failure information, when available |

Performance reports arrive about every two seconds while rendering. Values remain at their last report while paused. Prefer `data-resolution` to inferring the worker's buffer size from the DOM canvas. Draw counts naturally differ between frames with and without the reflection pass and as objects enter/leave the camera's view.

Compare performance with identical resolution, MSAA, visible content, and frame-rate settings. Warm up the renderer, avoid simultaneous competing previews, and repeat measurements in both orders. Display refresh, GPU clock/power state, other applications, and browser visibility can materially change results.

The fps ceiling is not a measure of maximum GPU throughput. Main-thread frame intervals and long tasks indicate page responsiveness; `cpuMs` does not establish GPU cost. For GPU timings, use a profiler or non-blocking `EXT_disjoint_timer_query_webgl2` queries when supported, and discard disjoint results. Do not reduce image quality to make an optimization comparison appear faster.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Still image on initial load | Motion may be paused by preference, reduced motion, or data saving. Try Play motion or exploration before treating it as failure. |
| Still image after motion is requested | Inspect `data-error`, the console, worker errors, and network responses. Startup has a 15-second readiness timeout. |
| Import or MIME errors | Serve the repository root over HTTP. JavaScript URLs must return JavaScript, not an HTML fallback or error page. |
| Changes seem ignored or an export is missing | Check the module-version strings and use the no-cache preview server. |
| Old local URL returns an empty response | Check the serving terminal; restart that preview server or choose another port. |
| Motion stops after scrolling | This is intentional when the hero is out of view. Return to the hero or enter exploration. |
| FPS below 120 | Check display refresh, visibility, power/thermal conditions, and GPU load. The number is a ceiling. |
| Pixelated geometry or blurry rings | Inspect `resolution` and `antialias`, then check ring filtering and output scaling. |
| Sky banding, blocks, or an extra planet rim | Review the color-buffer and atmosphere notes above. |

After fixing a renderer startup failure, reload the page. The failed worker is terminated and the transferred canvas is not reinitialized in place.

## Dependencies, assets, and publishing

`js/vendor/` contains Three.js **0.185.1**, including the minified renderer/core modules and `BufferGeometryUtils.js`. The utility's import points to the local module. Keep [THREE-LICENSE.txt](js/vendor/THREE-LICENSE.txt) with these files. Self-hosted fonts have their licenses in [assets/fonts/](assets/fonts/).

Geometry and the ring profile are generated by JavaScript. Blender is not needed to reproduce or modify the current scene. If Blender-authored assets are introduced later, keep exported runtime assets in the repository so ordinary previews and deployments remain possible without Blender; regenerating those exports can be a separate workflow.

A WebGPU port would require adapting the custom materials and post-processing, followed by fresh visual and performance comparisons. It is not required to run this scene. See the upstream [WebGLRenderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html) and [WebGPU migration guide](https://threejs.org/manual/en/webgpurenderer).

GitHub Pages serves the repository as static files. Preserve `CNAME`, `.nojekyll`, the page, modules, assets, fonts, and linked résumé files. Starting a local server does not publish anything; pushing changes to the configured Pages source can publish them. Keep publishing separate from local verification.

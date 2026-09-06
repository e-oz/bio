# Evgeniy / OZ — Between sea & stars

A personal bio page at [jamm.dev](https://jamm.dev/), hosted on GitHub Pages.

The background combines an animated ocean, orbiting planetary ring debris, bioluminescent manta rays, and one small, distant spacecraft with pulsing engines and a water reflection. “Explore the scene” opens an immersive view; Escape or “Back to the page” returns to the biography.

In the immersive desktop view, moving the pointer pans the camera smoothly. Foreground rays and particles move at different depths. Exploration always animates while the page is visible and has no pause control. Returning to the biography restores the page’s motion preference.

## Run locally

There is no build step, package installation, bundler, or framework.

```sh
python3 -m http.server 4173 --bind 127.0.0.1
```

Open [localhost:4173](http://localhost:4173/). Reload after editing files. Serve the files over HTTP: opening `index.html` through `file://` cannot run the module worker correctly.

Node.js is only needed for the optional unit tests.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Biography, links, native story disclosure, testimonials, YouTube embed, and scene controls |
| `styles.css` | Responsive layout, typography, colors, accessibility, and print styles |
| `js/site.js` | Motion controls, worker lifecycle, immersive dialog, and email reveals |
| `js/scene-worker.js` | WebGL 2 scene and animation, entirely in a dedicated worker |
| `js/space-shaders.js` | Spacecraft flight, engine exhaust, water reflection, and orbiting ring debris |
| `js/scene-math.mjs` | Drawing-buffer budget and image crop calculations |
| `assets/pelagic-orbit.jpg` | Shared desktop and mobile open-ocean environment image |
| `assets/exploration-frigate.webp` | Transparent spacecraft hull, approximately 151 KiB |
| `assets/exploration-frigate-mobile.webp` | Smaller spacecraft texture, approximately 61 KiB |
| `assets/fonts/` | Self-hosted Instrument Serif and Manrope fonts, with their licenses |
| `tests/` | Unit tests and a local browser-check page |
| `CNAME` | Existing `jamm.dev` custom domain |
| `.nojekyll` | Serve the repository as plain static files without Jekyll processing |
| `resume.pdf`, `cv.docx` | Existing résumé documents |

React, ReactDOM, browser-side Babel, JSX, and remote font requests have been removed. There are no third-party JavaScript dependencies in the page’s own code. The retained YouTube iframe loads YouTube’s own scripts when it approaches the viewport.

## Rendering and performance

The HTML and a responsive image appear independently of JavaScript. When supported, `site.js` transfers the canvas to a module worker through [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas). The worker decodes the local environment image, compiles a small set of WebGL shaders, and animates the scene.

- Desktop motion targets 30 frames per second; narrow layouts target 24.
- Drawing buffers are capped at approximately 1.45 million pixels on desktop and 460,000 pixels on narrow screens, regardless of Retina resolution.
- Sustained slow frames reduce the rendering resolution further.
- Rendering stops while the document is hidden or the visitor reads beyond the hero. The page’s pause control stops its background. Entering the immersive view starts animation until the visitor returns to the page.
- The system’s reduced-motion preference and the browser’s data-saving preference start with a still scene. Visitors can explicitly enable motion. Manual pause preferences are stored locally when storage is available.
- Main-thread JavaScript responds to controls and forwards lightweight pointer/resize events. It does not continuously animate page elements or intercept scrolling.
- Worker, WebGL, texture-loading, or context failures leave the static environment visible. The biography remains usable.
- Fonts and environment images are served locally. The YouTube player uses native lazy loading and preserves video `pYflrrJu9PI`.
- The ship uses a transparent hull texture with procedural exhaust, flight, and reflection. The rays are deforming meshes with surface lighting. Ring particles orbit at different speeds and disappear behind the planet and horizon. Mobile shares the same ocean image and uses a smaller ship texture, fewer particles, and a single ship.

The phone crop keeps the planet in view. Content switches to a single column, with a responsive 16:9 video and no mobile-only removal of biography text.

Target browsers are current desktop Chrome and current iOS Safari. Feature detection provides a still scene if rendering is unavailable. Physical iOS Safari performance must still be checked on an iPhone; a desktop viewport simulation is not a hardware or Safari-engine test.

## Editing

Edit biography text directly in `index.html`. Links, headings, articles, and testimonials are semantic HTML. The story uses `<details>` and works without JavaScript. Employer testimonials are preserved verbatim, apart from whitespace and surrounding presentation.

The palette and main layout values are centralized at the start of `styles.css`. The imagery’s desktop and mobile focal points must match the values in `coverTransform()` if the composition changes.

Email buttons use obfuscated strings in `data-email`. JavaScript converts them into keyboard-focusable `mailto:` links on request. This is light obfuscation, not protection against a determined scraper. Without JavaScript, a readable obfuscated address is provided.

## Verify

Run the dependency-free geometry and rendering-budget tests with a recent Node.js version:

```sh
node --test tests/scene-math.test.mjs
node --check js/site.js
node --check js/scene-worker.js
node --check js/space-shaders.js
```

With the local server running, open [the browser checks](http://localhost:4173/tests/browser-check.html). “Run checks” exercises the real page’s worker, pause control, immersive dialog, focus restoration, story, email reveal, video identity, and suspension while reading. It then samples main-thread frame intervals and long tasks for five seconds while moving the pointer through the immersive scene. “Test renderer failure” verifies the worker’s unavailable-renderer signal with WebGL disabled in an isolated worker. “Test without JavaScript” reloads the page in a sandbox that disables scripting and verifies the static content and email fallback.

These checks are local developer tools and do not load on the public page. Frame timings depend on the browser, display refresh rate, hardware, background activity, and whether the tab is visible.

Before publishing, also inspect the page on an actual iPhone: scroll from top to bottom, rotate the phone, use the video, and toggle motion. Check keyboard navigation and reduced motion on desktop.

## GitHub Pages

The site remains a collection of files served from the repository root. It needs no special server, secrets, npm build, or deployment workflow. Keep `CNAME`, the HTML, stylesheet, JavaScript modules, local images, fonts, and résumé together. Relative asset paths work with the existing custom domain.

Review the local changes before committing or pushing. Pushing to the configured GitHub Pages source can publish the site; no push or deployment is performed by the local preview or tests.

import { cameraTransform, coverTransform, drawingSize } from './scene-math.mjs';
import { ringFragmentSource, ringVertexSource, shipFragmentSource, shipVertexSource } from './space-shaders.js';

const vertexSource = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const oceanSource = `#version 300 es
precision highp float;
uniform sampler2D uImage;
uniform vec4 uCover;
uniform vec3 uCamera;
uniform vec2 uResolution;
uniform float uTime;
in vec2 vUv;
out vec4 fragColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void main() {
  vec2 cameraUv = (vUv - 0.5) * uCamera.x + 0.5 + uCamera.yz;
  vec2 uv = cameraUv * uCover.xy + uCover.zw;
  // Keep the horizon still while the foreground current moves in several directions.
  float sea = smoothstep(0.65, 0.98, uv.y);
  vec2 current = vec2(
    sin(uv.y * 154.0 - uTime * 1.65 + sin(uv.x * 28.0 + uTime * 0.42)) * 0.0064 + sin(uv.x * 74.0 + uv.y * 84.0 - uTime * 1.2) * 0.0022,
    sin(uv.x * 72.0 + uv.y * 92.0 - uTime * 1.35) * 0.0028 + sin(uv.y * 167.0 + uTime * 0.8) * 0.001
  ) * sea * uCover.xy;
  vec3 color = texture(uImage, clamp(uv + current, 0.001, 0.999)).rgb;
  float glow = max(0.0, color.b - color.r) * sea;
  float pulse = 0.6 + 0.4 * sin(uv.x * 37.0 + uv.y * 91.0 - uTime * 1.7 + sin(uv.x * 18.0 - uTime * 0.4));
  float crest = smoothstep(0.04, 0.20, glow) * pulse;
  color *= 1.0 + sea * sin(uv.y * 81.0 - uTime * 1.4) * 0.07;
  color += vec3(0.02, 0.32, 0.43) * glow * pulse + vec3(0.025, 0.14, 0.19) * crest;
  vec2 ringDistance = (uv - vec2(0.712, 0.281)) * vec2(1.777, 1.0);
  vec2 ringPlane = vec2(dot(ringDistance, vec2(0.932, -0.362)), dot(ringDistance, vec2(0.362, 0.932)) / 0.105);
  float ringRadius = length(ringPlane);
  float ringMask = smoothstep(0.285, 0.305, ringRadius) * (1.0 - smoothstep(0.415, 0.438, ringRadius));
  ringMask *= ringPlane.y < 0.0 ? smoothstep(0.187, 0.193, length(ringDistance + vec2(0.0178, -0.002))) : 1.0;
  float ringFlow = pow(0.5 + 0.5 * cos(atan(ringPlane.y, ringPlane.x) * 21.0 - uTime * 0.7 + ringRadius * 35.0), 8.0);
  color += vec3(0.17, 0.23, 0.29) * ringMask * ringFlow * smoothstep(0.06, 0.30, color.b) * 0.26;
  // Sparse stars brighten and fade without moving the painted star field.
  vec2 grid = cameraUv * vec2(220.0, 220.0 * uResolution.y / uResolution.x);
  vec2 cell = floor(grid);
  vec2 point = fract(grid) - vec2(hash(cell), hash(cell + 17.0));
  float star = exp(-dot(point, point) * 950.0) * step(0.987, hash(cell + 37.0));
  star *= (0.25 + 0.75 * pow(0.5 + 0.5 * sin(uTime * 0.65 + hash(cell) * 50.0), 3.0));
  color += vec3(0.55, 0.78, 0.88) * star * (1.0 - smoothstep(0.50, 0.65, uv.y));
  fragColor = vec4(color, 1.0);
}`;

const rayVertexSource = `#version 300 es
precision highp float;
in vec3 aParameter;
uniform float uTime;
uniform float uPhase;
uniform float uScale;
uniform vec2 uOrigin;
uniform float uAspect;
uniform float uPixelRatio;
uniform vec2 uPointer;
uniform float uExploration;
out vec3 vParameter;
out vec3 vSurfacePosition;
void main() {
  float span = aParameter.x;
  float along = aParameter.y;
  float wing = abs(span);
  float phase = uTime * 1.2 + uPhase;
  float front = 0.17 + 0.55 * (1.0 - pow(wing, 0.8));
  front += exp(-pow((wing - 0.13) * 28.0, 2.0)) * 0.10 - exp(-span * span * 400.0) * 0.035;
  float back = -0.42 * (1.0 - pow(wing, 0.48)) + 0.17 * wing;
  float z = mix(back, front, along);
  float x = span;
  float y = sin(phase - wing * 2.8 + along * 0.6 * (1.0 - wing)) * pow(wing, 1.4) * 0.29;
  y += 0.11 * exp(-span * span * 22.0) * sin(along * 3.14159);
  if (aParameter.z > 0.5) {
    z = -0.4 - along * 1.6;
    x = sin(phase - along * 3.0) * along * along * 0.11;
    y = sin(phase - along * 4.0) * along * 0.045;
  }
  float yaw = -0.38 + sin(uTime * 0.12 + uPhase) * 0.17;
  vec2 plane = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * vec2(x, z);
  vec2 position = vec2(plane.x, plane.y * 0.57 + y);
  position *= vec2(uScale * 2.0, uScale * 2.0 * uAspect);
  vec2 drift = vec2(sin(uTime * 0.095 + uPhase) * 0.1, sin(uTime * 0.13 + uPhase) * 0.035);
  vec2 cameraDrift = vec2(-uPointer.x, uPointer.y) * (0.009 + uExploration * (0.055 + uScale * 0.5));
  gl_Position = vec4(position + uOrigin + drift + cameraDrift, 0.0, 1.0);
  gl_PointSize = (1.8 + 0.9 * (0.5 + 0.5 * sin(span * 33.0 + along * 19.0 + phase))) * uPixelRatio;
  vParameter = aParameter;
  vSurfacePosition = vec3(plane.x, y, plane.y);
}`;

const rayFragmentSource = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uPhase;
uniform int uPoints;
uniform float uOpacity;
in vec3 vParameter;
in vec3 vSurfacePosition;
out vec4 fragColor;
void main() {
  float edge = pow(abs(vParameter.x), 8.0) + pow(abs(vParameter.y * 2.0 - 1.0), 25.0);
  float body = exp(-vParameter.x * vParameter.x * 26.0);
  float veins = pow(0.5 + 0.5 * cos(abs(vParameter.x) * 72.0 + sin(vParameter.y * 4.0) * 3.8), 24.0);
  float pulse = 0.66 + 0.34 * sin(vParameter.y * 7.0 - uTime * 1.2 + uPhase);
  float eyes = exp(-pow((abs(vParameter.x) - 0.115) * 90.0, 2.0) - pow((vParameter.y - 0.94) * 65.0, 2.0));
  vec3 normal = vec3(0.0, 1.0, 0.0);
  if (uPoints == 0 && vParameter.z < 0.5) normal = normalize(cross(dFdx(vSurfacePosition), dFdy(vSurfacePosition)));
  float lighting = 0.30 + 0.70 * abs(dot(normal, normalize(vec3(-0.5, 0.8, -0.4))));
  float grazing = pow(1.0 - abs(dot(normal, normalize(vec3(0.0, 0.7, 0.7)))), 3.0);
  vec3 biolight = mix(vec3(0.05, 0.70, 0.93), vec3(0.61, 1.0, 0.80), body);
  vec3 color = mix(vec3(0.015, 0.07, 0.12), vec3(0.045, 0.18, 0.22), body) * lighting;
  color += biolight * (edge * 0.6 + veins * 0.08 + body * 0.10 + grazing * 0.17) * pulse;
  color += vec3(0.77, 1.0, 0.92) * eyes;
  float alpha = 0.56 + body * 0.32 + edge * 0.12;
  if (uPoints == 1) {
    float spot = fract(sin(dot(floor(vParameter.xy * vec2(64.0, 20.0)), vec2(127.1, 311.7))) * 43758.5453);
    if (spot < 0.85 && edge < 0.4) discard;
    vec2 point = gl_PointCoord - 0.5;
    alpha = exp(-dot(point, point) * 17.0) * (0.32 + edge * 0.35) * pulse;
    color = biolight;
  }
  if (vParameter.z > 0.5) { alpha = 0.56 * (1.0 - vParameter.y); color = biolight; }
  fragColor = vec4(color, alpha * uOpacity);
}`;

const particleVertexSource = `#version 300 es
precision highp float;
in vec4 aParticle;
uniform float uTime;
uniform vec2 uPointer;
uniform float uExploration;
uniform float uPixelRatio;
out float vAlpha;
void main() {
  float x = fract(aParticle.x + uTime * (0.001 + aParticle.z * 0.0018));
  float y = 0.62 + fract(aParticle.y - uTime * 0.004 * aParticle.z) * 0.4;
  x += sin(uTime * 0.13 + aParticle.w) * 0.012;
  vec2 cameraDrift = vec2(-uPointer.x, uPointer.y) * (aParticle.z * 0.018 + uExploration * (0.065 + aParticle.z * 0.12));
  gl_Position = vec4(vec2(x * 2.0 - 1.0, 1.0 - y * 2.0) + cameraDrift, 0.0, 1.0);
  gl_PointSize = (1.0 + aParticle.z * 2.0) * uPixelRatio;
  vAlpha = (0.2 + 0.4 * aParticle.z) * pow(0.5 + 0.5 * sin(uTime * 0.65 + aParticle.w), 2.0);
}`;

const particleFragmentSource = `#version 300 es
precision highp float;
in float vAlpha;
out vec4 fragColor;
void main() {
  vec2 point = gl_PointCoord - 0.5;
  fragColor = vec4(0.35, 0.87, 0.83, exp(-dot(point, point) * 19.0) * vAlpha);
}`;

let canvas;
let gl;
let ocean;
let rays;
let particles;
let ringDust;
let ship;
let shipTexture;
let shipImageAspect = 1.5;
let imageSize;
let viewport;
let running = false;
let initialized = false;
let timer;
let elapsed = 6;
let previousTime = 0;
let pointer = [0, 0];
let targetPointer = [0, 0];
let exploration = 0;
let targetExploration = 0;
let quality = 1;
let slowFrames = 0;
let frameInterval = 1000 / 30;
let rayIndexCount = 0;
let rayVertexCount = 0;
let rayTailStart = 0;
let particleCount = 0;
let ringCount = 0;

function program(vertex, fragment, attributes, uniforms) {
  const shaders = [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]].map(([type, source]) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  });
  const handle = gl.createProgram();
  shaders.forEach(shader => gl.attachShader(handle, shader));
  gl.linkProgram(handle);
  if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle));
  shaders.forEach(shader => gl.deleteShader(shader));
  return {
    handle,
    attributes: Object.fromEntries(attributes.map(name => [name, gl.getAttribLocation(handle, name)])),
    uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(handle, name)])),
    vertexArray: gl.createVertexArray(),
  };
}

function attribute(programInfo, name, values, size) {
  gl.bindVertexArray(programInfo.vertexArray);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(programInfo.attributes[name]);
  gl.vertexAttribPointer(programInfo.attributes[name], size, gl.FLOAT, false, 0, 0);
}

async function loadShip() {
  const imageUrl = new URL(viewport.compact ? '../assets/exploration-frigate-mobile.webp' : '../assets/exploration-frigate.webp', import.meta.url);
  const response = await fetch(imageUrl);
  if (!response.ok) return;
  const bitmap = await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none' });
  if (gl.isContextLost()) { bitmap.close(); return; }
  shipImageAspect = bitmap.width / bitmap.height;
  shipTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, shipTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
  bitmap.close();
  gl.activeTexture(gl.TEXTURE0);
  postMessage({ type: 'ship-ready' });
  if (initialized && !running) draw();
}

function resize() {
  if (!gl || !imageSize) return;
  const size = drawingSize(viewport.width, viewport.height, viewport.pixelRatio, viewport.compact, quality);
  canvas.width = size.width;
  canvas.height = size.height;
  gl.viewport(0, 0, size.width, size.height);
  gl.useProgram(ocean.handle);
  gl.uniform4fv(ocean.uniforms.uCover, coverTransform(viewport.width, viewport.height, imageSize.width, imageSize.height, viewport.compact));
  gl.uniform2f(ocean.uniforms.uResolution, size.width, size.height);
  frameInterval = 1000 / (viewport.compact ? 24 : 30);
}

function draw() {
  const started = performance.now();
  const frameDuration = previousTime ? started - previousTime : frameInterval;
  if (running && previousTime) elapsed += Math.min(frameDuration / 1000, 0.1);
  previousTime = started;
  const seconds = Math.min(frameDuration / 1000, 0.1);
  exploration += (targetExploration - exploration) * (1 - Math.exp(-seconds / 0.3));
  const response = 1 - Math.exp(-seconds / (0.55 - exploration * 0.37));
  pointer = pointer.map((value, index) => value + (targetPointer[index] - value) * response);
  gl.disable(gl.BLEND);
  gl.useProgram(ocean.handle);
  gl.bindVertexArray(ocean.vertexArray);
  gl.uniform1f(ocean.uniforms.uTime, elapsed);
  gl.uniform3fv(ocean.uniforms.uCamera, cameraTransform(pointer, exploration));
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
  gl.useProgram(ringDust.handle);
  gl.bindVertexArray(ringDust.vertexArray);
  gl.uniform1f(ringDust.uniforms.uTime, elapsed);
  gl.uniform4fv(ringDust.uniforms.uCover, coverTransform(viewport.width, viewport.height, imageSize.width, imageSize.height, viewport.compact));
  gl.uniform3fv(ringDust.uniforms.uCamera, cameraTransform(pointer, exploration));
  gl.uniform1f(ringDust.uniforms.uImageAspect, imageSize.width / imageSize.height);
  gl.uniform1f(ringDust.uniforms.uPixelRatio, canvas.width / viewport.width);
  gl.drawArrays(gl.POINTS, 0, viewport.compact ? Math.floor(ringCount * 0.45) : ringCount);

  if (shipTexture) {
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(ship.handle);
    gl.bindVertexArray(ship.vertexArray);
    gl.uniform1i(ship.uniforms.uShipImage, 1);
    gl.uniform1f(ship.uniforms.uTime, elapsed);
    gl.uniform1f(ship.uniforms.uAspect, viewport.width / viewport.height);
    gl.uniform1f(ship.uniforms.uImageAspect, shipImageAspect);
    gl.uniform1f(ship.uniforms.uCompact, viewport.compact ? 1 : 0);
    gl.uniform2fv(ship.uniforms.uPointer, pointer);
    gl.uniform1f(ship.uniforms.uExploration, exploration);
    gl.uniform1i(ship.uniforms.uReflection, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.uniform1i(ship.uniforms.uReflection, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  gl.useProgram(rays.handle);
  gl.bindVertexArray(rays.vertexArray);
  gl.uniform1f(rays.uniforms.uTime, elapsed);
  gl.uniform1f(rays.uniforms.uAspect, viewport.width / viewport.height);
  gl.uniform1f(rays.uniforms.uPixelRatio, canvas.width / viewport.width);
  gl.uniform2fv(rays.uniforms.uPointer, pointer);
  gl.uniform1f(rays.uniforms.uExploration, exploration);
  const school = viewport.compact ? [[0.02, -0.58, 0.22, 0.0, 0.95], [0.54, -0.30, 0.11, 3.4, 0.58]] : [[0.46, -0.54, 0.155, 0.0, 0.95], [-0.12, -0.69, 0.087, 3.4, 0.72], [0.81, -0.20, 0.052, 1.9, 0.60]];
  for (const [x, y, scale, phase, opacity] of school) {
    gl.uniform2f(rays.uniforms.uOrigin, x, y);
    gl.uniform1f(rays.uniforms.uScale, scale);
    gl.uniform1f(rays.uniforms.uPhase, phase);
    gl.uniform1f(rays.uniforms.uOpacity, opacity);
    gl.uniform1i(rays.uniforms.uPoints, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawElements(gl.TRIANGLES, rayIndexCount, gl.UNSIGNED_SHORT, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.LINE_STRIP, rayTailStart, 45);
    gl.uniform1i(rays.uniforms.uPoints, 1);
    gl.drawArrays(gl.POINTS, 0, rayVertexCount);
  }

  gl.useProgram(particles.handle);
  gl.bindVertexArray(particles.vertexArray);
  gl.uniform1f(particles.uniforms.uTime, elapsed);
  gl.uniform2fv(particles.uniforms.uPointer, pointer);
  gl.uniform1f(particles.uniforms.uExploration, exploration);
  gl.uniform1f(particles.uniforms.uPixelRatio, canvas.width / viewport.width);
  gl.drawArrays(gl.POINTS, 0, viewport.compact ? Math.min(particleCount, 90) : particleCount);

  // Sustained slow frames lower resolution; quality never oscillates during a visit.
  if (running && frameDuration > frameInterval * 1.8) slowFrames += 1;
  const duration = performance.now() - started;
  if (duration > frameInterval * 0.65) slowFrames += 1;
  else slowFrames = Math.max(0, slowFrames - 0.15);
  if (slowFrames > 18 && quality > 0.5) {
    quality = Math.max(0.5, quality * 0.75);
    slowFrames = 0;
    resize();
  }
  if (running) timer = setTimeout(draw, Math.max(0, frameInterval - duration));
}

function setRunning(value) {
  running = value;
  clearTimeout(timer);
  previousTime = 0;
  if (initialized && running) draw();
}

async function initialize(data) {
  canvas = data.canvas;
  viewport = data.viewport;
  running = data.running;
  targetExploration = data.exploring ? 1 : 0;
  gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL 2 is unavailable.');
  canvas.addEventListener('webglcontextlost', () => { setRunning(false); postMessage({ type: 'unavailable' }); });
  ocean = program(vertexSource, oceanSource, ['aPosition'], ['uImage', 'uCover', 'uCamera', 'uTime', 'uResolution']);
  attribute(ocean, 'aPosition', [-1, -1, 3, -1, -1, 3], 2);
  rays = program(rayVertexSource, rayFragmentSource, ['aParameter'], ['uTime', 'uPhase', 'uScale', 'uOrigin', 'uAspect', 'uPixelRatio', 'uPointer', 'uExploration', 'uPoints', 'uOpacity']);
  const vertices = [];
  const indices = [];
  const columns = 64;
  const rows = 20;
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      vertices.push(column / columns * 2 - 1, row / rows, 0);
      if (row < rows && column < columns) {
        const index = row * (columns + 1) + column;
        indices.push(index, index + 1, index + columns + 1, index + 1, index + columns + 2, index + columns + 1);
      }
    }
  }
  rayVertexCount = vertices.length / 3;
  rayTailStart = rayVertexCount;
  for (let segment = 0; segment < 45; segment += 1) vertices.push(0, segment / 44, 1);
  attribute(rays, 'aParameter', vertices, 3);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
  rayIndexCount = indices.length;
  particles = program(particleVertexSource, particleFragmentSource, ['aParticle'], ['uTime', 'uPointer', 'uExploration', 'uPixelRatio']);
  const particleData = Array.from({ length: 220 }, (_, index) => [Math.abs(Math.sin(index * 127.1) * 43758.54) % 1, Math.abs(Math.sin(index * 311.7) * 29172.34) % 1, 0.2 + (index % 9) / 11, index * 2.4]).flat();
  particleCount = particleData.length / 4;
  attribute(particles, 'aParticle', particleData, 4);
  ringDust = program(ringVertexSource, ringFragmentSource, ['aRing'], ['uTime', 'uCover', 'uCamera', 'uImageAspect', 'uPixelRatio']);
  const ringData = Array.from({ length: 2400 }, (_, index) => [
    (Math.abs(Math.sin(index * 173.3) * 43178.2) % 1) * Math.PI * 2,
    Math.abs(Math.sin(index * 283.7) * 29172.34) % 1,
    Math.abs(Math.sin(index * 43.9) * 15932.73) % 1,
    Math.abs(Math.sin(index * 91.3) * 31331.17) % 1,
  ]).flat();
  ringCount = ringData.length / 4;
  attribute(ringDust, 'aRing', ringData, 4);
  ship = program(shipVertexSource, shipFragmentSource, ['aUv'], ['uTime', 'uAspect', 'uImageAspect', 'uCompact', 'uPointer', 'uExploration', 'uReflection', 'uShipImage']);
  attribute(ship, 'aUv', [-0.08, -0.10, 1.36, -0.10, -0.08, 1.10, -0.08, 1.10, 1.36, -0.10, 1.36, 1.10], 2);
  const response = await fetch(data.imageUrl);
  if (!response.ok) throw new Error('The scene image could not be loaded.');
  const bitmap = await createImageBitmap(await response.blob());
  imageSize = { width: bitmap.width, height: bitmap.height };
  const texture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, bitmap);
  bitmap.close();
  resize();
  gl.useProgram(ocean.handle);
  gl.uniform1i(ocean.uniforms.uImage, 0);
  initialized = true;
  draw();
  postMessage({ type: 'ready' });
  loadShip().catch(() => { /* The ocean remains available if the additional texture cannot load. */ });
}

self.addEventListener('message', event => {
  const data = event.data;
  if (data.type === 'init') initialize(data).catch(error => { setRunning(false); postMessage({ type: 'unavailable', reason: error.message }); });
  if (data.type === 'running') {
    targetExploration = data.exploring ? 1 : 0;
    setRunning(data.value);
  }
  if (data.type === 'pointer') targetPointer = data.value;
  if (data.type === 'resize') {
    viewport = data.viewport;
    resize();
    if (initialized && !running) draw();
  }
});

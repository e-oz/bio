import { cameraTransform, coverTransform, drawingSize } from './scene-math.mjs';

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
  float sea = smoothstep(0.65, 1.0, uv.y);
  vec2 current = vec2(
    sin(uv.y * 156.0 - uTime * 0.8 + sin(uv.x * 31.0 + uTime * 0.22)) * 0.0021,
    sin(uv.x * 108.0 + uv.y * 51.0 - uTime * 0.48) * 0.0009
  ) * sea;
  vec3 color = texture(uImage, clamp(uv + current, 0.001, 0.999)).rgb;
  float glow = max(0.0, color.b - color.r) * sea;
  float pulse = 0.6 + 0.4 * sin(uv.x * 29.0 + uv.y * 81.0 - uTime * 0.7);
  color += vec3(0.02, 0.24, 0.22) * glow * pulse;
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
void main() {
  float span = aParameter.x;
  float along = aParameter.y;
  float wing = abs(span);
  float phase = uTime * 1.05 + uPhase;
  float front = 0.17 + 0.55 * (1.0 - pow(wing, 0.8));
  float back = -0.42 * (1.0 - pow(wing, 0.48)) + 0.17 * wing;
  float z = mix(back, front, along);
  float x = span;
  float y = sin(phase - wing * 3.2 + along * 0.6) * pow(wing, 1.55) * 0.23;
  y += 0.05 * (1.0 - wing) * sin(along * 3.14159);
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
  gl_PointSize = (1.2 + 0.7 * (0.5 + 0.5 * sin(span * 33.0 + along * 19.0 + phase))) * uPixelRatio;
  vParameter = aParameter;
}`;

const rayFragmentSource = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uPhase;
uniform int uPoints;
uniform float uOpacity;
in vec3 vParameter;
out vec4 fragColor;
void main() {
  float edge = pow(abs(vParameter.x), 8.0) + pow(abs(vParameter.y * 2.0 - 1.0), 25.0);
  float body = exp(-vParameter.x * vParameter.x * 90.0);
  float veins = pow(0.5 + 0.5 * cos(vParameter.x * 63.0 + sin(vParameter.y * 3.0) * 2.0), 24.0) * 0.025;
  float pulse = 0.65 + 0.35 * sin(vParameter.y * 8.0 - uTime * 1.05 + uPhase);
  float eyes = exp(-pow((abs(vParameter.x) - 0.075) * 110.0, 2.0) - pow((vParameter.y - 0.92) * 110.0, 2.0));
  float alpha = (0.055 + edge * 0.45 + veins + body * 0.13 + eyes) * pulse;
  if (uPoints == 1) {
    vec2 point = gl_PointCoord - 0.5;
    alpha = exp(-dot(point, point) * 17.0) * (0.07 + edge * 0.35) * pulse;
  }
  if (vParameter.z > 0.5) alpha = 0.28 * (1.0 - vParameter.y);
  fragColor = vec4(mix(vec3(0.13, 0.68, 0.79), vec3(0.66, 1.0, 0.86), edge * 0.6), alpha * uOpacity);
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
  gl.useProgram(rays.handle);
  gl.bindVertexArray(rays.vertexArray);
  gl.uniform1f(rays.uniforms.uTime, elapsed);
  gl.uniform1f(rays.uniforms.uAspect, viewport.width / viewport.height);
  gl.uniform1f(rays.uniforms.uPixelRatio, canvas.width / viewport.width);
  gl.uniform2fv(rays.uniforms.uPointer, pointer);
  gl.uniform1f(rays.uniforms.uExploration, exploration);
  const school = viewport.compact ? [[0.40, -0.39, 0.20, 0.0, 0.75], [-0.34, -0.62, 0.105, 3.4, 0.4]] : [[0.48, -0.40, 0.125, 0.0, 0.78], [0.11, -0.60, 0.073, 3.4, 0.48], [0.79, -0.15, 0.041, 1.9, 0.38]];
  for (const [x, y, scale, phase, opacity] of school) {
    gl.uniform2f(rays.uniforms.uOrigin, x, y);
    gl.uniform1f(rays.uniforms.uScale, scale);
    gl.uniform1f(rays.uniforms.uPhase, phase);
    gl.uniform1f(rays.uniforms.uOpacity, opacity);
    gl.uniform1i(rays.uniforms.uPoints, 0);
    gl.drawElements(gl.TRIANGLES, rayIndexCount, gl.UNSIGNED_SHORT, 0);
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

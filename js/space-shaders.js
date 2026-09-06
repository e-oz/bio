export const shipVertexSource = `#version 300 es
precision highp float;
precision highp int;
in vec2 aUv;
uniform float uTime;
uniform float uAspect;
uniform float uImageAspect;
uniform float uCompact;
uniform vec2 uPointer;
uniform float uExploration;
uniform int uReflection;
out vec2 vUv;
out float vOpacity;
void main() {
  vUv = aUv;
  float progress = fract(uTime / 120.0 + 0.18);
  float width = mix(0.098, 0.176, uCompact);
  vec2 center = vec2(0.99 - progress * 0.88, 0.43 + sin(uTime * 0.12) * 0.008);
  center = mix(center, vec2(0.82 - progress * 0.28, 0.57 + sin(uTime * 0.10) * 0.012), uCompact);
  vOpacity = smoothstep(0.0, 0.10, progress) * (1.0 - smoothstep(0.87, 1.0, progress));
  float bank = -0.02 + sin(uTime * 0.075) * 0.026;
  vec2 plane = vec2(aUv.x - 0.5, (0.5 - aUv.y) / uImageAspect);
  plane = mat2(cos(bank), -sin(bank), sin(bank), cos(bank)) * plane;
  if (uReflection == 1) {
    center.y = mix(0.82, 0.91, uCompact);
    plane.y *= -0.55;
    vOpacity *= 0.17;
  }
  vec2 cameraDrift = vec2(-uPointer.x, uPointer.y) * (0.0024 + uExploration * 0.028);
  gl_Position = vec4(vec2(center.x * 2.0 - 1.0, 1.0 - center.y * 2.0) + plane * vec2(width * 2.0, width * uAspect * 2.0) + cameraDrift, 0.0, 1.0);
}`;

export const shipFragmentSource = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uShipImage;
uniform float uTime;
uniform int uReflection;
in vec2 vUv;
in float vOpacity;
out vec4 fragColor;
vec2 engine(vec2 uv, vec2 origin, float phase) {
  vec2 relative = uv - origin;
  float along = dot(relative, normalize(vec2(1.0, -0.28)));
  float across = dot(relative, normalize(vec2(0.28, 1.0)));
  float pulse = 0.82 + 0.12 * sin(uTime * 5.0 + phase) + 0.06 * sin(uTime * 13.0);
  float glow = exp(-dot(relative, relative) * 1550.0) * pulse;
  float width = 0.003 + max(along, 0.0) * 0.043;
  float plume = exp(-across * across / (width * width)) * smoothstep(-0.006, 0.006, along) * (1.0 - smoothstep(0.06, 0.30, along));
  plume *= pulse * (0.75 + 0.25 * sin(along * 125.0 - uTime * 11.0 + phase));
  return vec2(glow, plume);
}
void main() {
  vec2 uv = vUv;
  if (uReflection == 1) {
    uv.x += sin(vUv.y * 112.0 - uTime * 2.4) * 0.011 + sin(vUv.y * 49.0 + uTime) * 0.012;
  }
  vec4 hull = vec4(0.0);
  if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) hull = texture(uShipImage, uv);
  vec2 exhaust = engine(uv, vec2(0.870, 0.274), 0.0) + engine(uv, vec2(0.972, 0.416), 2.4);
  float emission = max(0.0, hull.b - hull.r * 0.6) * smoothstep(0.6, 0.95, hull.b);
  vec3 lighting = vec3(0.77, 0.86, 0.94) + sin(uTime * 0.17) * 0.025;
  vec3 color = hull.rgb * lighting * hull.a + vec3(0.12, 0.61, 1.0) * (exhaust.x * 0.58 + exhaust.y * 0.72);
  color += vec3(0.48, 0.86, 1.0) * emission * (0.14 + 0.12 * sin(uTime * 4.2));
  float alpha = min(1.0, hull.a + exhaust.x * 0.33 + exhaust.y * 0.58);
  if (uReflection == 1) {
    float ripple = 0.18 + 0.82 * pow(0.5 + 0.5 * sin(vUv.y * 240.0 + sin(vUv.x * 47.0) * 4.0 - uTime * 2.4), 3.0);
    color *= vec3(0.36, 0.77, 1.0) * ripple;
    alpha *= ripple;
  }
  fragColor = vec4(color * vOpacity, alpha * vOpacity);
}`;

export const ringVertexSource = `#version 300 es
precision highp float;
in vec4 aRing;
uniform float uTime;
uniform vec4 uCover;
uniform vec3 uCamera;
uniform float uImageAspect;
uniform float uPixelRatio;
out float vAlpha;
out float vWarmth;
void main() {
  float radius = 0.293 + aRing.y * 0.14;
  float angle = aRing.x + uTime * 0.038 * pow(0.35 / radius, 1.5);
  vec2 orbit = vec2(cos(angle) * radius, sin(angle) * radius * 0.105);
  vec2 major = vec2(0.932, -0.362);
  vec2 minor = vec2(0.362, 0.932);
  vec2 distance = major * orbit.x + minor * orbit.y;
  vec2 uv = vec2(0.712, 0.281) + distance / vec2(uImageAspect, 1.0);
  vec2 screen = ((uv - uCover.zw) / uCover.xy - 0.5 - uCamera.yz) / uCamera.x + 0.5;
  gl_Position = vec4(screen.x * 2.0 - 1.0, 1.0 - screen.y * 2.0, 0.0, 1.0);
  gl_PointSize = (0.65 + aRing.z * 1.05) * uPixelRatio / uCamera.x;
  float occultation = sin(angle) < 0.0 ? smoothstep(0.187, 0.193, length(distance + vec2(0.0178, -0.002))) : 1.0;
  float gap = 1.0 - smoothstep(0.349, 0.352, radius) * (1.0 - smoothstep(0.359, 0.362, radius));
  vAlpha = (0.08 + aRing.z * 0.22) * occultation * gap * (1.0 - smoothstep(0.63, 0.665, uv.y));
  vWarmth = aRing.w;
}`;

export const ringFragmentSource = `#version 300 es
precision highp float;
in float vAlpha;
in float vWarmth;
out vec4 fragColor;
void main() {
  vec2 point = gl_PointCoord - 0.5;
  float glow = exp(-dot(point, point) * 14.0);
  fragColor = vec4(mix(vec3(0.38, 0.67, 0.89), vec3(0.91, 0.80, 0.59), vWarmth), glow * vAlpha);
}`;

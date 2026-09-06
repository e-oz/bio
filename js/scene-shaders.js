export const noise = /* glsl */`
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i+vec3(1,0,0)), f.x),
                 mix(hash31(i+vec3(0,1,0)), hash31(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i+vec3(0,0,1)), hash31(i+vec3(1,0,1)), f.x),
                 mix(hash31(i+vec3(0,1,1)), hash31(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float f = 0.5 * noise3(p);
  p = p * 2.03 + 19.1; f += 0.25 * noise3(p);
  p = p * 2.01 + 7.7; f += 0.125 * noise3(p);
  p = p * 2.02 + 3.4; f += 0.0625 * noise3(p);
  return f;
}
`;

export const worldVertex = /* glsl */`
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vUv = uv;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}
`;

export const skyFragment = /* glsl */`
${noise}
varying vec3 vWorld;
uniform vec3 uSun;
void main() {
  vec3 d = normalize(vWorld - cameraPosition);
  float horizon = exp(-abs(d.y) * 11.0);
  vec3 color = mix(vec3(0.0008,0.002,0.006), vec3(0.012,0.034,0.062), horizon);
  float band = exp(-pow((d.x * 0.5 - d.y * 0.8 + 0.42) * 4.5, 2.0));
  float dust = fbm(d * 7.0 + 13.2);
  float wisps = pow(max(0.0, dust - 0.30) * 1.8, 2.0) * band;
  color += vec3(0.015,0.028,0.055) * wisps;
  color += vec3(0.027,0.018,0.034) * pow(dust, 3.0) * band;
  float sunDistance = length(d - uSun);
  color += vec3(1.0,0.48,0.17) * (0.000025 / (sunDistance*sunDistance + 0.000045));
  color += vec3(3.5,2.3,1.1) * exp(-sunDistance*sunDistance*180000.0);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const planetFragment = /* glsl */`
${noise}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
uniform float uTime;
uniform vec3 uLight;
void main() {
  vec3 n = normalize(vNormal);
  vec3 p = vec3(vUv.x * 9.0 + uTime * 0.003, vUv.y * 26.0, 2.0);
  float storm = fbm(p * vec3(1.4,1.0,1.0));
  float bands = sin(vUv.y * 160.0 + storm * 7.0);
  float fine = fbm(p * vec3(3.0,2.0,1.0) + storm);
  vec3 surface = mix(vec3(0.008,0.028,0.058), vec3(0.026,0.086,0.15), storm);
  surface += vec3(0.002,0.005,0.008) * bands + vec3(0.010,0.017,0.024) * fine;
  float light = max(0.0, dot(n, uLight));
  float rim = pow(1.0 - clamp(dot(n,normalize(cameraPosition-vWorld)),0.0,1.0), 3.0);
  vec3 color = surface * (0.16 + 2.1 * pow(light, 0.9));
  color += vec3(0.015,0.29,0.49) * rim * pow(max(0.0,dot(n,uLight)+0.25),2.0);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const ringFragment = /* glsl */`
${noise}
varying vec3 vWorld;
varying vec2 vUv;
uniform vec3 uPlanet;
uniform vec3 uLight;
uniform float uRadius;
uniform sampler2D uProfile;
void main() {
  vec3 local = vWorld - uPlanet;
  float r = length(local) / uRadius;
  float bands = texture2D(uProfile,vec2((r-1.18)/0.80,0.5)).r;
  float gap = smoothstep(1.57,1.59,r) * (1.0-smoothstep(1.62,1.64,r));
  float inner = smoothstep(1.18,1.24,r), outer = 1.0-smoothstep(1.92,1.98,r);
  float shadowDistance = length(local + uLight * max(0.0,-dot(local,uLight)));
  float shadow = mix(0.12,1.0,smoothstep(uRadius*0.94,uRadius*1.035,shadowDistance));
  vec3 color = mix(vec3(0.015,0.032,0.05),vec3(0.16,0.20,0.23),bands);
  color *= shadow;
  gl_FragColor = vec4(color, inner*outer*(1.0-gap*0.96)*(0.38+bands*0.56));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const waves = /* glsl */`
float waveHeight(vec2 p, float t) {
  return sin(dot(p,vec2(0.19,0.11))-t*0.85)*0.52
       + sin(dot(p,vec2(-0.12,0.29))-t*1.05)*0.28
       + sin(dot(p,vec2(0.43,0.21))-t*1.32)*0.18
       + sin(dot(p,vec2(-0.39,0.57))-t*1.62)*0.11
       + sin(dot(p,vec2(0.92,0.67))-t*2.13)*0.065;
}
`;

export const oceanVertex = /* glsl */`
${waves}
uniform float uTime;
uniform mat4 uReflectionMatrix;
varying vec3 vWorld;
varying vec4 vReflection;
void main() {
  vec3 p = position;
  p.y = waveHeight(p.xz, uTime);
  vWorld = p;
  vReflection = uReflectionMatrix * vec4(p,1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0);
}
`;

export const oceanFragment = /* glsl */`
${noise}
${waves}
uniform float uTime;
uniform sampler2D uReflection;
uniform vec3 uSun;
varying vec3 vWorld;
varying vec4 vReflection;
float detail(vec2 p) {
  float h = waveHeight(p,uTime);
  vec2 drift=vec2(uTime*0.08,-uTime*0.05);
  h += (noise3(vec3(p*1.5+drift,uTime*0.26))-0.5)*0.16;
  h += (noise3(vec3(p*4.7-drift,uTime*0.17))-0.5)*0.045;
  return h;
}
void main() {
  vec2 p = vWorld.xz;
  float distanceToEye = length(cameraPosition-vWorld);
  float h = detail(p);
  // Screen derivatives recover the surface normal from a single height evaluation.
  vec3 surface = vec3(p.x,h,p.y);
  vec3 surfaceNormal = cross(dFdx(surface),dFdy(surface));
  surfaceNormal *= surfaceNormal.y < 0.0 ? -1.0 : 1.0;
  vec3 n = surfaceNormal * inversesqrt(max(dot(surfaceNormal,surfaceNormal),0.000000000001));
  vec3 eye = normalize(cameraPosition-vWorld);
  float fresnel = 0.035 + 0.965*pow(1.0-clamp(dot(n,eye),0.0,1.0),5.0);
  vec2 reflectionUv = vReflection.xy/vReflection.w;
  reflectionUv += n.xz * (0.017 + 0.016/(1.0+distanceToEye*0.05));
  vec3 reflection = texture2D(uReflection,clamp(reflectionUv,0.001,0.999)).rgb;
  vec3 color = mix(vec3(0.0025,0.012,0.020),reflection*vec3(0.63,0.86,0.97),0.40+fresnel*0.55);
  float crest = smoothstep(0.05,0.68,h);
  float skyFill=pow(max(0.0,dot(n,normalize(vec3(-0.25,1.0,0.20)))),18.0);
  // Thin crest froth has continuous density, with finer turbulence fading below pixel size.
  float footprint = max(length(dFdx(p)),length(dFdy(p)));
  if(h>0.40 && distanceToEye<150.0) {
    vec2 flow = p + vec2(-uTime*0.18,uTime*0.12);
    float churn = noise3(vec3(flow*1.1,uTime*0.16));
    float fine = noise3(vec3(flow*7.3+churn*2.8,uTime*0.30));
    float mist = noise3(vec3(flow*21.3,uTime*0.17));
    fine = mix(0.5,fine,1.0-smoothstep(0.04,0.18,footprint));
    mist = mix(0.5,mist,1.0-smoothstep(0.015,0.05,footprint));
    float cap = smoothstep(0.50,0.95,h+(churn-0.5)*0.18);
    float froth = cap*cap*cap*smoothstep(0.26,0.65,churn)*(0.25+fine*0.50+mist*0.25);
    froth *= 0.35+skyFill*0.65;
    froth *= 1.0-smoothstep(40.0,150.0,distanceToEye);
    color += vec3(0.012,0.095,0.135)*froth;
  }
  color += vec3(0.002,0.018,0.023)*crest;
  vec3 halfLight = normalize(eye+uSun);
  float sparkle = pow(max(0.0,dot(n,halfLight)),180.0);
  color += vec3(1.0,0.47,0.16)*sparkle*1.4;
  float planetSpecular=pow(max(0.0,dot(n,normalize(eye+normalize(vec3(0.34,0.40,-1.0))))),65.0);
  color += vec3(0.018,0.070,0.12)*planetSpecular;
  color += vec3(0.0025,0.009,0.017)*skyFill*(1.0-planetSpecular);
  float fog = 1.0-exp(-distanceToEye*0.0017);
  color = mix(color,vec3(0.013,0.031,0.05),fog);
  gl_FragColor = vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const mantaVertex = /* glsl */`
uniform float uTime;
uniform float uPhase;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float wing = pow(abs(p.x)/3.4,1.6);
  float beat = uTime*1.3+uPhase;
  p.y += sin(beat-abs(p.x)*0.85+p.z*0.7)*wing*1.25;
  p.z += sin(beat-abs(p.x)*0.55)*wing*0.22;
  vWorld = (modelMatrix*vec4(p,1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix)*normal);
  gl_Position = projectionMatrix*viewMatrix*vec4(vWorld,1.0);
}
`;

export const mantaFragment = /* glsl */`
${noise}
uniform float uTime;
uniform float uPhase;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
void main() {
  vec3 faceNormal = cross(dFdx(vWorld),dFdy(vWorld));
  vec3 n = faceNormal * inversesqrt(max(dot(faceNormal,faceNormal),0.000000000001));
  if (!gl_FrontFacing) n = -n;
  vec2 uv = vUv;
  float edge = pow(abs(uv.x*2.0-1.0),5.0);
  edge = max(edge,pow(abs(uv.y*2.0-1.0),14.0));
  float veins = pow(0.5+0.5*sin(uv.x*95.0+sin(uv.y*12.0)*3.5),22.0);
  float spots = pow(noise3(vec3(uv*vec2(120.0,50.0),uPhase)),16.0);
  float pattern = veins*0.12+spots*5.0+edge*0.72;
  float pulse = 0.78+0.22*sin(uv.y*9.0-uTime*1.7+uPhase);
  float light = 0.35+0.65*max(0.0,dot(n,normalize(vec3(0.8,1.0,0.5))));
  vec3 color = vec3(0.005,0.035,0.050)*light;
  color += vec3(0.02,0.48,0.64)*pattern*pulse;
  color += vec3(0.01,0.08,0.1)*pow(1.0-clamp(abs(dot(n,normalize(cameraPosition-vWorld))),0.0,1.0),3.0);
  gl_FragColor = vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const pointVertex = /* glsl */`
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uPixelRatio;
uniform float uDrift;
varying float vAlpha;
void main() {
  vec3 p = position;
  p.x += sin(uTime*0.15+aPhase)*uDrift;
  p.y += sin(uTime*0.22+aPhase*2.0)*uDrift*0.4;
  vec4 view = modelViewMatrix*vec4(p,1.0);
  gl_Position = projectionMatrix*view;
  gl_PointSize = aSize*uPixelRatio;
  vAlpha = 0.62+0.38*sin(uTime*0.3+aPhase);
}
`;

export const pointFragment = /* glsl */`
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord-0.5);
  float light = exp(-r*r*18.0);
  gl_FragColor = vec4(uColor,light*vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

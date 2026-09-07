import * as THREE from './vendor/three.module.min.js';
import { createAnimationClock, createFrameLimiter, dampingFactor } from './animation-clock.mjs?v=3d-27';
import { drawingSize, sceneLayout, shipFlightPath } from './scene-math.mjs?v=3d-27';
import { createSceneFinish } from './scene-finish.js?v=3d-27';
import { createStarship, createManta, createParticles, createOceanGeometry, createRingProfile } from './scene-models.js?v=3d-27';
import { worldVertex, skyFragment, planetFragment, ringFragment, oceanVertex, oceanFragment } from './scene-shaders.js?v=3d-27';

let renderer, scene, camera, reflectionCamera, reflectionTarget, ocean, planet, ship, shipBounds;
let stars, motes, viewport, canvas, finish, layout;
let running=false, initialized=false, failed=false, timer;
let elapsed=0, frameNumber=0;
let exploration=0, exploring=false;
const quality=1;
const animationClock=createAnimationClock();
const frameLimiter=createFrameLimiter();
const usesAnimationFrame=typeof self.requestAnimationFrame==='function';
let reportStarted=0, reportFrames=0, reportCpu=0;
const targetPointer=new THREE.Vector2(), pointer=new THREE.Vector2();
const school=[];
const timeUniform={value:0};
const planetLight=new THREE.Vector3(1,0.20,-0.08).normalize();
const sunDirection=new THREE.Vector3(0.54,0.017,-1).normalize();
const reflectionMatrix=new THREE.Matrix4();
const biasMatrix=new THREE.Matrix4().set(0.5,0,0,0.5, 0,0.5,0,0.5, 0,0,0.5,0.5, 0,0,0,1);
const lookTarget=new THREE.Vector3(), reflectedTarget=new THREE.Vector3();
const shipRay=new THREE.Vector3(), viewDirection=new THREE.Vector3();
const shipBoundsCorner=new THREE.Vector3(), shipOriginNdc=new THREE.Vector3();
const shipHorizonNdc=-0.14;

function unavailable(error) {
  if(failed)return;
  failed=true;running=false;cancelScheduledFrame();animationClock.pause();
  console.error('Scene renderer unavailable:',error);
  self.postMessage({type: 'unavailable',reason:String(error?.message||error).slice(0,400)});
}

function shader(fragmentShader,uniforms={},options={}) {
  return new THREE.ShaderMaterial({vertexShader:worldVertex,fragmentShader,uniforms,...options});
}

function positionShip(screenX,screenY,viewDistance) {
  camera.getWorldDirection(viewDirection);
  shipRay.set(screenX,screenY,0.5).unproject(camera).sub(camera.position).normalize();
  ship.group.position.copy(camera.position).addScaledVector(shipRay,viewDistance/Math.max(0.1,shipRay.dot(viewDirection)));
}

function projectedShipBounds() {
  const min=shipBounds.min,max=shipBounds.max;
  shipOriginNdc.copy(ship.group.position).project(camera);
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(const x of [min.x,max.x]) for(const y of [min.y,max.y]) for(const z of [min.z,max.z]) {
    shipBoundsCorner.set(x,y,z).applyMatrix4(ship.group.matrixWorld).project(camera);
    minX=Math.min(minX,shipBoundsCorner.x);maxX=Math.max(maxX,shipBoundsCorner.x);
    minY=Math.min(minY,shipBoundsCorner.y);maxY=Math.max(maxY,shipBoundsCorner.y);
  }
  return {minX:minX-shipOriginNdc.x,maxX:maxX-shipOriginNdc.x,minY:minY-shipOriginNdc.y,maxY:maxY-shipOriginNdc.y};
}

function mapFlightCoordinate(value,envelope,min,max) {
  return min+(value+envelope)/(envelope*2)*(max-min);
}

function resize() {
  layout=sceneLayout(viewport.width,viewport.height,viewport.compact);
  const size=drawingSize(viewport.width,viewport.height,viewport.pixelRatio,viewport.compact,quality);
  renderer.setSize(size.width,size.height,false);
  finish.resize(size.width,size.height,viewport.compact);
  camera.aspect=viewport.width/viewport.height;
  camera.fov=layout.fov;
  camera.updateProjectionMatrix();
  reflectionCamera.copy(camera);
  const reflectionScale=viewport.compact?0.35:0.5;
  reflectionTarget.setSize(Math.max(1,Math.round(size.width*reflectionScale)),Math.max(1,Math.round(size.height*reflectionScale)));
  planet.position.set(layout.planetX,viewport.compact?340:320,-1050);
  sunDirection.set(viewport.compact?0.19:0.54,0.017,-1).normalize();
  stars.material.uniforms.uPixelRatio.value=size.width/viewport.width;
  motes.material.uniforms.uPixelRatio.value=size.width/viewport.width;
  stars.geometry.setDrawRange(0,viewport.compact?1500:3600);
  motes.geometry.setDrawRange(0,viewport.compact?70:180);
  school.forEach((manta,index)=>{manta.group.visible=!viewport.compact||index<3;});
  if(ocean.userData.compact!==viewport.compact){
    ocean.geometry.dispose();ocean.geometry=createOceanGeometry(viewport.compact);
    ocean.userData.compact=viewport.compact;
  }
  frameNumber=0;
  self.postMessage({type:'resolution',width:size.width,height:size.height,quality,samples:finish.samples});
}

async function initialize(message) {
  canvas=message.canvas;viewport=message.viewport;running=message.running;exploring=message.exploring;
  renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance',stencil:false});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.12;
  finish=createSceneFinish(renderer);
  renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{
    unavailable(new Error(`${gl.getProgramInfoLog(program)} ${gl.getShaderInfoLog(vertex)} ${gl.getShaderInfoLog(fragment)}`));
  };
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();unavailable(new Error('WebGL context lost'));});
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(50,viewport.width/viewport.height,0.3,5000);
  reflectionCamera=camera.clone();
  reflectionTarget=new THREE.WebGLRenderTarget(512,256,{depthBuffer:true,type:THREE.UnsignedByteType});
  reflectionTarget.texture.colorSpace=THREE.SRGBColorSpace;

  const sky=new THREE.Mesh(new THREE.SphereGeometry(3000,32,20),shader(skyFragment,{uSun:{value:sunDirection}},{side:THREE.BackSide,depthWrite:false}));
  sky.renderOrder=-10;scene.add(sky);
  stars=createParticles(3600);scene.add(stars);
  motes=createParticles(180,true);scene.add(motes);

  planet=new THREE.Group();
  planet.name='Ringed ocean planet';
  const planetRadius=166;
  const sphere=new THREE.Mesh(new THREE.SphereGeometry(planetRadius,96,64),shader(planetFragment,{uTime:timeUniform,uLight:{value:planetLight}}));
  sphere.rotation.z=0.13;planet.add(sphere);
  const ringTilt=new THREE.Group();ringTilt.rotation.z=0.25;
  const rings=new THREE.Mesh(new THREE.RingGeometry(planetRadius*1.18,planetRadius*1.98,256,1),shader(ringFragment,{uPlanet:{value:planet.position},uLight:{value:planetLight},uRadius:{value:planetRadius},uProfile:{value:createRingProfile()}},{transparent:true,side:THREE.DoubleSide,depthWrite:false}));
  rings.rotation.x=-1.20;ringTilt.add(rings);planet.add(ringTilt);scene.add(planet);

  scene.add(new THREE.HemisphereLight(0x7ebacd,0x062a40,2.4));
  const keyLight=new THREE.DirectionalLight(0xa4d9f2,4.2);
  keyLight.position.set(30,26,12);scene.add(keyLight);
  const rimLight=new THREE.DirectionalLight(0x3489c4,3.2);
  rimLight.position.set(-30,12,-45);scene.add(rimLight);
  const warmLight=new THREE.DirectionalLight(0xd69d67,1.0);
  warmLight.position.set(70,6,-110);scene.add(warmLight);
  ship=createStarship();shipBounds=ship.bounds;scene.add(ship.group);

  for(let index=0;index<5;index++) {
    const manta=createManta(index*1.93);
    scene.add(manta.group);school.push(manta);
  }
  ocean=new THREE.Mesh(createOceanGeometry(viewport.compact),new THREE.ShaderMaterial({
    uniforms:{uTime:timeUniform,uReflection:{value:reflectionTarget.texture},uReflectionMatrix:{value:reflectionMatrix},uSun:{value:sunDirection}},
    vertexShader:oceanVertex,fragmentShader:oceanFragment,side:THREE.DoubleSide,
  }));
  ocean.frustumCulled=false;ocean.userData.compact=viewport.compact;scene.add(ocean);
  resize();
  updateObjects(0);
  await renderer.compileAsync(scene,camera);
  if(failed)return;
  resize();
  initialized=true;
  render(0);
  if(failed)return;
  self.postMessage({type:'ready'});
  self.postMessage({type:'ship-ready'});
  reportStarted=performance.now();animationClock.resume(reportStarted);
  if(!running)animationClock.pause();
  if(running)schedule();
}

function updateObjects(delta) {
  const smoothing=dampingFactor(delta,2.2);
  pointer.lerp(targetPointer,smoothing);
  exploration+=(Number(exploring)-exploration)*smoothing;
  const travel=0.12+exploration*1.8;
  camera.position.set(pointer.x*travel+Math.sin(elapsed*0.12)*0.14,6.8-pointer.y*travel*0.28+Math.sin(elapsed*0.19)*0.08,22-exploration*1.3);
  lookTarget.set(pointer.x*(0.6+exploration*4.3),20-pointer.y*exploration*2.5,-130);
  camera.lookAt(lookTarget);
  camera.updateMatrixWorld();
  timeUniform.value=elapsed;
  const compact=viewport.compact;
  // A shallow elliptical survey circuit changes the visible bow, flank, and engine geometry.
  const orbit=elapsed*0.045;
  const shipPath=shipFlightPath(orbit,exploration);
  ship.group.rotation.set(0.48+Math.sin(orbit*1.3)*0.12,-0.40+Math.sin(orbit)*0.55,-0.13+Math.cos(orbit)*0.075);
  ship.group.scale.setScalar(compact?0.49:0.85);
  positionShip(0,0,shipPath.viewDistance);
  ship.group.updateMatrixWorld(true);
  const bounds=projectedShipBounds();
  // Remapping avoids a hard border clamp, which would hold the ship at a corner while its target keeps moving.
  const minScreenX=-shipPath.envelope-bounds.minX;
  const maxScreenX=shipPath.envelope-bounds.maxX;
  const minScreenY=shipHorizonNdc-bounds.minY;
  const maxScreenY=shipPath.envelope-bounds.maxY;
  const screenX=mapFlightCoordinate(shipPath.x,shipPath.envelope,minScreenX,maxScreenX);
  const screenY=mapFlightCoordinate(shipPath.y,shipPath.envelope,minScreenY,maxScreenY);
  positionShip(screenX,screenY,shipPath.viewDistance);
  ship.update(elapsed);
  const paths=compact?
    [[layout.mantaX,2.8,-1,0.62],[-6,3.7,-19,0.40],[6,2.6,-35,0.33]]:
    [[layout.mantaX,2.8,-1,0.94],[-5.5,3.2,-13,0.60],[24,3.8,-30,0.51],[-23,4.3,-48,0.46],[11,5,-63,0.38]];
  school.forEach((manta,index)=>{
    const path=paths[index];if(!path)return;
    const phase=index*1.93;
    manta.group.position.set(path[0]+Math.sin(elapsed*0.095+phase)*layout.mantaTravel,path[1]+Math.sin(elapsed*0.34+phase)*0.42,path[2]+Math.sin(elapsed*0.10+phase)*2.3);
    manta.group.rotation.set(0.48+Math.sin(elapsed*0.22+phase)*0.16,-0.35+Math.sin(elapsed*0.11+phase)*0.5,Math.sin(elapsed*0.23+phase)*0.17);
    manta.group.scale.setScalar(path[3]);manta.update(elapsed);
  });
  stars.material.uniforms.uTime.value=elapsed;
  motes.material.uniforms.uTime.value=elapsed;
}

function render(delta) {
  updateObjects(delta);
  renderer.info.reset();
  renderer.info.autoReset=false;
  if(frameNumber%2===0||!running) {
    reflectionCamera.position.copy(camera.position);reflectionCamera.position.y*=-1;
    reflectionCamera.up.set(0,-1,0);
    reflectedTarget.copy(lookTarget);reflectedTarget.y*=-1;
    reflectionCamera.lookAt(reflectedTarget);
    reflectionCamera.projectionMatrix.copy(camera.projectionMatrix);
    reflectionCamera.updateMatrixWorld();
    reflectionMatrix.copy(biasMatrix).multiply(reflectionCamera.projectionMatrix).multiply(reflectionCamera.matrixWorldInverse);
    ocean.visible=false;motes.visible=false;
    renderer.setRenderTarget(reflectionTarget);
    renderer.render(scene,reflectionCamera);
    renderer.setRenderTarget(null);
    ocean.visible=true;motes.visible=true;
  }
  finish.render(scene,camera);
  frameNumber++;
}

function schedule() {
  if(usesAnimationFrame)timer=self.requestAnimationFrame(tick);
  else timer=setTimeout(tick,Math.max(1,Math.ceil(frameLimiter.delay(performance.now()))));
}

function cancelScheduledFrame() {
  if(timer===undefined)return;
  if(usesAnimationFrame)self.cancelAnimationFrame(timer);
  else clearTimeout(timer);
  timer=undefined;
}

function tick(timestamp) {
  timer=undefined;
  if(!running||!initialized||failed)return;
  const now=performance.now();
  const frameTime=timestamp??now;
  if(!frameLimiter.shouldRender(frameTime)){schedule();return;}
  const frame=animationClock.advance(now);
  const delta=frame.delta;
  elapsed=frame.elapsed;
  try{render(delta);}catch(error){unavailable(error);return;}
  const cpu=performance.now()-now;
  reportFrames++;reportCpu+=cpu;
  if(now-reportStarted>2000){
    self.postMessage({type:'performance',fps:Math.round(reportFrames*1000/(now-reportStarted)),cpuMs:Math.round(reportCpu/reportFrames*10)/10,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,elapsed:Math.round(elapsed*10)/10});
    reportStarted=now;reportFrames=0;reportCpu=0;
  }
  schedule();
}

self.addEventListener('message',event=>{
  const message=event.data;
  if(message.type==='init'){initialize(message).catch(unavailable);return;}
  if(failed)return;
  if(message.type==='running'){
    exploring=message.exploring;
    const wasRunning=running;running=message.value;
    if(initialized&&running&&!wasRunning){reportStarted=performance.now();animationClock.resume(reportStarted);frameLimiter.reset();reportFrames=0;reportCpu=0;schedule();}
    if(!running){cancelScheduledFrame();animationClock.pause();}
  }
  if(message.type==='pointer')targetPointer.set(...message.value);
  if(message.type==='resize'){viewport=message.viewport;if(initialized){resize();render(0);}}
});

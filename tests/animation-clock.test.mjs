import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnimationClock, createFrameLimiter, dampingFactor, FRAME_INTERVAL_MS } from '../js/animation-clock.mjs';
import { createStarship, createManta } from '../js/scene-models.js';

test('the 120 fps ceiling handles 60, 120, 144, 165, and 240 Hz without accidental halving', () => {
  for(const refreshRate of [60,120,144,165,240]){
    const limiter=createFrameLimiter();
    let frames=0;
    for(let index=1;index<=refreshRate*10;index++){
      if(limiter.shouldRender(index*1000/refreshRate))frames++;
    }
    assert.ok(Math.abs(frames-Math.min(refreshRate,120)*10)<=1, `${refreshRate} Hz rendered ${frames} frames`);
  }
});

test('frame limiting skips missed deadlines without accumulating catch-up frames', () => {
  const limiter=createFrameLimiter();
  assert.equal(limiter.shouldRender(0),true);
  assert.equal(limiter.shouldRender(2),false);
  assert.equal(limiter.shouldRender(1000),true);
  assert.equal(limiter.shouldRender(1000),false);
  assert.ok(limiter.delay(1000)<=FRAME_INTERVAL_MS+0.01);
  limiter.reset();
  assert.equal(limiter.shouldRender(1001),true);
});

test('small presentation-timestamp jitter does not discard valid 120 Hz frames', () => {
  const limiter=createFrameLimiter();
  let frames=0;
  for(let index=1;index<=1200;index++){
    const timestamp=index*FRAME_INTERVAL_MS+Math.sin(index*0.7)*0.2;
    if(limiter.shouldRender(timestamp))frames++;
  }
  assert.equal(frames,1200);
});

test('animation advances ten seconds at 5, 15, 24, 30, 60, and 120 fps', () => {
  for (const fps of [5,15,24,30,60,120]) {
    const clock=createAnimationClock();
    clock.resume(1000);
    let frame;
    let camera=0;
    for(let index=1;index<=fps*10;index++){
      frame=clock.advance(1000+index*1000/fps);
      camera+=(1-camera)*dampingFactor(frame.delta,0.22);
    }
    assert.ok(Math.abs(frame.elapsed-10)<1e-10);
    assert.ok(Math.abs(camera-(1-Math.exp(-2.2)))<1e-10);
  }
});

test('dropped frames keep their full elapsed time', () => {
  const clock=createAnimationClock();
  clock.resume(0);
  for(const time of [8,17,33,280,290,800,1200,5100,10000])clock.advance(time);
  assert.equal(clock.advance(10000).elapsed,10);
});

test('pausing excludes time spent hidden and resume starts without a jump', () => {
  const clock=createAnimationClock();
  clock.resume(0);
  assert.equal(clock.advance(1000).elapsed,1);
  clock.pause();
  assert.deepEqual(clock.advance(86_400_000),{elapsed:1,delta:0});
  clock.resume(86_400_000);
  assert.deepEqual(clock.advance(86_400_500),{elapsed:1.5,delta:0.5});
});

test('ship and manta poses agree after the same duration at different frame rates', () => {
  const snapshots=[];
  for(const fps of [5,30,120]){
    const ship=createStarship(),manta=createManta(1.93),clock=createAnimationClock();
    clock.resume(0);
    for(let index=1;index<=fps*4;index++){
      const {elapsed}=clock.advance(index*1000/fps);
      ship.update(elapsed);manta.update(elapsed);
    }
    const values=[];
    ship.group.traverse(object=>values.push(object.rotation.x));
    manta.group.traverse(object=>{if(object.isLine)values.push(...object.geometry.attributes.position.array);});
    values.push(manta.group.children[0].material.uniforms.uTime.value);
    snapshots.push(values);
  }
  for(const snapshot of snapshots.slice(1))snapshot.forEach((value,index)=>assert.ok(Math.abs(value-snapshots[0][index])<1e-6));
  assert.equal(FRAME_INTERVAL_MS,1000/120);
});

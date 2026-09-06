import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from '../js/vendor/three.module.min.js';
import { createStarship, createManta, createOceanGeometry, pressureHull, randomSequence } from '../js/scene-models.js';
import { sceneLayout } from '../js/scene-math.mjs';

test('the vessel is volumetric geometry and can render without image assets', () => {
  const vessel = createStarship();
  const bounds = new Box3().setFromObject(vessel.group);
  assert.ok(bounds.max.y - bounds.min.y > 3);
  assert.ok(bounds.max.z - bounds.min.z > 7);
  vessel.group.traverse(object => {
    assert.ok(!object.isSprite);
    if (!object.geometry) return;
    for (const attribute of Object.values(object.geometry.attributes)) {
      assert.ok(attribute.array.every(Number.isFinite));
    }
    assert.ok(!object.material.map);
  });
  const before = vessel.group.children.map(object => object.rotation.x);
  vessel.update(5);
  assert.notDeepEqual(vessel.group.children.map(object => object.rotation.x), before);
});

test('pressure hull faces point outward so exterior lighting and back-face culling agree', () => {
  const geometry=pressureHull([[-2,1,1,0],[2,1,1,0]]);
  const vertices=geometry.attributes.position;
  const indices=geometry.index.array;
  for(let index=0;index<indices.length;index+=3){
    const a=new Vector3().fromBufferAttribute(vertices,indices[index]);
    const b=new Vector3().fromBufferAttribute(vertices,indices[index+1]);
    const c=new Vector3().fromBufferAttribute(vertices,indices[index+2]);
    const center=a.clone().add(b).add(c).divideScalar(3);
    const normal=b.sub(a).cross(c.sub(a));
    assert.ok(normal.dot(center)>0);
  }
});

test('manta anatomy stays finite while the flexible tail and wing clock animate', () => {
  for (const phase of [0, 1.93, 7.72]) {
    const manta = createManta(phase);
    let tail;
    manta.group.traverse(object => { if (object.isLine) tail = object; });
    manta.update(0);
    const initial = [...tail.geometry.attributes.position.array];
    for (const time of [0.01, 5, 1000, 86_400]) {
      manta.update(time);
      assert.ok(tail.geometry.attributes.position.array.every(Number.isFinite));
      assert.notDeepEqual([...tail.geometry.attributes.position.array], initial);
    }
    assert.equal(manta.group.children[0].material.uniforms.uTime.value, 86_400);
  }
});

test('ocean mesh indices are valid and mobile geometry uses less than half the vertices', () => {
  const desktop = createOceanGeometry(false);
  const mobile = createOceanGeometry(true);
  assert.ok(mobile.attributes.position.count < desktop.attributes.position.count / 2);
  for (const geometry of [desktop, mobile]) {
    assert.ok(geometry.attributes.position.array.every(Number.isFinite));
    assert.ok(geometry.index.array.every(index => index < geometry.attributes.position.count));
    assert.equal(geometry.index.count % 3, 0);
  }
});

test('planet framing adapts to tablet portrait as well as phone and desktop layouts', () => {
  for (const [width, height] of [[320,568], [390,844], [430,932], [768,1024], [844,390], [1280,720], [1920,1080]]) {
    const layout = sceneLayout(width, height, width <= 700);
    const halfWidth = 1072 * Math.tan(layout.fov * Math.PI / 360) * width / height;
    assert.ok(layout.planetX - 166 > -halfWidth);
    assert.ok(layout.planetX + 166 < halfWidth);
    assert.ok(layout.mantaX >= 0 && layout.mantaTravel > 0);
  }
});

test('procedural particle placement is reproducible and remains in the unit interval', () => {
  const a = randomSequence(91), b = randomSequence(91), c = randomSequence(407);
  assert.notEqual(a(), c());
  b();
  for (let index = 0; index < 1000; index++) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

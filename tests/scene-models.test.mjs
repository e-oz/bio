import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3, Matrix4, SphereGeometry } from '../js/vendor/three.module.min.js';
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


test('all three field rings rotate independently within their swept flight bounds', () => {
  const vessel=createStarship();
  const rings=vessel.group.children.filter(object=>object.isGroup && object.children[0]?.isGroup);
  assert.equal(rings.length,3);
  const initial=rings.map(ring=>ring.children[0].rotation.z);
  vessel.update(8);
  const advanced=rings.map(ring=>ring.children[0].rotation.z);
  advanced.forEach((angle,index)=>assert.notEqual(angle,initial[index]));
  assert.ok(advanced[0]>initial[0] && advanced[1]<initial[1]);
  for(const time of [0,8,30,90,600,86400]) {
    vessel.update(time);
    vessel.group.updateMatrixWorld(true);
    const point=new Vector3();
    vessel.group.traverse(object=>{
      if(!object.geometry) return;
      const positions=object.geometry.attributes.position;
      for(let index=0;index<positions.count;index++) {
        point.fromBufferAttribute(positions,index).applyMatrix4(object.matrixWorld);
        assert.ok(vessel.bounds.containsPoint(point));
      }
    });
  }
  vessel.update(8);
  assert.deepEqual(rings.map(ring=>ring.children[0].rotation.z),advanced);
});


test('the cabin turns slowly around its vertical axis with deterministic timing', () => {
  const vessel=createStarship();
  const cabin=vessel.group.getObjectByName('Observation cabin');
  vessel.update(10);
  assert.equal(cabin.rotation.x,0);
  assert.equal(cabin.rotation.z,0);
  assert.ok(cabin.rotation.y>0 && cabin.rotation.y<1);
  const angle=cabin.rotation.y;
  vessel.update(20);
  assert.equal(cabin.rotation.y,angle*2);
  vessel.update(10);
  assert.equal(cabin.rotation.y,angle);
});


test('ring planes complete continuous turns independently of their axial spin', () => {
  const vessel=createStarship();
  const rings=vessel.group.children.filter(object=>object.isGroup && object.children[0]?.isGroup);
  vessel.update(0);
  const initial=rings.map(ring=>ring.rotation.x);
  vessel.update(200);
  const turned=rings.map(ring=>ring.rotation.x);
  turned.forEach((angle,index)=>assert.ok(Math.abs(angle-initial[index])>Math.PI*2));
  assert.ok(turned[0]>initial[0] && turned[1]<initial[1]);
  vessel.update(100);
  rings.forEach((ring,index)=>assert.ok(Math.abs(ring.rotation.x-(initial[index]+turned[index])/2)<1e-12));
  vessel.update(200);
  assert.deepEqual(rings.map(ring=>ring.rotation.x),turned);
});


test('ring gimbals turn continuously around the third axis at independent rates', () => {
  const vessel=createStarship();
  const rings=vessel.group.children.filter(object=>object.isGroup && object.children[0]?.isGroup);
  const initial=rings.map(ring=>ring.rotation.y);
  vessel.update(400);
  const turned=rings.map(ring=>ring.rotation.y);
  turned.forEach((angle,index)=>assert.ok(Math.abs(angle-initial[index])>Math.PI*2));
  assert.ok(turned[0]>initial[0] && turned[2]<initial[2]);
  vessel.update(200);
  rings.forEach((ring,index)=>assert.ok(Math.abs(ring.rotation.y-(initial[index]+turned[index])/2)<1e-12));
  vessel.update(400);
  assert.deepEqual(rings.map(ring=>ring.rotation.y),turned);
});

test('material batches retain every vessel and manta triangle', () => {
  for (const { model, triangles, meshCount, materialMeshes } of [
    { model: createStarship(), triangles: 62_256, meshCount: 19, materialMeshes: [1, 1, 1, 4, 4, 4, 4] },
    { model: createManta(0), triangles: 3_456, meshCount: 3, materialMeshes: [1, 1, 1] },
  ]) {
    const meshes = model.group.getObjectsByProperty('isMesh', true);
    assert.equal(meshes.length, meshCount);
    const materials = [...new Set(meshes.map(mesh => mesh.material))];
    assert.deepEqual(materials.map(material => meshes.filter(mesh => mesh.material === material).length).toSorted((a, b) => a - b), materialMeshes);
    let triangleCount = 0;
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      assert.ok(geometry.index);
      assert.ok(!Array.isArray(mesh.material));
      assert.equal(geometry.index.count % 3, 0);
      const vertexCount = geometry.attributes.position.count;
      assert.ok(geometry.index.array.every(index => Number.isInteger(index) && index >= 0 && index < vertexCount));
      for (const [name, itemSize] of [['position', 3], ['normal', 3], ['uv', 2]]) {
        const attribute = geometry.attributes[name];
        assert.ok(attribute);
        assert.equal(attribute.itemSize, itemSize);
        assert.equal(attribute.count, vertexCount);
        assert.ok(attribute.array.every(Number.isFinite));
      }
      triangleCount += geometry.index.count / 3;
    }
    assert.equal(triangleCount, triangles);
  }
});

test('batched hull and manta body retain the source sphere triangle attributes', () => {
  const ship = createStarship();
  const cabin = ship.group.getObjectByName('Observation cabin');
  const hull = cabin.children.find(object => object.material.color.getHex() === 0x283943);
  const manta = createManta(0);
  const anatomy = manta.group.children.find(object => object.isGroup);
  const body = anatomy.children.find(object => object.material.isMeshStandardMaterial);
  for (const { label, mesh, segments, scale, position } of [
    { label: 'hull', mesh: hull, segments: [48, 24], scale: [2.85, 1.05, 2.45], position: [0, -0.28, 0] },
    { label: 'body', mesh: body, segments: [20, 12], scale: [0.48, 0.24, 1.13], position: [0, 0, 0.05] },
  ]) {
    const reference = new SphereGeometry(1, ...segments).toNonIndexed();
    reference.applyMatrix4(new Matrix4().makeScale(...scale).setPosition(...position));
    const expanded = mesh.geometry.toNonIndexed();
    for (const name of ['position', 'normal', 'uv']) {
      const expected = reference.attributes[name].array;
      const actual = expanded.attributes[name].array;
      assert.ok(actual.length >= expected.length);
      assert.ok(expected.every((value, index) => Object.is(actual[index], value)), `${label} ${name} triangle stream differs`);
    }
    reference.dispose();
    expanded.dispose();
  }
});

test('wing culling bounds contain every deformation extremum without moving the sort center', () => {
  for (const phase of [0, 1.93, 3.86, 5.79, 7.72]) {
    const manta = createManta(phase);
    const wings = manta.group.children.find(object => object.material?.isShaderMaterial);
    const positions = wings.geometry.attributes.position;
    const sphere = wings.geometry.boundingSphere;
    assert.ok(sphere);
    assert.ok(Number.isFinite(sphere.radius) && sphere.radius > 0);
    const originalCenter = new Box3().setFromBufferAttribute(positions).getCenter(new Vector3());
    assert.deepEqual(sphere.center, originalCenter);
    assert.equal(wings.frustumCulled, true);
    const point = new Vector3();
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
      const amplitude = Math.pow(Math.abs(x) / 3.4, 1.6);
      for (const vertical of [-1, 1]) for (const longitudinal of [-1, 1]) {
        point.set(x, y + vertical * amplitude * 1.25, z + longitudinal * amplitude * 0.22);
        assert.ok(sphere.containsPoint(point), `phase ${phase}, vertex ${index} exceeds its culling sphere`);
      }
    }
  }
});

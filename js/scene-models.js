import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { mantaVertex, mantaFragment, pointVertex, pointFragment } from './scene-shaders.js?v=3d-32';

/** Seeded placement keeps the composition stable across reloads and quality changes. */
export function randomSequence(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Mipmapped radial density preserves fine ring bands without shimmering at a distance. */
export function createRingProfile() {
  const random=randomSequence(819);
  const data=new Uint8Array(2048*4);
  for(let index=0;index<2048;index++) {
    const density=0.49+Math.sin(index*0.023)*0.19+Math.sin(index*0.071)*0.12+Math.sin(index*0.31)*0.07+(random()-0.5)*0.12;
    const value=Math.round(THREE.MathUtils.clamp(density,0.05,0.95)*255);
    data.set([value,value,value,255],index*4);
  }
  const texture=new THREE.DataTexture(data,2048,1);
  texture.generateMipmaps=true;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.needsUpdate=true;
  return texture;
}

/** Batch rigid components by material; small mechanical details need no extra draw calls. */
function geometryBatch() {
  const parts = new Map();
  return {
    add(geometry, material, position = [0,0,0], rotation = [0,0,0], scale = [1,1,1]) {
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
        new THREE.Vector3(...scale),
      );
      const part = geometry.index ? geometry.toNonIndexed() : geometry.clone();
      geometry.dispose();
      part.applyMatrix4(transform);
      const group = parts.get(material) || [];
      group.push(part);
      parts.set(material, group);
    },
    finish() {
      const group = new THREE.Group();
      for (const [material, geometries] of parts) {
        const merged = mergeGeometries(geometries);
        merged.computeBoundingSphere();
        group.add(new THREE.Mesh(merged, material));
        geometries.forEach(geometry => geometry.dispose());
      }
      return group;
    },
  };
}

/** A faceted pressure hull with independently shaped longitudinal sections. */
export function pressureHull(sections) {
  const vertices = [], indices = [];
  for (const [x, height, width, center] of sections) {
    for (let side=0; side<8; side++) {
      const angle = (side+0.5)*Math.PI/4;
      vertices.push(x, center+Math.cos(angle)*height, Math.sin(angle)*width);
    }
  }
  for (let section=0; section<sections.length-1; section++) {
    for (let side=0; side<8; side++) {
      const a=section*8+side, b=section*8+(side+1)%8, c=a+8, d=b+8;
      indices.push(a,b,c,b,d,c);
    }
  }
  for (let side=1; side<7; side++) {
    indices.push(0,side+1,side);
    const end=(sections.length-1)*8;
    indices.push(end,end+side,end+side+1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A sheltered observatory inside three independently rotating field-drive rings. */
export function createStarship() {
  const hull = new THREE.MeshStandardMaterial({color:0x283943,metalness:0.65,roughness:0.38,emissive:0x12303c,emissiveIntensity:0.08});
  const armor = new THREE.MeshStandardMaterial({color:0x465158,metalness:0.72,roughness:0.32,emissive:0x204854,emissiveIntensity:0.08});
  const carbon = new THREE.MeshStandardMaterial({color:0x142730,metalness:0.5,roughness:0.48});
  const bronze = new THREE.MeshStandardMaterial({color:0x786e58,metalness:0.7,roughness:0.4});
  const glass = new THREE.MeshStandardMaterial({color:0x29424b,metalness:0.65,roughness:0.19,emissive:0x42707a,emissiveIntensity:0.18});
  const cyan = new THREE.MeshBasicMaterial({color:new THREE.Color(0.045,0.38,0.55)});
  const warm = new THREE.MeshBasicMaterial({color:new THREE.Color(0.72,0.46,0.22)});
  const batch = geometryBatch();
  const sphere=(radius,material,position,scale)=>batch.add(new THREE.SphereGeometry(radius,48,24),material,position,[0,0,0],scale);
  const torus=(radius,tube,material,y,scale=[1,1,1])=>batch.add(new THREE.TorusGeometry(radius,tube,8,96),material,[0,y,0],[Math.PI/2,0,0],scale);

  sphere(1,hull,[0,-0.28,0],[2.85,1.05,2.45]);
  batch.add(new THREE.CylinderGeometry(2.35,2.45,0.65,64),glass,[0,0.35,0],[0,0,0],[1.13,1,1]);
  sphere(1,armor,[0,0.73,0],[2.76,0.66,2.4]);
  torus(2.42,0.085,carbon,0.04,[1.13,1,1]);
  torus(2.35,0.075,armor,0.68,[1.13,1,1]);
  torus(2.44,0.025,cyan,-0.05,[1.13,1,1]);
  torus(1.48,0.025,cyan,1.28,[1.13,1,1]);
  sphere(1,carbon,[0,1.31,0],[0.8,0.19,0.8]);
  torus(0.66,0.035,armor,1.47);
  for(let index=0;index<36;index++) {
    const angle=index*Math.PI/18;
    const x=Math.cos(angle),z=Math.sin(angle);
    batch.add(new THREE.BoxGeometry(0.075,0.65,0.08),armor,[x*2.7,0.35,z*2.39],[0,-angle,0]);
    if(index%3!==0) {
      batch.add(new THREE.BoxGeometry(0.23,0.27,0.018),warm,[x*2.72,0.32,z*2.405],[0,Math.PI/2-angle,0]);
    }
  }
  for(const side of [-1,1]) {
    sphere(1,hull,[side*1.7,-1.04,0],[0.85,0.35,1.08]);
    batch.add(new THREE.TorusGeometry(0.64,0.035,8,40),cyan,[side*1.7,-1.25,0],[Math.PI/2,0,0],[1,1.3,1]);
    batch.add(new THREE.CylinderGeometry(0.17,0.24,1.2,12),bronze,[side*2.8,0,0],[0,0,Math.PI/2]);
    sphere(0.34,armor,[side*3.25,0,0],[1,1,1]);
  }
  const cabin=batch.finish();
  cabin.name='Observation cabin';
  const group=new THREE.Group();
  group.add(cabin);
  group.name='Survey vessel';
  const rings=[];
  for(let index=0;index<3;index++) {
    const radius=3.5+index*0.6;
    const ringBatch=geometryBatch();
    ringBatch.add(new THREE.TorusGeometry(radius,0.22,10,128),hull);
    for(const side of [-1,1]) {
      ringBatch.add(new THREE.TorusGeometry(radius,0.036,6,128),armor,[0,0,side*0.22]);
    }
    for(let segment=0;segment<32;segment++) {
      const angle=segment*Math.PI/16;
      const arc=Math.PI/16*0.72;
      for(const side of [-1,1]) {
        ringBatch.add(new THREE.TorusGeometry(radius,0.026,6,8,arc),cyan,[0,0,side*0.234],[0,0,angle]);
      }
      ringBatch.add(new THREE.BoxGeometry(0.5,0.075,0.5),segment%4===0?armor:carbon,[Math.cos(angle)*radius,Math.sin(angle)*radius,0],[0,0,angle]);
      if(segment%8===0) {
        ringBatch.add(new THREE.BoxGeometry(0.52,0.34,0.56),armor,[Math.cos(angle)*radius,Math.sin(angle)*radius,0],[0,0,angle]);
        ringBatch.add(new THREE.BoxGeometry(0.24,0.12,0.018),cyan,[Math.cos(angle)*radius,Math.sin(angle)*radius,0.29],[0,0,angle]);
      }
    }
    const rotor=ringBatch.finish();
    const gimbal=new THREE.Group();
    gimbal.add(rotor);
    group.add(gimbal);
    rings.push({gimbal,rotor});
  }
  const update=(time)=>{
    cabin.rotation.y=time*0.09;
    rings.forEach(({gimbal,rotor},index)=>{
      gimbal.rotation.set([0.28,1.05,-0.88][index]+Math.sin(index)*0.18+time*[0.13,-0.10,0.08][index],index*0.58+time*[0.028,0.022,-0.018][index],index*0.42);
      rotor.rotation.z=time*[0.24,-0.18,0.135][index]+index*0.7;
    });
  };
  update(0);
  // The full swept volume keeps every ring inside the flight envelope at any orientation.
  const bounds=new THREE.Box3(new THREE.Vector3(-5.1,-5.1,-5.1),new THREE.Vector3(5.1,5.1,5.1));
  return {group,bounds,update};
}

/** Flexible wings are a continuous surface, with a thick body, eyes, lobes, and a trailing tail. */
export function createManta(phase) {
  const positions=[],uvs=[],indices=[];
  const columns=64,rows=22;
  for(let row=0;row<=rows;row++) {
    const v=row/rows;
    for(let col=0;col<=columns;col++) {
      const u=col/columns, x=(u*2-1)*3.4, wing=Math.abs(x)/3.4;
      const leading=-1.05+Math.pow(wing,0.75)*1.82;
      const trailing=1.35-wing*0.58;
      const z=THREE.MathUtils.lerp(leading,trailing,v);
      const y=Math.sin(v*Math.PI)*0.14*(1-wing)+Math.exp(-x*x*3)*0.16;
      positions.push(x,y,z);uvs.push(u,v);
    }
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const a=row*(columns+1)+col,b=a+columns+1;
    indices.push(a,b,a+1,b,b+1,a+1);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uPhase:{value:phase}},vertexShader:mantaVertex,fragmentShader:mantaFragment,side:THREE.DoubleSide});
  const group=new THREE.Group();
  const wings=new THREE.Mesh(geometry,material);
  wings.frustumCulled=false;
  group.add(wings);
  const skin=new THREE.MeshStandardMaterial({color:0x092c38,metalness:0.23,roughness:0.47,emissive:0x03232a,emissiveIntensity:0.3});
  const anatomy=geometryBatch();
  anatomy.add(new THREE.SphereGeometry(1,20,12),skin,[0,0,0.05],[0,0,0],[0.48,0.24,1.13]);
  const glow=new THREE.MeshBasicMaterial({color:new THREE.Color(0.05,0.66,0.84)});
  for(const side of [-1,1]) {
    anatomy.add(new THREE.SphereGeometry(0.06,8,6),glow,[side*0.37,0.16,-0.70]);
    anatomy.add(new THREE.ConeGeometry(0.12,0.57,10),skin,[side*0.29,0.045,-1.22],[-Math.PI/2,0,side*-0.25]);
  }
  group.add(anatomy.finish());
  const tailGeometry=new THREE.BufferGeometry();
  const tailPositions=new Float32Array(36*3);
  tailGeometry.setAttribute('position',new THREE.BufferAttribute(tailPositions,3));
  const tail=new THREE.Line(tailGeometry,new THREE.LineBasicMaterial({color:0x298ca0,transparent:true,opacity:0.67}));
  tail.frustumCulled=false;group.add(tail);
  return {group,update(time){
    material.uniforms.uTime.value=time;
    for(let i=0;i<36;i++) {
      const t=i/35;
      tailPositions[i*3]=Math.sin(time*1.3+phase-t*3.1)*t*t*0.34;
      tailPositions[i*3+1]=Math.sin(time*1.3+phase-t*2)*t*0.16;
      tailPositions[i*3+2]=1.1+t*3.0;
    }
    tailGeometry.attributes.position.needsUpdate=true;
  }};
}

/** Depth-distributed points provide sparse stars or nearby drifting bioluminescence. */
export function createParticles(count, nearby=false) {
  const random=randomSequence(nearby?91:407);
  const positions=[],sizes=[],phases=[];
  for(let i=0;i<count;i++) {
    if(nearby)positions.push((random()-0.5)*105,random()*7+0.6,15-random()*95);
    else {
      const azimuth=random()*Math.PI*2, elevation=0.025+random()*1.3;
      positions.push(Math.cos(azimuth)*Math.cos(elevation)*2400,Math.sin(elevation)*2400,Math.sin(azimuth)*Math.cos(elevation)*2400);
    }
    sizes.push(nearby?0.6+random()*1.9:0.55+Math.pow(random(),5)*2.3);
    phases.push(random()*Math.PI*2);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aSize',new THREE.Float32BufferAttribute(sizes,1));
  geometry.setAttribute('aPhase',new THREE.Float32BufferAttribute(phases,1));
  const material=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0},uPixelRatio:{value:1},uDrift:{value:nearby?1.5:0},uColor:{value:new THREE.Color(nearby?0x43b9c9:0x8faabc)}},
    vertexShader:pointVertex,fragmentShader:pointFragment,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  });
  return new THREE.Points(geometry,material);
}

/** Concentrate ocean vertices near the camera, where wave silhouettes need the most detail. */
export function createOceanGeometry(compact) {
  const columns=compact?100:180,rows=compact?100:180;
  const positions=[],indices=[];
  for(let row=0;row<=rows;row++) {
    const t=row/rows, distance=4*(Math.exp(t*6.3)-1);
    const width=65+distance*1.6;
    for(let col=0;col<=columns;col++)positions.push((col/columns*2-1)*width,0,30-distance);
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const a=row*(columns+1)+col,b=a+columns+1;
    indices.push(a,a+1,b,a+1,b+1,b);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';
import { mantaVertex, mantaFragment, pointVertex, pointFragment } from './scene-shaders.js?v=3d-16';

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

/** Graphite survey vessel: pressure hull, open truss, radiators, centrifuge, and ion drives. */
export function createStarship() {
  const hull = new THREE.MeshStandardMaterial({color:0x283943,metalness:0.72,roughness:0.37,flatShading:true});
  const armor = new THREE.MeshStandardMaterial({color:0x465158,metalness:0.8,roughness:0.31,flatShading:true});
  const carbon = new THREE.MeshStandardMaterial({color:0x0c171d,metalness:0.55,roughness:0.56});
  const bronze = new THREE.MeshStandardMaterial({color:0x76634b,metalness:0.78,roughness:0.43});
  const glass = new THREE.MeshStandardMaterial({color:0x07181f,metalness:0.85,roughness:0.13,emissive:0x123e48,emissiveIntensity:0.3});
  const cyan = new THREE.MeshBasicMaterial({color:new THREE.Color(0.10,0.8,1.4)});
  const amber = new THREE.MeshBasicMaterial({color:new THREE.Color(1.2,0.48,0.10)});
  const batch = geometryBatch();
  const box=(size,material,position,rotation)=>batch.add(new THREE.BoxGeometry(...size),material,position,rotation);
  const cylinder=(r1,r2,length,material,position,rotation=[0,0,Math.PI/2],segments=12)=>
    batch.add(new THREE.CylinderGeometry(r1,r2,length,segments),material,position,rotation);
  const strut=(start,end,radius=0.045,material=armor)=>{
    const a=new THREE.Vector3(...start), b=new THREE.Vector3(...end);
    const geometry=new THREE.CylinderGeometry(radius,radius,a.distanceTo(b),6);
    const quaternion=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
    geometry.applyQuaternion(quaternion);
    batch.add(geometry,material,a.add(b).multiplyScalar(0.5).toArray());
  };

  batch.add(pressureHull([[-8,0.12,0.24,0],[-6.1,0.48,0.92,0.13],[-3.2,0.75,1.18,0.1],[-1.4,0.69,0.94,0.0]]),hull);
  batch.add(pressureHull([[-6.7,0.1,0.46,0.4],[-4.4,0.18,0.81,0.65],[-2.5,0.24,0.69,0.64]]),armor);
  batch.add(pressureHull([[-6.3,0.09,0.43,0.5],[-5.6,0.16,0.65,0.58],[-4.9,0.14,0.69,0.59]]),glass);
  box([3.7,0.09,0.48],carbon,[-3.7,0.94,0]);
  for (const side of [-1,1]) {
    box([2.4,0.16,0.035],bronze,[-3.15,0.28,side*1.045],[side*0.13,0,0]);
    for (let panel=0; panel<7; panel++) {
      box([0.29,0.03,1.16],armor,[-4.7+panel*0.42,0.92,side*0.03],[0,0,-0.04]);
      box([0.16,0.038,0.04],cyan,[-5.9+panel*0.22,0.58,side*(0.63+panel*0.022)]);
    }
    // The spine carries tensile loads between the habitable bow and the propulsion assembly.
    for (const y of [-0.48,0.48]) strut([-1.5,y,side*0.65],[5.8,y,side*0.65],0.075);
    for (let frame=0; frame<7; frame++) {
      const x=-1.2+frame;
      strut([x,-0.48,side*0.65],[x+1,0.48,side*0.65]);
      strut([x,0.48,side*0.65],[x+1,-0.48,side*0.65]);
      strut([x,-0.48,-0.65],[x,-0.48,0.65]);
    }
    cylinder(0.37,0.37,2.5,carbon,[2.0,-0.08,side*0.57]);
    cylinder(0.29,0.29,1.9,armor,[-0.1,-0.12,side*0.92]);
    for (let band=0; band<4; band++) cylinder(0.395,0.395,0.08,bronze,[1.0+band*0.66,-0.08,side*0.57]);
    // Thin segmented panels expose a large radiating area without enclosing the engine truss.
    for (let panel=0; panel<3; panel++) {
      const x=0.2+panel*1.45;
      box([1.3,0.065,2.8],carbon,[x,0.25,side*2.35],[side*-0.17,0,0.08]);
      for (let fin=0; fin<9; fin++) box([0.028,0.075,2.72],bronze,[x-0.55+fin*0.137,0.25,side*2.35],[side*-0.17,0,0.08]);
      box([1.33,0.09,0.065],armor,[x,0.48,side*3.72]);
    }
    strut([3.4,0,side*0.6],[4.4,-0.24,side*2.8],0.22,hull);
    strut([5.8,0,side*0.6],[6.2,-0.24,side*2.8],0.17,armor);
    cylinder(0.60,0.43,3.9,hull,[5.0,-0.24,side*2.8]);
    cylinder(0.64,0.64,0.14,bronze,[5.7,-0.24,side*2.8]);
    cylinder(0.73,0.47,1.15,carbon,[7.0,-0.24,side*2.8]);
    cylinder(0.75,0.75,0.1,armor,[7.58,-0.24,side*2.8]);
    cylinder(0.53,0.53,0.018,cyan,[7.65,-0.24,side*2.8]);
    for (let ring=0; ring<9; ring++) cylinder(0.615,0.615,0.038,armor,[3.35+ring*0.23,-0.24,side*2.8]);
    for (let rib=0; rib<8; rib++) {
      const a=rib*Math.PI/4;
      box([1.1,0.075,0.075],bronze,[6.97,-0.24+Math.sin(a)*0.60,side*2.8+Math.cos(a)*0.60]);
    }
    box([0.12,0.12,0.12],side===1?cyan:amber,[2.8,0.47,side*3.75]);
  }
  cylinder(0.57,0.48,2.3,hull,[5.6,0,0]);
  strut([-3.4,0.9,0],[-3.1,2.0,0],0.05);
  strut([-3.1,2.0,-0.7],[-3.1,2.0,0.7],0.024);
  strut([-7.7,0,0],[-9.0,0,0],0.025);
  cylinder(0.45,0.18,0.15,armor,[-2.1,1.27,0],[0,0,-0.42],24);
  box([0.07,0.1,0.07],amber,[-3.1,2.06,0]);
  const group=batch.finish();
  group.name='Survey vessel';

  const centrifuge=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.48,0.17,8,56),armor);
  ring.rotation.y=Math.PI/2;
  centrifuge.add(ring);
  for(let i=0;i<4;i++) {
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(0.12,2.9,0.12),carbon);
    spoke.rotation.x=i*Math.PI/4;
    centrifuge.add(spoke);
    const pod=new THREE.Mesh(new THREE.BoxGeometry(0.55,0.38,0.52),hull);
    pod.position.set(0,Math.cos(i*Math.PI/2)*1.48,Math.sin(i*Math.PI/2)*1.48);
    pod.rotation.x=i*Math.PI/2;
    centrifuge.add(pod);
  }
  centrifuge.position.x=-0.65;
  group.add(centrifuge);
  const exhaustMaterial=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:/* glsl */`uniform float uTime; varying vec2 vUv;
      void main(){
        float core=pow(1.0-vUv.y,2.4);
        float stream=0.75+0.25*sin(vUv.y*48.0-uTime*12.0);
        gl_FragColor=vec4(vec3(0.09,0.46,0.85)*core,core*0.22*stream);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  });
  for(const side of [-1,1]) {
    const plume=new THREE.Mesh(new THREE.CylinderGeometry(0.10,0.50,4.2,20,8,true),exhaustMaterial);
    plume.rotation.z=-Math.PI/2;
    plume.position.set(9.7,-0.24,side*2.8);
    group.add(plume);
  }
  return {group,update(time){centrifuge.rotation.x=time*0.16;exhaustMaterial.uniforms.uTime.value=time;}};
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

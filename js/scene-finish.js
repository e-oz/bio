import * as THREE from './vendor/three.module.min.js';

/** A small bloom buffer softens luminous crests without a full-resolution blur pyramid. */
export function createSceneFinish(renderer) {
  const type=renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType;
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.UnsignedByteType,depthBuffer:true});
  // sRGB storage preserves dark-tone precision in the multisampled color buffer.
  target.texture.colorSpace=THREE.SRGBColorSpace;
  target.resolveDepthBuffer=false;
  const glowA=new THREE.WebGLRenderTarget(1,1,{type,depthBuffer:false});
  const glowB=glowA.clone();
  const camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const scene=new THREE.Scene();
  const vertexShader='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}';
  const blur=new THREE.ShaderMaterial({
    uniforms:{uImage:{value:target.texture},uStep:{value:new THREE.Vector2()},uExtract:{value:1}},
    vertexShader,
    fragmentShader:/* glsl */`
      varying vec2 vUv;uniform sampler2D uImage;uniform vec2 uStep;uniform float uExtract;
      vec3 sampleLight(vec2 p){vec3 color=texture2D(uImage,p).rgb;return mix(color,max(vec3(0),color-0.32),uExtract);}
      void main(){
        vec3 color=sampleLight(vUv)*0.227027;
        color+=(sampleLight(vUv+uStep*1.384615)+sampleLight(vUv-uStep*1.384615))*0.316216;
        color+=(sampleLight(vUv+uStep*3.230769)+sampleLight(vUv-uStep*3.230769))*0.070270;
        gl_FragColor=vec4(color,1.0);
      }`,
    depthTest:false,depthWrite:false,toneMapped:false,
  });
  const composite=new THREE.ShaderMaterial({
    uniforms:{uImage:{value:target.texture},uGlow:{value:glowB.texture},uTexel:{value:new THREE.Vector2()},uBloom:{value:0.36},uSmooth:{value:0}},
    vertexShader,
    fragmentShader:/* glsl */`
      varying vec2 vUv;uniform sampler2D uImage;uniform sampler2D uGlow;uniform vec2 uTexel;uniform float uBloom;uniform float uSmooth;
      float luma(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}
      void main(){
        vec3 color=texture2D(uImage,vUv).rgb;
        if(uSmooth>0.0){
          vec3 north=texture2D(uImage,vUv+vec2(0,uTexel.y)).rgb;
          vec3 south=texture2D(uImage,vUv-vec2(0,uTexel.y)).rgb;
          vec3 east=texture2D(uImage,vUv+vec2(uTexel.x,0)).rgb;
          vec3 west=texture2D(uImage,vUv-vec2(uTexel.x,0)).rgb;
          float contrast=max(abs(luma(north)-luma(south)),abs(luma(east)-luma(west)));
          color=mix(color,(north+south+east+west)*0.25,smoothstep(0.035,0.18,contrast)*uSmooth);
        }
        color+=texture2D(uGlow,vUv).rgb*uBloom;
        vec2 center=vUv-0.5;
        color*=1.0-dot(center,center)*0.22;
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest:false,depthWrite:false,
  });
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),composite);
  scene.add(quad);
  let compact=false;
  return {
    get samples(){return target.samples;},
    resize(width,height,narrow){
      compact=narrow;
      const samples=Math.min(compact?2:4,renderer.capabilities.maxSamples);
      if(target.samples!==samples){target.samples=samples;target.dispose();}
      composite.uniforms.uSmooth.value=samples>0?0:0.32;
      target.setSize(width,height);
      glowA.setSize(Math.max(1,Math.round(width/4)),Math.max(1,Math.round(height/4)));
      glowB.setSize(glowA.width,glowA.height);
      composite.uniforms.uTexel.value.set(1/width,1/height);
      composite.uniforms.uBloom.value=compact?0:0.36;
      if(compact){renderer.setRenderTarget(glowB);renderer.clear();renderer.setRenderTarget(null);}
    },
    render(world,view){
      renderer.setRenderTarget(target);renderer.render(world,view);
      if(!compact){
        quad.material=blur;
        blur.uniforms.uImage.value=target.texture;blur.uniforms.uExtract.value=1;
        blur.uniforms.uStep.value.set(1/glowA.width,0);
        renderer.setRenderTarget(glowA);renderer.render(scene,camera);
        blur.uniforms.uImage.value=glowA.texture;blur.uniforms.uExtract.value=0;
        blur.uniforms.uStep.value.set(0,1/glowA.height);
        renderer.setRenderTarget(glowB);renderer.render(scene,camera);
      }
      quad.material=composite;renderer.setRenderTarget(null);renderer.render(scene,camera);
    },
  };
}

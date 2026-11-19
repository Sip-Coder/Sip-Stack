import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function autoTier(renderer) {
  const gl = renderer.getContext(),
    ext = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
  if (
    /swiftshader|llvmpipe|mali|adreno|powervr|apple gpu/i.test(gpu) ||
    (matchMedia('(pointer: coarse)').matches && devicePixelRatio >= 2)
  )
    return 'Mobile';
  if (
    /intel|iris|radeon.*graphics/i.test(gpu) ||
    devicePixelRatio > 2 ||
    renderer.capabilities.maxTextureSize < 8192
  )
    return 'Medium';
  return 'High';
}
export function pipeline(renderer, scene, camera, sea, sun) {
  const hdr = renderer.extensions.has('EXT_color_buffer_float') ? T.HalfFloatType : T.UnsignedByteType;
  const target = new T.WebGLRenderTarget(1, 1, { type: hdr });
  const composer = new EffectComposer(renderer, target);
  const beauty = new RenderPass(scene, camera);
  composer.addPass(beauty);
  let ao, reflect;
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.16, 0.37, 1.28);
  const solarScreen = new T.Vector3();
  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      depthMap: { value: null },
      sunUV: { value: new T.Vector2() },
      shafts: { value: 0 },
    },
    vertexShader:
      'varying vec2 v; void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse,depthMap; uniform vec2 sunUV; uniform float shafts; varying vec2 v;
    void main(){vec3 c=texture2D(tDiffuse,v).rgb; vec2 q=v-.5;
      if(shafts>0.) {
        // Only open sky along the solar ray contributes. Rooflines and trees occlude it.
        vec2 towardsSun=sunUV-v;float visible=0.;
        for(int i=0;i<12;i++) {
          vec2 uv=v+towardsSun*(float(i)+.5)/12.;
          visible+=smoothstep(.99935,.99996,texture2D(depthMap,uv).r);
        }
        c+=vec3(1.,.78,.52)*shafts*(visible/12.)*exp(-4.8*length(towardsSun));
      }
      c*=1.-.21*dot(q,q);gl_FragColor=vec4(c,1.);}`,
  });
  const aa = new SMAAPass(1, 1),
    output = new OutputPass();
  output.material.depthTest = false;
  output.material.depthWrite = false;
  for (const pass of [bloom, grade, aa, output]) composer.addPass(pass);
  for (const rt of [
    aa.edgesRT,
    aa.weightsRT,
    bloom.renderTargetBright,
    ...bloom.renderTargetsHorizontal,
    ...bloom.renderTargetsVertical,
  ])
    rt.texture.type = hdr;
  renderer.autoClear = false;
  const size = new T.Vector2();
  let tier,
    width = 0,
    height = 0,
    pendingResize = true;
  const detail = [];
  scene.traverse((o) => {
    if (o.userData.detail) detail.push(o);
  });
  function resize(w, h) {
    if (w > 0 && h > 0 && (width !== w || height !== h)) {
      width = w;
      height = h;
      pendingResize = true;
    }
  }
  function fitTargets() {
    // Resize and present in the same animation callback. A canvas dimension
    // assignment discards even a preserved drawing buffer.
    if (!pendingResize) return;
    const w = width,
      h = height;
    if (!w || !h) return;
    pendingResize = false;
    const ratio = Math.min(
      devicePixelRatio,
      tier === 'High' ? 1.75 : tier === 'Medium' ? 1.3 : 1.05,
      Math.sqrt((tier === 'Mobile' ? 620000 : 2000000) / (w * h)),
    );
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    renderer.getSize(size);
    if (size.x !== w || size.y !== h) renderer.setSize(w, h, false);
    composer.setPixelRatio(ratio);
    composer.setSize(w, h);
    renderer.getDrawingBufferSize(size);
    if (ao?.enabled) ao.setSize(Math.ceil(size.x * 0.58), Math.ceil(size.y * 0.58));
    else ao?.setSize(1, 1);
    // UnrealBloomPass starts its mip chain at half the supplied resolution.
    bloom.setSize(size.x, size.y);
    if (tier === 'High') reflect.setSize(Math.ceil(size.x * 0.5), Math.ceil(size.y * 0.5));
    else reflect?.setSize(1, 1);
  }
  function quality(next) {
    tier = next;
    if (next !== 'Mobile' && !ao) {
      ao = new SSAOPass(scene, camera, 1, 1, 12);
      ao.kernelRadius = 0.69;
      ao.minDistance = 0.0004;
      ao.maxDistance = 0.014;
      for (const rt of [ao.ssaoRenderTarget, ao.normalRenderTarget, ao.blurRenderTarget])
        rt.texture.type = hdr;
      composer.insertPass(ao, 1);
    }
    if (ao) ao.enabled = next !== 'Mobile';
    if (next === 'High' && !reflect) {
      reflect = new T.WebGLRenderTarget(1, 1, { type: hdr, depthTexture: new T.DepthTexture(1, 1) });
      grade.uniforms.depthMap.value = reflect.depthTexture;
      sea.uniforms.opaque.value = reflect.texture;
      sea.uniforms.sceneDepth.value = reflect.depthTexture;
    }
    sea.uniforms.useSSR.value = next === 'High';
    renderer.shadowMap.enabled = true;
    // Mobile caches a single low-resolution shadow map between light changes.
    renderer.shadowMap.autoUpdate = false;
    sun.shadow.mapSize.setScalar(next === 'High' ? 2048 : next === 'Medium' ? 1024 : 512);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    renderer.shadowMap.needsUpdate = true;
    for (const mesh of detail) {
      if (mesh.userData.detail === 'grass')
        mesh.count = Math.ceil(
          mesh.instanceMatrix.count * (next === 'High' ? 1 : next === 'Medium' ? 0.65 : 0.29),
        );
      else mesh.count = Math.ceil(mesh.instanceMatrix.count * (next === 'Mobile' ? 0.76 : 1));
    }
    pendingResize = true;
  }
  function render() {
    fitTargets();
    if (tier !== 'Mobile') renderer.shadowMap.needsUpdate = true;
    grade.uniforms.shafts.value = 0;
    if (tier === 'High') {
      solarScreen.copy(sea.uniforms.sunDir.value).multiplyScalar(180).add(camera.position).project(camera);
      if (solarScreen.z < 1 && Math.abs(solarScreen.x) < 1.2 && Math.abs(solarScreen.y) < 1.2) {
        grade.uniforms.sunUV.value.set(solarScreen.x * 0.5 + 0.5, solarScreen.y * 0.5 + 0.5);
        grade.uniforms.shafts.value = 0.055 * (1 - sea.uniforms.dusk.value);
      }
      sea.water.visible = false;
      renderer.setRenderTarget(reflect);
      renderer.clear();
      renderer.render(scene, camera);
      sea.water.visible = true;
    }
    composer.render();
  }
  return { quality, resize, render };
}

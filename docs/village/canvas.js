import * as T from 'three';
import { breeze } from './surfaces.js';

// The awning and each piece of washing retain their own pin, cut and dye.
// Their hem ripple is evaluated identically in the colour and shadow passes.
export function villageCanvas(scene, panels) {
  const geometry = new T.PlaneGeometry(1, 1, 10, 7);
  const cuts = new Float32Array(3 * panels.length);
  geometry.setAttribute('clothCut', new T.InstancedBufferAttribute(cuts, 3));
  const material = new T.MeshStandardMaterial({roughness: .78, side: T.DoubleSide});
  const depth = new T.MeshDepthMaterial({depthPacking: T.RGBADepthPacking, side: T.DoubleSide});
  function wave(shader) {
    shader.uniforms.clothTime = breeze;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      uniform float clothTime;
      attribute vec3 clothCut;
      void cutPanel(out vec3 p, out vec3 n) {
        vec2 pin=instanceMatrix[3].xz;
        float gust=.68*sin(clothTime*1.23+pin.x*.48+pin.y*.31)+.32*sin(clothTime*2.17-pin.y*.63);
        float u=position.x+.5, v=.5-position.y;
        float a=u*11.+v*2.-clothTime*2., d=.12*gust+.036*sin(a), slope=.036*cos(a);
        p=vec3(position.xy*clothCut.xy, v*d*clothCut.y);
        n=normalize(vec3(-clothCut.y/clothCut.x*v*11.*slope,v*2.*slope+d,1.));
        p.y-=.2*clothCut.z;
        float tilt=.22*gust*clothCut.z;
        mat2 swing=mat2(cos(tilt),sin(tilt),-sin(tilt),cos(tilt));
        p.yz=swing*p.yz; n.yz=swing*n.yz;
      }`).replace('#include <beginnormal_vertex>',
        'vec3 clothPosition, objectNormal; cutPanel(clothPosition,objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed, clothNormal; cutPanel(transformed,clothNormal);');
  }
  material.onBeforeCompile = depth.onBeforeCompile = wave;
  const mesh = new T.InstancedMesh(geometry, material, panels.length);
  const mount = new T.Object3D(), color = new T.Color();
  for (let i=0; i<panels.length; i++) {
    const [x,y,z,w,h,tilt,hanging,dye] = panels[i];
    mount.position.set(x,y,z); mount.rotation.x = tilt; mount.updateMatrix();
    mesh.setMatrixAt(i,mount.matrix); mesh.setColorAt(i,color.set(dye));
    cuts.set([w,h,hanging],i*3);
  }
  mesh.name='Cantina awning and laundry'; mesh.castShadow=mesh.receiveShadow=true;
  mesh.customDepthMaterial=depth; mesh.frustumCulled=false;
  scene.add(mesh);
}

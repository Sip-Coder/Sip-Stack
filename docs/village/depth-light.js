import * as T from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Reconstruct the nearby surfaces in view space. The same full-resolution depth
// also seats the water, traces its reflected scenery and occludes solar rays.
export function depthLighting(camera) {
  const uniforms = {
    colorMap:{value:null}, depthMap:{value:null}, inverseProjection:{value:camera.projectionMatrixInverse},
    pixels:{value:new T.Vector2(1,1)}, focal:{value:1},
  };
  const material = new T.ShaderMaterial({
    uniforms, depthFunc:T.AlwaysDepth, depthTest:true, depthWrite:true, blending:T.NoBlending,
    vertexShader:'varying vec2 v; void main(){v=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 v;
    uniform sampler2D colorMap,depthMap; uniform mat4 inverseProjection;
    uniform vec2 pixels; uniform float focal;
    vec3 point(vec2 uv,float depth){
      vec4 p=inverseProjection*vec4(uv*2.-1.,depth*2.-1.,1.);
      return p.xyz/p.w;
    }
    void main(){
      float depth=texture2D(depthMap,v).r;
      gl_FragDepth=depth;
      vec3 color=texture2D(colorMap,v).rgb;
      vec3 p=point(v,depth);
      vec3 normal=normalize(cross(dFdx(p),dFdy(p)));
      if(depth<.99999){
        float radius=.69;
        vec2 reach=radius*focal/max(.3,-p.z)*vec2(pixels.y/pixels.x,1.);
        float contact=0.;
        for(int i=0;i<12;i++){
          float f=(float(i)+.5)/12., angle=float(i)*2.399963;
          vec2 uv=clamp(v+vec2(cos(angle),sin(angle))*sqrt(f)*reach,0.,1.);
          vec3 delta=point(uv,texture2D(depthMap,uv).r)-p;
          float distanceToSample=length(delta);
          contact+=max(0.,dot(normal,delta)/max(distanceToSample,.001)-.06)
            *(1.-smoothstep(radius*.25,radius,distanceToSample));
        }
        color*=1.-min(.40,contact*.095);
      }
      gl_FragColor=vec4(color,1.);
    }`,
  });
  const quad = new FullScreenQuad(material);
  return (renderer, opaque) => {
    uniforms.colorMap.value=opaque.texture;
    uniforms.depthMap.value=opaque.depthTexture;
    uniforms.pixels.value.set(opaque.width,opaque.height);
    uniforms.focal.value=camera.projectionMatrix.elements[5]*.5;
    quad.render(renderer);
  };
}

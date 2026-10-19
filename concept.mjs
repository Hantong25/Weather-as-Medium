import * as T from 'three';
import {Reflector} from './vendor/three/Reflector.js';
import {BUILD,innerHalf,pebbleHeight,brickLayout} from './concept-model.mjs?v=2026.10.19.2';
const rad=d=>d*Math.PI/180;
// Calm puddle: dark water tint over black stones, mixed with the planar reflection. Visual approximation, not an optical calibration.
const waterShader={uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},
 vertexShader:`uniform mat4 textureMatrix;varying vec4 vUv;varying vec3 vWorld;void main(){vUv=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform vec3 color;uniform sampler2D tDiffuse;varying vec4 vUv;varying vec3 vWorld;void main(){vec3 base=texture2DProj(tDiffuse,vUv).rgb;float grazing=1.-abs(normalize(cameraPosition-vWorld).y);gl_FragColor=vec4(mix(color,base,.62+.38*pow(grazing,3.)),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`};
const LIGHTS={dark:{bg:'#15191b',hemi:.45,sun:.55,floor:'#3a3b39'},bright:{bg:'#c7cfcf',hemi:2.2,sun:2.6,floor:'#b7b0a4'}};
// Camera presets: orbit target + yaw/pitch (degrees) + distance.
export const VIEWS={
 overview:{target:[0,1,0],yaw:35,pitch:6,dist:3.8,explode:0},
 eye:{target:[.03,BUILD.waterY,-.02],yaw:0,pitch:68,dist:1.63,explode:0},
 puddle:{target:[.03,BUILD.waterY,-.02],yaw:24,pitch:78,dist:1.2,explode:0},
 layers:{target:[0,.45,0],yaw:38,pitch:24,dist:2.4,explode:1},
};
export function createConcept({host,reflectionHost,labelHost,sky,getView,getGeometry,onError}){
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false; // static model: shadows re-render only when it changes
 renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','3D concept model: A0 canopy above a brick-edged pebble puddle');host.append(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.02,60);
 const hemi=new T.HemisphereLight('#eaf4fb','#5e5f55',1);scene.add(hemi);
 const sun=new T.DirectionalLight('#fff2d6',1);sun.position.set(-2.5,4,2);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-1.5,right:1.5,top:1.5,bottom:-1.5,near:.1,far:10});sun.shadow.bias=-.0004;scene.add(sun);
 const box=new T.BoxGeometry(1,1,1);
 const part=(geo,mat,parent,[x,y,z],[sx,sy,sz]=[1,1,1])=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 // Square ring of four boxes between two half-widths.
 const ring=(mat,parent,outer,inner,y0,y1)=>{const t=outer-inner,mid=(outer+inner)/2,h=y1-y0,y=(y0+y1)/2;
  for(const [x,z,sx,sz] of [[0,-mid,outer*2,t],[0,mid,outer*2,t],[-mid,0,t,inner*2],[mid,0,t,inner*2]])part(box,mat,parent,[x,y,z],[sx,h,sz]);};
 const floorMat=new T.MeshStandardMaterial({roughness:.95});const floor=new T.Mesh(new T.PlaneGeometry(40,40),floorMat);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 // Layers move apart in the "layers" view.
 const layers={frame:new T.Group(),liner:new T.Group(),bed:new T.Group(),bricks:new T.Group(),canopy:new T.Group()};Object.values(layers).forEach(g=>scene.add(g));
 const H=BUILD.frameHeight,half=BUILD.frame/2,inner=innerHalf();
 const wood=new T.MeshStandardMaterial({color:'#b48a5a',roughness:.8});ring(wood,layers.frame,half,half-BUILD.wall,.012,H);part(box,wood,layers.frame,[0,.006,0],[BUILD.frame,.012,BUILD.frame]);
 const linerMat=new T.MeshStandardMaterial({color:'#121314',roughness:.42});ring(linerMat,layers.liner,half+BUILD.liner,inner,0,H+BUILD.liner);part(box,linerMat,layers.liner,[0,.0015,0],[BUILD.frame+.1,.003,BUILD.frame+.1]);
 const bricks=brickLayout(),brickMat=new T.MeshStandardMaterial({roughness:.9}),brickMesh=new T.InstancedMesh(box,brickMat,bricks.length),dummy=new T.Object3D(),tint=new T.Color();
 const placeBricks=spread=>{bricks.forEach(b=>{dummy.position.set(b.x*spread,b.y+.003,b.z*spread);dummy.rotation.set(0,b.ry,0);dummy.scale.set(b.length-.002,b.height-.002,b.width);dummy.updateMatrix();brickMesh.setMatrixAt(b.index,dummy.matrix);});brickMesh.instanceMatrix.needsUpdate=true;};
 placeBricks(1);bricks.forEach(b=>brickMesh.setColorAt(b.index,tint.setHSL(.03+.02*Math.sin(b.index*7.1),.45,.3+.05*Math.sin(b.index*3.3))));
 brickMesh.castShadow=brickMesh.receiveShadow=true;layers.bricks.add(brickMesh);
 // Pebble bed: dark heightfield plus instanced pebbles; underwater pebbles are skipped because the water surface hides them.
 const bedGeo=new T.PlaneGeometry(inner*2,inner*2,90,90);bedGeo.rotateX(-Math.PI/2);const bp=bedGeo.attributes.position;for(let i=0;i<bp.count;i++)bp.setY(i,pebbleHeight(bp.getX(i),bp.getZ(i))-.004);bedGeo.computeVertexNormals();
 const bed=new T.Mesh(bedGeo,new T.MeshStandardMaterial({color:'#0d0d0d',roughness:.9}));bed.receiveShadow=true;layers.bed.add(bed);
 let seed=11;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};const stones=[];
 for(let i=0;i<9000&&stones.length<4200;i++){const x=(random()*2-1)*(inner-.006),z=(random()*2-1)*(inner-.006),r=.005+random()*.005,y=pebbleHeight(x,z);if(y+r*.5>BUILD.waterY-.002)stones.push([x,y,z,r]);}
 const pebbleGeo=new T.IcosahedronGeometry(1,1),pebbles=new T.InstancedMesh(pebbleGeo,new T.MeshStandardMaterial({roughness:.5,metalness:.05}),stones.length);
 stones.forEach(([x,y,z,r],i)=>{dummy.position.set(x,y,z);dummy.rotation.set(random()*3,random()*6,random()*3);dummy.scale.set(r*(1+random()*.4),r*.6,r);dummy.updateMatrix();pebbles.setMatrixAt(i,dummy.matrix);pebbles.setColorAt(i,tint.setScalar(.035+random()*.05));});
 pebbles.receiveShadow=true;layers.bed.add(pebbles);
 const water=new Reflector(new T.PlaneGeometry(inner*2,inner*2),{shader:waterShader,color:'#0b1214',textureWidth:1024,textureHeight:1024,clipBias:.002,multisample:0});water.rotation.x=-Math.PI/2;water.position.y=BUILD.waterY;layers.bed.add(water);
 // A0 fabric with the projected sky added as light on its underside.
 const [cw,cd]=BUILD.canopy,fabric=part(box,new T.MeshStandardMaterial({color:'#e6e4dc',roughness:1}),layers.canopy,[0,.003,0],[cw,.006,cd]);
 const skyCopy=document.createElement('canvas');skyCopy.width=512;skyCopy.height=724;const skyContext=skyCopy.getContext('2d'),skyTexture=new T.CanvasTexture(skyCopy);skyTexture.colorSpace=T.SRGBColorSpace;
 const projected=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:skyTexture,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));projected.rotation.x=Math.PI/2;projected.position.y=-.002;layers.canopy.add(projected);
 const figure=new T.Group(),figureMat=new T.MeshStandardMaterial({color:'#8d918c',roughness:1});part(new T.CapsuleGeometry(.16,1.05,6,16),figureMat,figure,[0,.685,0]);part(new T.SphereGeometry(.105,20,12),figureMat,figure,[0,1.52,0]);figure.position.set(-1,0,-.45);scene.add(figure);
 // Orbit camera; presets ease towards their target.
 const state={...structuredClone(VIEWS.overview),light:'dark',labels:true},goal=structuredClone(VIEWS.overview);
 let explode=0,placedExplode=0,drag=null,disposed=false,lastTexture=0,lastRender=0,lastFrame=0,shadowKey='';
 const background=new T.Color();scene.background=background;
 function setView(name){Object.assign(goal,structuredClone(VIEWS[name]));}
 function orbit(dyaw,dpitch,zoom=1){goal.yaw=state.yaw+dyaw;goal.pitch=Math.max(-10,Math.min(88,state.pitch+dpitch));goal.dist=Math.max(.35,Math.min(12,state.dist*zoom));goal.target=[...state.target];}
 const canvas=renderer.domElement;canvas.style.touchAction='none';
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag||getView()!=='scene')return;orbit(-(e.clientX-drag.x)*.3,(e.clientY-drag.y)*.25);Object.assign(state,{yaw:goal.yaw,pitch:goal.pitch});drag={x:e.clientX,y:e.clientY};});
 canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('wheel',e=>{if(getView()!=='scene')return;e.preventDefault();orbit(0,0,Math.exp(e.deltaY*.001));},{passive:false});
 host.addEventListener('keydown',e=>{const step={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,6],ArrowDown:[0,-6]}[e.key];if(step){e.preventDefault();orbit(...step);}else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();orbit(0,0,e.key==='-'?1.15:.87);}});
 const resize=()=>{const p=canvas.parentElement;if(!p?.clientWidth||!p.clientHeight)return;renderer.setSize(p.clientWidth,p.clientHeight,false);camera.aspect=p.clientWidth/p.clientHeight;camera.updateProjectionMatrix();};
 new ResizeObserver(resize).observe(host);new ResizeObserver(resize).observe(reflectionHost);
 const labels=[...labelHost.querySelectorAll('[data-anchor]')],v=new T.Vector3();
 function anchors(g){const e=explode,c=g.height;return{canopy:[-cw/2,c,cd/2],sky:[0,c-.01,0],water:[.03,BUILD.waterY+e*.5,-.02],pebbles:[.22,.13+e*.5,.22],liner:[half,H+e*.25,-half],frame:[-half,H*.5,half],bricks:[half+.12+e*.22,.1,-.1],person:[figure.position.x,1.7,figure.position.z]};}
 function animate(now){if(disposed)return;requestAnimationFrame(animate);const view=getView(),parent=view==='scene'?host:view==='sky'?reflectionHost:null;if(!parent?.clientWidth||!parent.clientHeight||document.hidden)return;
  if(view!=='scene'&&now-lastRender<48)return;lastRender=now;if(canvas.parentElement!==parent){parent.append(canvas);resize();}
  try{
   const g=getGeometry(),light=LIGHTS[state.light];
   if(sky.canvas&&now-lastTexture>40){skyContext.drawImage(sky.canvas,0,0,skyCopy.width,skyCopy.height);skyTexture.needsUpdate=true;lastTexture=now;}
   // "Fill" covers the whole A0 sheet; circle and square outputs project an 841 mm square in the centre.
   projected.scale.set(cw,g.skyShape==='fill'?cd:cw,1);layers.canopy.position.y=g.height;
   background.set(light.bg);hemi.intensity=light.hemi;sun.intensity=light.sun;floorMat.color.set(light.floor);
   const k=1-Math.exp(-Math.min(.1,(now-(lastFrame||now))/1000)*6);lastFrame=now;
   for(const key of ['yaw','pitch','dist'])state[key]+=(goal[key]-state[key])*k;state.target=state.target.map((x,i)=>x+(goal.target[i]-x)*k);explode+=(goal.explode-explode)*k;
   const shown=view==='scene'?explode:0;layers.bed.position.y=shown*.5;layers.liner.position.y=shown*.25;if(Math.abs(shown-placedExplode)>1e-4){placedExplode=shown;placeBricks(1+shown*.55);}
   if(view==='scene'){const [tx,ty,tz]=state.target,y=rad(state.yaw),p=rad(state.pitch);camera.position.set(tx+Math.sin(y)*Math.cos(p)*state.dist,ty+Math.sin(p)*state.dist,tz+Math.cos(y)*Math.cos(p)*state.dist);camera.lookAt(tx,ty,tz);camera.fov=50;figure.visible=true;}
   else{const a=rad(g.angle),d=BUILD.viewDistance;camera.position.set(.03+Math.sin(a)*d,g.eyeHeight,-.02+Math.cos(a)*d);camera.lookAt(.03,BUILD.waterY,-.02);camera.fov=45;figure.visible=false;}
   const key=`${placedExplode}/${figure.visible}/${g.height}/${shown}`;if(key!==shadowKey){shadowKey=key;renderer.shadowMap.needsUpdate=true;}
   camera.updateProjectionMatrix();renderer.render(scene,camera);
   const show=view==='scene'&&state.labels,points=anchors(g);
   // Project anchors, then push overlapping labels down so close parts stay readable.
   const placed=[];
   for(const el of labels){const pt=points[el.dataset.anchor];if(!show||!pt||(el.dataset.anchor==='frame'&&explode<.5)){el.hidden=true;continue;}v.set(...pt).project(camera);el.hidden=v.z>1||Math.abs(v.x)>1.05||Math.abs(v.y)>1.05;if(!el.hidden)placed.push({el,x:(v.x*.5+.5)*host.clientWidth,y:(-v.y*.5+.5)*host.clientHeight,w:el.offsetWidth||160});}
   placed.sort((a,b)=>a.y-b.y).forEach((a,i)=>{for(const b of placed.slice(0,i))if(a.x<b.x+b.w&&b.x<a.x+a.w&&Math.abs(a.y-b.y)<24)a.y=b.y+24;a.el.style.transform=`translate(${a.x}px,${a.y}px)`;});
  }catch(error){disposed=true;onError(error.message);}
 }
 requestAnimationFrame(animate);
 return {renderer,camera,state,goal,setView,orbit,get explode(){return explode;},setLight(value){if(LIGHTS[value])state.light=value;},setLabels(value){state.labels=!!value;},setExplode(value){goal.explode=value?1:0;},
  dispose(){disposed=true;renderer.dispose();}};
}

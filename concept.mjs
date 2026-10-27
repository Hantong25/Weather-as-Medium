import * as T from 'three';
import {Reflector} from './vendor/three/Reflector.js';
import {BUILD,innerHalf,paverLayout,canopyRect,canopyStudy,viewers,mirrorScale,waterOutline,pebbleHeight} from './concept-model.mjs?v=2026.10.27.1';
const rad=d=>d*Math.PI/180;
// Calm pond: dark water tint mixed with the planar reflection. Visual approximation, not an optical calibration.
const waterShader={uniforms:{color:{value:null},tDiffuse:{value:null},textureMatrix:{value:null}},
 vertexShader:`uniform mat4 textureMatrix;varying vec4 vUv;varying vec3 vWorld;void main(){vUv=textureMatrix*vec4(position,1.);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform vec3 color;uniform sampler2D tDiffuse;varying vec4 vUv;varying vec3 vWorld;void main(){vec3 base=texture2DProj(tDiffuse,vUv).rgb;float grazing=1.-abs(normalize(cameraPosition-vWorld).y);gl_FragColor=vec4(mix(color,base,.62+.38*pow(grazing,3.)),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`};
const LIGHTS={dark:{bg:'#15191b',hemi:.45,sun:.55,floor:'#3a3b39'},bright:{bg:'#c7cfcf',hemi:2.2,sun:2.6,floor:'#b7b0a4'}};
// Camera presets: orbit target + yaw/pitch (degrees) + distance.
export const VIEWS={
 overview:{target:[0,1.1,0],yaw:62,pitch:8,dist:4.6,explode:0},
 eye:{target:[0,BUILD.waterY,0],yaw:0,pitch:68,dist:1.63,explode:0},
 puddle:{target:[0,BUILD.waterY,0],yaw:24,pitch:78,dist:1.2,explode:0},
 layers:{target:[0,.35,0],yaw:115,pitch:24,dist:2.4,explode:1},
 // Straight down: where sky is missing from the reflections and how each standing spot fares; 0° viewers at the bottom.
 plan:{target:[0,1.2,0],yaw:0,pitch:88,dist:6.5,explode:0},
};
export function createConcept({host,reflectionHost,labelHost,sky,getView,getGeometry,onError}){
 const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false; // static model: shadows re-render only when it changes
 renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','3D concept model: projection canopy above a paver-edged pond on a 1 m base');host.append(renderer.domElement);
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,1,.02,60);
 const hemi=new T.HemisphereLight('#eaf4fb','#5e5f55',1);scene.add(hemi);
 const sun=new T.DirectionalLight('#fff2d6',1);sun.position.set(-2.5,4,2);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-3,right:3,top:3,bottom:-3,near:.1,far:12});sun.shadow.bias=-.0004;scene.add(sun);
 const box=new T.BoxGeometry(1,1,1);
 const part=(geo,mat,parent,[x,y,z],[sx,sy,sz]=[1,1,1])=>{const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
 // Square ring of four boxes between two half-widths.
 const ring=(mat,parent,outer,inner,y0,y1)=>{const t=outer-inner,mid=(outer+inner)/2,h=y1-y0,y=(y0+y1)/2;
  for(const [x,z,sx,sz] of [[0,-mid,outer*2,t],[0,mid,outer*2,t],[-mid,0,t,inner*2],[mid,0,t,inner*2]])part(box,mat,parent,[x,y,z],[sx,h,sz]);};
 const floorMat=new T.MeshStandardMaterial({roughness:.95});const floor=new T.Mesh(new T.PlaneGeometry(40,40),floorMat);floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 // Layers move apart in the "layers" view. `bricks` holds the pavers.
 const layers={frame:new T.Group(),liner:new T.Group(),bed:new T.Group(),bricks:new T.Group(),canopy:new T.Group()};Object.values(layers).forEach(g=>scene.add(g));
 const H=BUILD.frameHeight,half=BUILD.base/2,inner=innerHalf();
 const timber=new T.MeshStandardMaterial({color:'#1c1c1b',roughness:.7});ring(timber,layers.frame,half,inner,BUILD.board,H);part(box,timber,layers.frame,[0,BUILD.board/2,0],[BUILD.base,BUILD.board,BUILD.base]);
 // Pond parts follow the gravel and water sizes: liner sheet, gravel bed (a height field that dips under the water),
 // loose stones on its dry part, the irregular water surface, and the paver rows around the gravel.
 const liner=part(box,new T.MeshStandardMaterial({color:'#101112',roughness:.42}),layers.liner,[0,BUILD.board+BUILD.liner/2,0]);
 const bedMat=new T.MeshStandardMaterial({color:'#0e0e0e',roughness:.95}),stoneGeo=new T.IcosahedronGeometry(1,1),stoneMat=new T.MeshStandardMaterial({roughness:.55,metalness:.05});let bed=null,stones=null;
 const water=new Reflector(new T.PlaneGeometry(1,1),{shader:waterShader,color:'#0b1214',textureWidth:1024,textureHeight:1024,clipBias:.002,multisample:0});water.rotation.x=-Math.PI/2;water.position.y=BUILD.waterY;layers.bed.add(water);
 const paverMat=new T.MeshStandardMaterial({roughness:.92}),dummy=new T.Object3D(),tint=new T.Color();let pavers=null,paverList=[],pond='',placedSpread=1;
 const placePavers=spread=>{placedSpread=spread;paverList.forEach(p=>{dummy.position.set(p.x*spread,p.y,p.z*spread);dummy.rotation.set(0,0,0);dummy.scale.set(p.sx,p.height-.002,p.sz);dummy.updateMatrix();pavers.setMatrixAt(p.index,dummy.matrix);});pavers.instanceMatrix.needsUpdate=true;};
 function shapePond(g){
  const w=g.pondWidth,d=g.pondDepth;
  const key=[w,d,g.waterWidth,g.waterDepth].join('/');if(pond===key)return;pond=key;
  liner.scale.set(w+.04,BUILD.liner,d+.04);
  if(bed){layers.bed.remove(bed);bed.geometry.dispose();}
  const bedGeo=new T.PlaneGeometry(w,d,90,90);bedGeo.rotateX(-Math.PI/2);const bp=bedGeo.attributes.position;for(let i=0;i<bp.count;i++)bp.setY(i,pebbleHeight(g,bp.getX(i),bp.getZ(i))-.003);bedGeo.computeVertexNormals();
  bed=new T.Mesh(bedGeo,bedMat);bed.receiveShadow=true;layers.bed.add(bed);
  // Stones only where they stand above the water; the water's surface hides the rest.
  if(stones){layers.bed.remove(stones);stones.dispose();}
  let seed=11;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;},list=[];
  for(let i=0;i<24000&&list.length<6000;i++){const x=(random()-.5)*(w-.008),z=(random()-.5)*(d-.008),y=pebbleHeight(g,x,z),r=.003+random()*.004;if(y+r*.5>BUILD.waterY+.001)list.push([x,y,z,r]);}
  stones=new T.InstancedMesh(stoneGeo,stoneMat,list.length);stones.receiveShadow=true;
  list.forEach(([x,y,z,r],i)=>{dummy.position.set(x,y,z);dummy.rotation.set(random()*3,random()*6,random()*3);dummy.scale.set(r*(1+random()*.4),r*.6,r);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);stones.setColorAt(i,tint.setScalar(.03+random()*.05));});
  layers.bed.add(stones);
  // ShapeGeometry is drawn in x, y; the mesh's rotation maps its y to −z.
  water.geometry.dispose();water.geometry=new T.ShapeGeometry(new T.Shape(waterOutline(g).map(([x,z])=>new T.Vector2(x,-z))),1);
  if(pavers){layers.bricks.remove(pavers);pavers.dispose();}
  paverList=paverLayout(w,d);pavers=new T.InstancedMesh(box,paverMat,paverList.length);pavers.castShadow=pavers.receiveShadow=true;
  paverList.forEach(p=>pavers.setColorAt(p.index,tint.setHSL(.1,.04,.36+.04*Math.sin(p.index*3.7))));layers.bricks.add(pavers);placePavers(placedSpread);
 }
 // Canopy fabric with the projected sky added as light on its underside.
 const fabric=part(box,new T.MeshStandardMaterial({color:'#e6e4dc',roughness:1}),layers.canopy,[0,.003,0]);
 const skyCopy=document.createElement('canvas');skyCopy.width=512;skyCopy.height=724;const skyContext=skyCopy.getContext('2d'),skyTexture=new T.CanvasTexture(skyCopy);skyTexture.colorSpace=T.SRGBColorSpace;
 // Circle and square skies sit on paper in the studio, where the projector gives no light. Taking the difference with
 // (1 − keep) × paper, from the shader's own edge mask, leaves only the projected light on the canopy.
 const paperCanvas=document.createElement('canvas');paperCanvas.width=skyCopy.width;paperCanvas.height=skyCopy.height;let paperKey='';
 const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
 function unlitPaper(g,W,H){
  const key=[W,H,g.skyShape].join('/');if(key===paperKey)return paperCanvas;paperKey=key;
  const square=g.skyShape==='square',short=Math.min(W,H)*.49,image=new ImageData(paperCanvas.width,paperCanvas.height),d=image.data;
  for(let j=0;j<image.height;j++)for(let i=0;i<image.width;i++){
   const qx=((i+.5)/image.width-.5)*W/short,qy=((j+.5)/image.height-.5)*H/short,boundary=square?Math.max(Math.abs(qx),Math.abs(qy)):Math.hypot(qx,qy);
   const keep=boundary>1?0:1-smooth((boundary-.992)/.008),o=(j*image.width+i)*4;
   d[o]=236*(1-keep);d[o+1]=235*(1-keep);d[o+2]=229*(1-keep);d[o+3]=255;
  }
  paperCanvas.getContext('2d').putImageData(image,0,0);return paperCanvas;
 }
 const projected=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:skyTexture,blending:T.AdditiveBlending,depthWrite:false,toneMapped:false}));projected.rotation.x=Math.PI/2;projected.position.y=-.002;layers.canopy.add(projected);
 const figure=new T.Group(),figureMat=new T.MeshStandardMaterial({color:'#8d918c',roughness:1});part(new T.CapsuleGeometry(.16,1.05,6,16),figureMat,figure,[0,.685,0]);part(new T.SphereGeometry(.105,20,12),figureMat,figure,[0,1.52,0]);scene.add(figure);
 // Canopy study overlay. Amber: ceiling that viewers see in the pond but that has no projected sky. Dashed outline:
 // the smallest canopy that fills every reflection. Floor dots: share of the pond showing sky from that spot.
 // White lines: the reflection-check viewer's sight lines to the pond corners and on to the ceiling.
 const study=new T.Group();scene.add(study);
 const needCanvas=document.createElement('canvas');needCanvas.width=needCanvas.height=512;const needContext=needCanvas.getContext('2d'),needTexture=new T.CanvasTexture(needCanvas);needTexture.colorSpace=T.SRGBColorSpace;
 const need=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:needTexture,transparent:true,opacity:.6,depthWrite:false,side:T.DoubleSide,toneMapped:false}));need.rotation.x=-Math.PI/2;need.renderOrder=2;study.add(need);
 const outline=new T.LineLoop(new T.BufferGeometry(),new T.LineDashedMaterial({color:'#efb746',dashSize:.06,gapSize:.04,depthTest:false,transparent:true}));outline.renderOrder=3;study.add(outline);
 const sight=new T.LineSegments(new T.BufferGeometry(),new T.LineBasicMaterial({color:'#ffffff',transparent:true,opacity:.6}));study.add(sight);
 // Dots draw after the amber layer (which writes no depth), so it does not tint them; solid parts still hide them.
 const dots=new T.InstancedMesh(new T.CylinderGeometry(.022,.022,.006,20),new T.MeshBasicMaterial({toneMapped:false,transparent:true}),48);dots.count=0;dots.renderOrder=4;study.add(dots);
 // The overlay lives on layer 1: the main camera sees it, the water's mirror camera (layer 0 only) does not.
 for(const o of [need,outline,sight,dots])o.layers.set(1);camera.layers.enable(1);
 function drawStudy(g){
  const result=canopyStudy(g),c=canopyRect(g),r=result.required,y=g.height;
  // Square texture over everything seen in the water plus the canopy, so the overlay never stretches.
  const x0=Math.min(r.x-r.width/2,c.x-c.hw),x1=Math.max(r.x+r.width/2,c.x+c.hw),z0=Math.min(r.z-r.depth/2,c.z-c.hd),z1=Math.max(r.z+r.depth/2,c.z+c.hd);
  const size=Math.max(x1-x0,z1-z0)+.1,cx=(x0+x1)/2,cz=(z0+z1)/2,s=512/size,px=x=>(x-cx+size/2)*s,pz=z=>(z-cz+size/2)*s;
  needContext.clearRect(0,0,512,512);needContext.fillStyle='#efb746';
  // Patches every 1° (the readout samples every 5°), so the rounded corners of the amber area stay smooth.
  const shoreline=waterOutline(g,48);
  for(const v of viewers({...g,step:1})){const k=mirrorScale(v,y);needContext.beginPath();shoreline.forEach(([x,z],i)=>needContext[i?'lineTo':'moveTo'](px(x+k*(x-v.x)),pz(z+k*(z-v.z))));needContext.fill();}
  needContext.globalCompositeOperation='destination-out';needContext.beginPath();
  if(g.skyShape==='circle')needContext.arc(px(c.x),pz(c.z),c.hw*s,0,Math.PI*2);else needContext.rect(px(c.x-c.hw),pz(c.z-(g.skyShape==='square'?c.hw:c.hd)),2*c.hw*s,2*(g.skyShape==='square'?c.hw:c.hd)*s);
  needContext.fill();needContext.globalCompositeOperation='source-over';needTexture.needsUpdate=true;
  need.position.set(cx,y-.004,cz);need.scale.set(size,size,1);
  outline.geometry.dispose();outline.geometry=new T.BufferGeometry().setFromPoints([[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>new T.Vector3(r.x+a*r.width/2,y-.005,r.z+b*r.depth/2)));outline.computeLineDistances();
  // One dot per 15° at the nearest and farthest standing distance, coloured by its worst eye height.
  const spots=new Map();
  for(const v of result.viewers){if(v.angle%15||(v.distance!==Math.min(g.viewNear,g.viewFar)&&v.distance!==Math.max(g.viewNear,g.viewFar)))continue;const key=`${v.angle}/${v.distance}`,prev=spots.get(key);if(!prev||v.coverage<prev.coverage)spots.set(key,v);}
  dots.count=Math.min(48,spots.size);[...spots.values()].slice(0,48).forEach((v,i)=>{dummy.position.set(v.x,.004,v.z);dummy.rotation.set(0,0,0);dummy.scale.set(1,1,1);dummy.updateMatrix();dots.setMatrixAt(i,dummy.matrix);dots.setColorAt(i,tint.setHSL(.33*v.coverage,.62,.5));});
  dots.instanceMatrix.needsUpdate=true;if(dots.instanceColor)dots.instanceColor.needsUpdate=true;
  // The reflection-check viewer: eye → four points of the shore → ceiling.
  const a=rad(g.angle),eye={x:Math.sin(a)*g.viewNear,z:Math.cos(a)*g.viewNear,eye:g.eyeHeight},k=mirrorScale(eye,y),points=[];
  for(const [u,w] of waterOutline(g,4)){const P=new T.Vector3(u,BUILD.waterY,w);points.push(new T.Vector3(eye.x,g.eyeHeight,eye.z),P,P,new T.Vector3(P.x+k*(P.x-eye.x),y,P.z+k*(P.z-eye.z)));}
  sight.geometry.dispose();sight.geometry=new T.BufferGeometry().setFromPoints(points);
  figure.position.set(eye.x,0,eye.z);figure.scale.setScalar(g.eyeHeight/1.55);
 }
 // Orbit camera; presets ease towards their target.
 const state={...structuredClone(VIEWS.overview),light:'dark',labels:true,study:true},goal=structuredClone(VIEWS.overview);
 let explode=0,placedExplode=0,drag=null,disposed=false,lastTexture=0,lastRender=0,lastFrame=0,shadowKey='',studyKey='';
 const background=new T.Color();scene.background=background;
 function setView(name){
  const view=structuredClone(VIEWS[name]);
  // The visitor view looks from the reflection-check visitor's eyes.
  if(name==='eye'){const g=getGeometry(),h=g.eyeHeight-BUILD.waterY;Object.assign(view,{yaw:g.angle,pitch:Math.atan2(h,g.viewNear)*180/Math.PI,dist:Math.hypot(h,g.viewNear)});}
  Object.assign(goal,view);
 }
 function orbit(dyaw,dpitch,zoom=1){goal.yaw=state.yaw+dyaw;goal.pitch=Math.max(-10,Math.min(88,state.pitch+dpitch));goal.dist=Math.max(.35,Math.min(14,state.dist*zoom));goal.target=[...state.target];}
 const canvas=renderer.domElement;canvas.style.touchAction='none';
 canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag||getView()!=='scene')return;orbit(-(e.clientX-drag.x)*.3,(e.clientY-drag.y)*.25);Object.assign(state,{yaw:goal.yaw,pitch:goal.pitch});drag={x:e.clientX,y:e.clientY};});
 canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
 canvas.addEventListener('wheel',e=>{if(getView()!=='scene')return;e.preventDefault();orbit(0,0,Math.exp(e.deltaY*.001));},{passive:false});
 host.addEventListener('keydown',e=>{const step={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,6],ArrowDown:[0,-6]}[e.key];if(step){e.preventDefault();orbit(...step);}else if(e.key==='+'||e.key==='='||e.key==='-'){e.preventDefault();orbit(0,0,e.key==='-'?1.15:.87);}});
 const resize=()=>{const p=canvas.parentElement;if(!p?.clientWidth||!p.clientHeight)return;renderer.setSize(p.clientWidth,p.clientHeight,false);camera.aspect=p.clientWidth/p.clientHeight;camera.updateProjectionMatrix();};
 new ResizeObserver(resize).observe(host);new ResizeObserver(resize).observe(reflectionHost);
 const labels=[...labelHost.querySelectorAll('[data-anchor]')],v=new T.Vector3();
 function anchors(g){const e=explode,c=canopyRect(g),h=g.height;return{canopy:[c.x-c.hw,h,c.z+c.hd],sky:[c.x,h-.01,c.z],water:[g.waterWidth*.15,BUILD.waterY+e*.5,-g.waterDepth*.15],pebbles:[g.pondWidth*.4,BUILD.gravelY+e*.5,g.pondDepth*.4],liner:[g.pondWidth/2,BUILD.board+e*.25,-g.pondDepth/2],frame:[-half,H*.5,half],bricks:[(inner+g.pondWidth/2)/2*(1+e*.55),BUILD.board+BUILD.paver.height,-.1],person:[figure.position.x,g.eyeHeight+.12,figure.position.z]};}
 function animate(now){if(disposed)return;requestAnimationFrame(animate);const view=getView(),parent=view==='scene'?host:view==='sky'?reflectionHost:null;if(!parent?.clientWidth||!parent.clientHeight||document.hidden)return;
  if(view!=='scene'&&now-lastRender<48)return;lastRender=now;if(canvas.parentElement!==parent){parent.append(canvas);resize();}
  try{
   const g=getGeometry(),light=LIGHTS[state.light],c=canopyRect(g);shapePond(g);
   if(sky.canvas&&now-lastTexture>40){skyContext.drawImage(sky.canvas,0,0,skyCopy.width,skyCopy.height);if(g.skyShape!=='fill'){skyContext.globalCompositeOperation='difference';skyContext.drawImage(unlitPaper(g,sky.canvas.width,sky.canvas.height),0,0);skyContext.globalCompositeOperation='source-over';}skyTexture.needsUpdate=true;lastTexture=now;}
   // "Fill" covers the whole canopy; circle and square outputs project a square of the canopy width in its centre.
   fabric.scale.set(c.hw*2,.006,c.hd*2);projected.scale.set(c.hw*2,g.skyShape==='fill'?c.hd*2:c.hw*2,1);layers.canopy.position.set(c.x,g.height,c.z);
   const key=['height','diameter','skyAspect','skyShape','panelX','panelZ','pondWidth','pondDepth','waterWidth','waterDepth','eyeLow','eyeHeight','viewNear','viewFar','viewArc','angle'].map(k=>g[k]).join('/');
   // The overlay shows only in the 3D view; it is recounted when that view opens.
   if(view==='scene'&&key!==studyKey){studyKey=key;drawStudy(g);}
   background.set(light.bg);hemi.intensity=light.hemi;sun.intensity=light.sun;floorMat.color.set(light.floor);
   const k=1-Math.exp(-Math.min(.1,(now-(lastFrame||now))/1000)*6);lastFrame=now;
   for(const name of ['yaw','pitch','dist'])state[name]+=(goal[name]-state[name])*k;state.target=state.target.map((x,i)=>x+(goal.target[i]-x)*k);explode+=(goal.explode-explode)*k;
   const shown=view==='scene'?explode:0;layers.bed.position.y=shown*.5;layers.liner.position.y=shown*.25;if(Math.abs(shown-placedExplode)>1e-4){placedExplode=shown;placePavers(1+shown*.55);}
   if(view==='scene'){const [tx,ty,tz]=state.target,y=rad(state.yaw),p=rad(state.pitch);camera.position.set(tx+Math.sin(y)*Math.cos(p)*state.dist,ty+Math.sin(p)*state.dist,tz+Math.cos(y)*Math.cos(p)*state.dist);camera.lookAt(tx,ty,tz);camera.fov=50;study.visible=state.study;
    // The figure steps aside when the camera reaches its eyes (visitor view).
    figure.visible=camera.position.distanceTo(v.set(figure.position.x,g.eyeHeight,figure.position.z))>.45;}
   else{const a=rad(g.angle),d=g.viewNear;camera.position.set(Math.sin(a)*d,g.eyeHeight,Math.cos(a)*d);camera.lookAt(0,BUILD.waterY,0);camera.fov=45;figure.visible=false;study.visible=false;}
   const shadows=`${placedExplode}/${figure.visible}/${key}/${shown}`;if(shadows!==shadowKey){shadowKey=shadows;renderer.shadowMap.needsUpdate=true;}
   camera.updateProjectionMatrix();renderer.render(scene,camera);
   const show=view==='scene'&&state.labels,points=anchors(g);
   // Project anchors, then push overlapping labels down so close parts stay readable.
   const placed=[];
   for(const el of labels){const pt=points[el.dataset.anchor];if(!show||!pt||(el.dataset.anchor==='liner'&&explode<.5)){el.hidden=true;continue;}v.set(...pt).project(camera);el.hidden=v.z>1||Math.abs(v.x)>1.05||Math.abs(v.y)>1.05;if(!el.hidden)placed.push({el,x:(v.x*.5+.5)*host.clientWidth,y:(-v.y*.5+.5)*host.clientHeight,w:el.offsetWidth||160});}
   placed.sort((a,b)=>a.y-b.y).forEach((a,i)=>{for(const b of placed.slice(0,i))if(a.x<b.x+b.w&&b.x<a.x+a.w&&Math.abs(a.y-b.y)<24)a.y=b.y+24;a.el.style.transform=`translate(${a.x}px,${a.y}px)`;});
  }catch(error){disposed=true;onError(error.message);}
 }
 requestAnimationFrame(animate);
 return {renderer,camera,state,goal,setView,orbit,get explode(){return explode;},setLight(value){if(LIGHTS[value])state.light=value;},setLabels(value){state.labels=!!value;},setExplode(value){goal.explode=value?1:0;},setStudy(value){state.study=!!value;},
  dispose(){disposed=true;renderer.dispose();}};
}

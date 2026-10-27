// Metres, with floor Y=0. Layouts are proposals, not measured venue plans.
export const DEFAULT_GEOMETRY = { skyShape:'fill', skyAspect:.841/1.189, angle:0, height:2.27, diameter:.841, panelX:0, panelZ:0, tiltX:0, tiltZ:0, panelYaw:0,
  baseX:0, baseZ:0, baseY:0, baseHeight:.07, baseRotation:0, area:Math.PI*.5**2, pondScale:1,
  eyeHeight:1.62, distance:2.64, farDistance:5, fov:60, viewMode:'walk', eyeX:0, eyeZ:5, yaw:180, pitch:-6,
  layout:'custom', equipment:false,
  // Canopy study (2026-10-23): gravel area in the centre of the 1 m base (pond*), the water inside it (water*), where
  // viewers stand and how low their eyes go.
  pondWidth:.58, pondDepth:.58, waterWidth:.42, waterDepth:.38, eyeLow:1.2, viewNear:.65, viewFar:1, viewArc:'all', customPools:[{x:0,z:0,width:.5,depth:.5,scale:1,angle:0,seed:0,roughness:0,shape:2}], objects:[], surface:{material:'stone',color:'#797e70'}, quality:'auto', waterDropMm:3, shoreRetreat:10 };
export const LAYOUTS = { center:{label:'中央单水洼',count:1}, edge:{label:'单圈边缘水洼',count:8}, double:{label:'内外双圈水洼',count:14}, custom:{label:'自定义水洼',count:0} };
const rad = x => (x || 0)*Math.PI/180;
export const dot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
export const unit = v => { const n=Math.hypot(...v); return v.map(x=>x/(n||1)); };
export function landRadius(g) { return Math.sqrt((g.area ?? Math.PI)/Math.PI); }
export function panelFrame(g) {
  const x=rad(g.tiltX),z=rad(g.tiltZ),yaw=rad(g.panelYaw),rotate=v=>[Math.cos(yaw)*v[0]+Math.sin(yaw)*v[2],v[1],-Math.sin(yaw)*v[0]+Math.cos(yaw)*v[2]];
  return {center:[g.panelX||0,g.height,g.panelZ||0],u:rotate([Math.cos(z),Math.sin(z)*Math.cos(x),Math.sin(z)*Math.sin(x)]),v:rotate([0,-Math.sin(x),Math.cos(x)]),normal:rotate([-Math.sin(z),Math.cos(z)*Math.cos(x),Math.cos(z)*Math.sin(x)])};
}
export const waterLevel=g=>g.waterY??((g.baseY||0)+(g.baseHeight||0));
export function observer(g) {
  if(g.viewMode==='free')return [g.eyeX,g.eyeHeight,g.eyeZ];
  return [(g.baseX||0)+Math.sin(rad(g.angle))*g.distance,g.eyeHeight,(g.baseZ||0)+Math.cos(rad(g.angle))*g.distance];
}
export function cameraFrame(g) {
  const eye=observer(g),yaw=rad(g.yaw),pitch=rad(g.pitch);
  const forward=g.viewMode==='free'?[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)]
    :unit([(g.baseX||0)-eye[0],(g.targetHeight??g.baseHeight??0)-eye[1],(g.baseZ||0)-eye[2]]);
  const right=unit([-forward[2],0,forward[0]]);
  const up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]];
  return {eye,forward,right,up};
}
export function puddles(g) {
  if(g.layout==='custom'){
    const a=rad(g.baseRotation),c=Math.cos(a),s=Math.sin(a),scale=g.pondScale??1;
    return (g.customPools||[]).slice(0,16).map(p=>({x:(g.baseX||0)+c*p.x+s*p.z,z:(g.baseZ||0)-s*p.x+c*p.z,
      a:p.width/2*scale*(p.scale??1),b:p.depth/2*scale*(p.scale??1),angle:rad(p.angle)-a,seed:p.seed,shape:p.shape,roughness:p.roughness,name:p.name,color:p.color,material:p.material,elevation:p.elevation,basinDepth:p.basinDepth}));
  }
  const R=landRadius(g),scale=g.pondScale??1,result=[];
  const ring=(n,r,a,b,start)=>{for(let i=0;i<n;i++){const angle=(i+.5)*Math.PI*2/n+rad(g.baseRotation);
    result.push({x:Math.sin(angle)*r*R,z:Math.cos(angle)*r*R,a:a*R*scale,b:b*R*scale,seed:(start+i)*2.13,angle:Math.PI/2-angle});}};
  if(!g.layout||g.layout==='center')result.push({x:0,z:0,a:.25*scale,b:.25*scale,seed:0,angle:rad(g.baseRotation)});
  else if(g.layout==='edge')ring(8,.73,.13,.22,0);
  else {ring(8,.88,.11,.28,0);ring(6,.48,.09,.145,8);}
  return result.map(p=>({...p,shape:!g.layout||g.layout==='center'?0:1,roughness:1,x:p.x+(g.baseX||0),z:p.z+(g.baseZ||0)}));
}
export function outline(theta,seed,center=false,roughness=1,shape=center?0:1) {
  if(shape===4)return .78+.22*Math.cos(2*theta)+roughness*.04*Math.sin(5*theta+seed);
  if(shape===5)return .83+roughness*(.1*Math.sin(5*theta+seed)+.06*Math.cos(9*theta-seed)+.035*Math.sin(13*theta));
  if(shape===6)return .72+.22*Math.cos(2*theta)+roughness*.07*Math.sin(3*theta+seed);
  if(shape===7)return 1/Math.pow(Math.pow(Math.abs(Math.cos(theta)),4)+Math.pow(Math.abs(Math.sin(theta)),4),.25);
  if(shape===2)return 1;
  if(shape===3)return .9+.12*Math.cos(2*theta)-.23*Math.cos(theta)+roughness*.035*Math.sin(theta*5+seed);
  return shape===0?.975+roughness*(.024*Math.sin(theta*3)+.017*Math.sin(theta*7))
    :.96+roughness*(.08*Math.sin(3*theta+seed)+.045*Math.cos(5*theta-seed)+.025*Math.sin(7*theta+2*seed));
}
export const poolOutline=(p,theta)=>outline(theta,p.seed,p.shape===0,p.roughness??1,p.shape??1);
export function editablePools(g) {
  const a=rad(g.baseRotation),c=Math.cos(a),s=Math.sin(a),scale=g.pondScale??1;
  return puddles(g).map(p=>{const x=p.x-(g.baseX||0),z=p.z-(g.baseZ||0);return {x:c*x-s*z,z:s*x+c*z,width:2*p.a/scale,depth:2*p.b/scale,scale:1,angle:(p.angle+a)*180/Math.PI,seed:p.seed,shape:p.shape,roughness:p.roughness,name:p.name,color:p.color,material:p.material,elevation:p.elevation,basinDepth:p.basinDepth};});
}
export function waterSurface(g,fraction=1) {
  const drained=1-Math.max(0,Math.min(1,fraction)),dropMm=Math.min(g.waterDropMm??3,Math.max(0,(g.baseHeight||0)*1000))*drained;
  return {waterY:(g.baseY||0)+(g.baseHeight||0)-dropMm/1000,shoreScale:1-(g.shoreRetreat??10)/100*drained,dropMm};
}
export function puddlePoint(pool,u,v) {
  const angle=pool.angle??Math.atan2(pool.z,pool.x),rx=Math.cos(angle),rz=Math.sin(angle);
  return {x:pool.x+rx*u*pool.a-rz*v*pool.b,z:pool.z+rz*u*pool.a+rx*v*pool.b};
}
export function panelHalfSize(g) {return [g.diameter/2,g.diameter/2/(g.skyShape==='fill'?(g.skyAspect||16/9):1)];}
export function panelPoint(g,u,v,frame=panelFrame(g)) {
  const [w,h]=panelHalfSize(g);return frame.center.map((x,i)=>x+w*frame.u[i]*u+h*frame.v[i]*v);
}
export function panelOutline(g,frame=panelFrame(g)) {
  const points=g.skyShape==='square'||g.skyShape==='fill'?[[-1,-1],[1,-1],[1,1],[-1,1]]:Array.from({length:96},(_,i)=>[Math.cos(i*Math.PI/48),Math.sin(i*Math.PI/48)]);
  return points.map(([u,v])=>panelPoint(g,u,v,frame));
}
export function panelContains(g,u,v) {
  const [w,h]=panelHalfSize(g);return g.skyShape==='square'||g.skyShape==='fill'?Math.abs(u)<=w&&Math.abs(v)<=h:Math.hypot(u,v)<=w;
}
// Intersect a water-reflected ray with the actual (possibly tilted) panel plane.
export function reflectedPanelPoint(P,g,frame=panelFrame(g),eye=observer(g)) {
  const y=waterLevel(g),ray=[P.x-eye[0],eye[1]-y,P.z-eye[2]],den=dot(ray,frame.normal);
  if(eye[1]<=y||den<=1e-9)return null;
  const t=dot([frame.center[0]-P.x,frame.center[1]-y,frame.center[2]-P.z],frame.normal)/den;
  if(t<=0)return null;
  const world=[P.x+ray[0]*t,y+ray[1]*t,P.z+ray[2]*t],delta=world.map((x,i)=>x-frame.center[i]);
  return {world,u:dot(delta,frame.u),v:dot(delta,frame.v)};
}
export function viewingFootprint(g) {
  const eye=observer(g),y=waterLevel(g),h=eye[1]-y,frame=panelFrame(g);
  const project=Q=>{const t=h/(Q[1]-y+h);return {x:eye[0]+(Q[0]-eye[0])*t,z:eye[2]+(Q[2]-eye[2])*t};};
  if(h<=0)return{x:eye[0],z:eye[2],radius:0,points:[]};
  const center=project(frame.center);
  return {...center,radius:g.diameter/2*h/(g.height-y+h),points:panelOutline(g,frame).map(project)};
}
export function layoutCoverage(g) {
  const pools=puddles(g),frame=panelFrame(g),camera=cameraFrame(g),lens=Math.tan(rad(g.fov||60)/2),R=landRadius(g);
  const framed=[];
  const fractions=pools.map(pool=>{
    const pg={...g,waterY:waterLevel(g)+(pool.elevation||0)};let total=0,hit=0,inFrame=0;
    for(let u=-20;u<=20;u++)for(let v=-20;v<=20;v++){
      const x=u/18,z=v/18;
      if((g.shoreScale??1)<=.001||Math.hypot(x,z)>poolOutline(pool,Math.atan2(z,x))*(g.shoreScale??1))continue;
      const P=puddlePoint(pool,x,z);
      if(Math.hypot(P.x-(g.baseX||0),P.z-(g.baseZ||0))>R)continue;
      total++;
      const C=reflectedPanelPoint(P,pg,frame,camera.eye);
      if(C&&panelContains(g,C.u,C.v)){
        hit++;
        const d=[P.x-camera.eye[0],(waterLevel(pg))-camera.eye[1],P.z-camera.eye[2]],depth=dot(d,camera.forward);
        if(depth>0&&Math.abs(dot(d,camera.up))<=depth*lens&&Math.abs(dot(d,camera.right))<=depth*lens*(g.cameraAspect||16/9))inFrame++;
      }
    }
    framed.push(total?inFrame/total:0);return total?hit/total:0;
  });
  const best=Math.max(0,...fractions),visible=fractions.filter(x=>x>.01).length;
  let index=fractions.indexOf(best);
  if(!best&&pools.length)index=pools.reduce((chosen,p,i)=>Math.hypot(p.x-camera.eye[0],p.z-camera.eye[2])<Math.hypot(pools[chosen].x-camera.eye[0],pools[chosen].z-camera.eye[2])?i:chosen,0);
  return {best,visible,count:pools.length,fractions,index,focus:pools[index]||{x:g.baseX||0,z:g.baseZ||0,a:.25,b:.25},footprint:viewingFootprint(g),framed:framed.filter(x=>x>.01).length,framedBest:Math.max(0,...framed)};
}
export function geometryProblem(g) {
  if(Object.values(g).some(v=>typeof v==='number'&&!Number.isFinite(v)))return '请输入有效数字。';
  const f=panelFrame(g),[w,h]=panelHalfSize(g);
  const drop=g.skyShape==='square'||g.skyShape==='fill'?w*Math.abs(f.u[1])+h*Math.abs(f.v[1]):w*Math.hypot(f.u[1],f.v[1]);
  const bottom=g.height-drop;
  if(bottom<=(g.baseY||0)+(g.baseHeight||0)+.05)return '天幕最低点需高于水面至少 0.05 m。';
  if(g.eyeHeight<.1)return '眼高需高于地面至少 0.1 m。';
  if(g.waterWidth>g.pondWidth-.02||g.waterDepth>g.pondDepth-.02)return '水面需比碎石区每边小至少 1 cm。';
  return '';
}

// Preserve the visible equipment state when leaving the legacy centre layout.
export function setPuddleLayout(g,layout){
 if(g.layout==='center'&&layout!=='center')g.equipment=false;
 if(layout==='custom'&&g.layout!=='custom')g.customPools=editablePools(g);
 g.layout=layout;
}

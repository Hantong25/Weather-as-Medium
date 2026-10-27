// Fixed build of the current concept, in metres. `given` values come from the team; the rest are estimates.
export const BUILD={
 base:1,                // given: 1 × 1 m square base (photo, 2026-10-23)
 wall:.03,              // assumed thickness of the black timber frame
 frameHeight:.06,       // assumed frame height
 board:.01,             // assumed base board under the pavers and gravel
 liner:.003,            // assumed pond liner under the gravel, as drawn
 paver:{length:.2,height:.05,rows:2,joint:.004}, // assumed grey concrete pavers, two rows round the gravel
 gravelY:.058,          // assumed top of the dry black gravel, just under the pavers
 waterY:.05,            // assumed water surface once water is added
};
export const innerHalf=()=>BUILD.base/2-BUILD.wall;
// Two rows of pavers fill the band between the gravel and the frame. Each row is four strips that each take one corner
// (pinwheel), so the ring closes without overlaps; strips split into pieces of about one paver length.
export function paverLayout(pondWidth,pondDepth){
 const {length,height,rows,joint}=BUILD.paver,inner=innerHalf(),bx=(inner-pondWidth/2)/rows,bz=(inner-pondDepth/2)/rows,out=[];
 for(let r=0;r<rows;r++){
  const hx=pondWidth/2+r*bx,Hx=hx+bx,hz=pondDepth/2+r*bz,Hz=hz+bz;
  for(const [x0,x1,z0,z1] of [[-Hx,hx,-Hz,-hz],[hx,Hx,-Hz,hz],[-hx,Hx,hz,Hz],[-Hx,-hx,-hz,Hz]]){
   const alongX=x1-x0>=z1-z0,span=alongX?x1-x0:z1-z0,count=Math.max(1,Math.round(span/length)),step=span/count;
   for(let i=0;i<count;i++){
    const a=(alongX?x0:z0)+(i+.5)*step;
    out.push(alongX?{x:a,z:(z0+z1)/2,sx:step-joint,sz:z1-z0-joint}:{x:(x0+x1)/2,z:a,sx:x1-x0-joint,sz:step-joint});
   }
  }
 }
 return out.map((p,index)=>({...p,y:BUILD.board+height/2,height,index}));
}

// Water covers only the low middle of the gravel (pondWidth × pondDepth): an irregular outline exactly waterWidth ×
// waterDepth across, centred in it, with dry stones all round.
const shore=t=>.93+.05*Math.sin(3*t+.7)+.035*Math.cos(5*t-1.3)+.02*Math.sin(7*t+2.1);
// Bounds of the unit shore curve, so the outline scales to exactly waterWidth × waterDepth and sits centred.
const SHORE=Array.from({length:720},(_,i)=>{const t=i/720*Math.PI*2;return [Math.cos(t)*shore(t),Math.sin(t)*shore(t)];});
const [X0,X1,Z0,Z1]=[0,1].flatMap(i=>[Math.min(...SHORE.map(p=>p[i])),Math.max(...SHORE.map(p=>p[i]))]);
export function waterOutline(g,n=72){
 return Array.from({length:n},(_,i)=>{const t=i/n*Math.PI*2,r=shore(t);return [(Math.cos(t)*r-(X0+X1)/2)/(X1-X0)*g.waterWidth,(Math.sin(t)*r-(Z0+Z1)/2)/(Z1-Z0)*g.waterDepth];});
}
// > 1 outside the water, < 1 inside: distance from the curve's centre relative to the shore in that direction.
export function shoreRatio(g,x,z){const u=x/g.waterWidth*(X1-X0)+(X0+X1)/2,v=z/g.waterDepth*(Z1-Z0)+(Z0+Z1)/2;return Math.hypot(u,v)/shore(Math.atan2(v,u));}
export const inWater=(g,x,z)=>shoreRatio(g,x,z)<=1;
// Gravel surface: dry stones rise from the waterline towards the pavers; the bed dips under the water.
export function pebbleHeight(g,x,z){
 const e=shoreRatio(g,x,z)-1;
 return BUILD.waterY+Math.max(-.015,Math.min(BUILD.gravelY-BUILD.waterY,e*.05))+.0015*Math.sin(x*61+z*23)*Math.cos(z*47-x*19);
}

// Where visitors stand: an arc centred on 0° (the +Z side), every `step` degrees (5 by default), at near/middle/far
// distances and low/middle/high eyes.
export const VIEW_ARCS={all:360,half:180,quarter:90,front:0};
export function viewers(g){
 const step=g.step||5,arc=VIEW_ARCS[g.viewArc]??360,steps=Math.round(arc/step),out=[];
 const span=(a,b)=>[...new Set([Math.min(a,b),(a+b)/2,Math.max(a,b)])];
 for(let i=0;i<=steps;i++){
  if(arc===360&&i===steps)break;
  const angle=-arc/2+i*step;
  for(const distance of span(g.viewNear,g.viewFar))for(const eye of span(g.eyeLow,g.eyeHeight))
   out.push({angle:(angle+360)%360,distance,eye,x:Math.sin(angle*Math.PI/180)*distance,z:Math.cos(angle*Math.PI/180)*distance});
 }
 return out;
}
// Mirror law over flat water: with eyes e above the water, water point P shows the ceiling point P + k(P − E), where
// k = (canopy height above the water) / e. So the ceiling seen in the water is the water outline scaled by 1 + k and
// moved k × (viewer distance) to the side away from the viewer; this is its bounding box.
export const mirrorScale=(viewer,height)=>(height-BUILD.waterY)/(viewer.eye-BUILD.waterY);
export function reflectedPatch(g,viewer,height=g.height){
 const k=mirrorScale(viewer,height),s=1+k;
 return {x:-k*viewer.x,z:-k*viewer.z,hw:s*g.waterWidth/2,hd:s*g.waterDepth/2};
}
// Horizontal canopy of width × depth; the sky fills it (fill) or a centred square or circle of its width.
export function canopyRect(g){return {x:g.panelX||0,z:g.panelZ||0,hw:g.diameter/2,hd:g.diameter/(g.skyAspect||1)/2};}
export function skyContains(g,x,z){
 const c=canopyRect(g),u=x-c.x,v=z-c.z;
 if(g.skyShape==='circle')return Math.hypot(u,v)<=c.hw;
 return Math.abs(u)<=c.hw&&Math.abs(v)<=(g.skyShape==='square'?c.hw:c.hd);
}
// Share of the water surface in which this viewer sees projected sky rather than whatever lies beyond it.
export function coverage(g,viewer,n=18){
 const k=mirrorScale(viewer,g.height);let hit=0,total=0;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const x=((i+.5)/n*2-1)*g.waterWidth/2,z=((j+.5)/n*2-1)*g.waterDepth/2;if(!inWater(g,x,z))continue;
  total++;if(skyContains(g,x+k*(x-viewer.x),z+k*(z-viewer.z)))hit++;
 }
 return total?hit/total:0;
}
// Smallest horizontal rectangle that shows sky in all the water for every sampled viewer, at the given height.
export function requiredRect(g,height=g.height,list=viewers(g)){
 let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;
 for(const v of list){const p=reflectedPatch(g,v,height);x0=Math.min(x0,p.x-p.hw);x1=Math.max(x1,p.x+p.hw);z0=Math.min(z0,p.z-p.hd);z1=Math.max(z1,p.z+p.hd);}
 return {x:(x0+x1)/2,z:(z0+z1)/2,width:x1-x0,depth:z1-z0};
}
export function canopyStudy(g){
 const list=viewers(g),scores=list.map(v=>({...v,coverage:coverage(g,v)}));
 return {viewers:scores,worst:scores.reduce((a,b)=>b.coverage<a.coverage?b:a),mean:scores.reduce((sum,v)=>sum+v.coverage,0)/scores.length,required:requiredRect(g,g.height,list)};
}

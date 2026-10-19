// Fixed build of the current concept, in metres. `given` values come from the team; the rest are simulation placeholders.
export const BUILD={
 frame:.70,             // given: 700 × 700 mm square timber frame
 canopy:[.841,1.189],   // given: A0 canopy
 frameHeight:.15,       // assumed
 wall:.035,             // assumed timber thickness
 liner:.003,            // assumed pond liner thickness as drawn
 brick:{length:.23,height:.076,width:.11,joint:.006,courses:2}, // assumed standard brick, two dry-laid courses
 waterY:.112,           // assumed fixed water surface; no water-level interaction
 viewDistance:.6,       // assumed standing distance from the puddle centre
};
export const innerHalf=()=>BUILD.frame/2-BUILD.wall-BUILD.liner;
const bump=(x,z,cx,cz,sx,sz,depth)=>depth*Math.exp(-((x-cx)**2/(2*sx*sx)+(z-cz)**2/(2*sz*sz)));
// Pebble surface height. Water collects wherever this sits below BUILD.waterY, so the puddle outline comes from the terrain.
export function pebbleHeight(x,z){
 return .128+.004*Math.sin(x*37+z*11)+.003*Math.cos(z*43-x*17)
  -bump(x,z,.03,-.02,.15,.13,.032)-bump(x,z,-.12,.1,.07,.06,.016)-bump(x,z,.14,.09,.05,.06,.012);
}
// Pinwheel ring of bricks hugging the lined frame; the second course turns the other way so corners overlap.
export function brickLayout(){
 const {length,height,width,joint,courses}=BUILD.brick,s=BUILD.frame/2+BUILD.liner,out=[];
 for(let c=0;c<courses;c++)for(let k=0;k<4;k++){
  const a=k*Math.PI/2,start=c?-(s+width):-s,end=c?s:s+width,lz=-(s+width/2);
  for(let x0=start;x0<end-.02;x0+=length+joint){
   const len=Math.min(length,end-x0),lx=x0+len/2;
   out.push({x:lx*Math.cos(a)+lz*Math.sin(a),z:-lx*Math.sin(a)+lz*Math.cos(a),y:height*(c+.5),ry:a,length:len,height,width,index:out.length});
  }
 }
 return out;
}

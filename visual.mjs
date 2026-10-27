import { tr } from './i18n.mjs?v=2026.10.27.1';
import { landRadius, panelContains } from './layout.mjs?v=2026.10.27.1';
import { skyState, skyTable, skyTableRows, blendLight, luminance, TABLE_SIZE, TABLE_SPAN, ATMOSPHERES } from './atmosphere.mjs?v=2026.10.27.1';
import { FIELD } from './field.mjs?v=2026.10.27.1';
import { cloudLook as lookOf, regionScale, palette as paletteOf, lookMix } from './studio.mjs?v=2026.10.27.1';
// Original procedural cloud rendering. No reference images are copied into the artwork.
export const STYLES = [
  { name: '写实大气', en: 'PHYSICAL SKY', note: '按太阳位置计算大气散射；粒子云团由阳光、天光和城市夜光照亮。' },
  { name: '粉彩油画', en: 'PASTEL / OIL', note: '暖白颜料、蓝灰阴影与细密画布笔触。' },
  { name: '水彩纸本', en: 'WATERCOLOUR', note: '透明叠色、纸面颗粒与轻微色边。' },
];
// Colour grades applied after tone mapping: lift (shadows), gamma (midtones), gain (highlights), saturation.
export const GRADES = {
  natural: { lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1 },
  warm: { lift: [.02, .012, 0], gamma: [1, 1, 1.05], gain: [1.04, 1, .9], saturation: .92 },
  cool: { lift: [0, .006, .02], gamma: [1, 1, 1], gain: [.93, .98, 1.06], saturation: 1 },
  dream: { lift: [.03, .008, .04], gamma: [1, 1.04, 1], gain: [1.05, .93, 1.08], saturation: 1.12 },
  pastel: { lift: [.05, .05, .05], gamma: [1.1, 1.1, 1.1], gain: [.95, .95, .95], saturation: .72 },
  silver: { lift: [.01, .01, .01], gamma: [1, 1, 1], gain: [1.04, 1.04, 1.04], saturation: 0 },
};
export const hexRGB = color => /^#[0-9a-f]{6}$/i.test(color) ? [1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255) : [1,1,1];

function random(seed) { let a=seed|0;return ()=>{a+=0x6D2B79F5;let t=Math.imul(a^a>>>15,1|a);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;}; }
export function cloudReach(growth) { return 18+48*growth*growth; }
// Each wisp has its own lifetime; its opacity reaches zero before it is reseeded.
export function cloudLobes(seed,growth,time=0,form='cumulus') {
  const rnd=random(seed),base=(14+growth*25)*(.72+rnd()*.55);
  const count=form==='layered'?22:form==='broken'?14:20;
  return Array.from({length:count},(_,i)=>{
    const local=random(seed+i*1777),life=14+local()*14,phase=time/life+local(),cycle=Math.floor(phase),u=phase-cycle;
    const core=i<3,shape=random(seed+i*3491+(core?0:cycle*65537));
    const angle=shape()*Math.PI*2,offset=base*Math.sqrt(shape())*(core?.36:form==='broken'?1.35:.95);
    // Steady drift: every wisp moves at the same constant speed for its whole life (distance grows with its lifetime);
    // only its opacity fades in and out, so reseeding at the end of a life stays invisible.
    const envelope=Math.sin(Math.PI*u)**2,travel=(u-.5)*life/21;
    return {x:Math.cos(angle)*offset+(core?0:travel*base*.25),y:Math.sin(angle)*offset,
      radius:base*(core?.62:.3+shape()*.64)*(form==='broken'?.7:1)*(core?1:.75+.25*envelope),
      travel:core?0:travel,opacity:core?.38:envelope*.9};
  });
}
// Per-cloud look, shared by the mass map and the shader: turn, size, stretch, and the direction and distance of the
// point its upper layers lean towards. Every cloud once leant towards the canopy centre, so together they radiated
// from it; now each leans its own way, as far as 10.16.2 clouds did from their place on the canopy.
function cloudLook(seed,form,windDirection) {
  const r=random(seed+59),turn=r(),scale=.78+.6*r()**2,long=r(),l=random(seed+71),lean=l()*Math.PI*2,reach=.25+.9*l();
  const angle=windDirection*Math.PI/180+(turn-.5)*(form==='layered'?.5:1.1);
  return {angle,scale,stretch:form==='layered'?1.55:1+.7*long,squash:form==='layered'?.65:1/Math.sqrt(1+.7*long),lean,reach};
}
// Mass-map pixels per sky unit: the 256 px map spans ±FIELD.mass sky units around the canopy centre.
export const MASS_SCALE = 128 / FIELD.mass;
// One cloud's particle mass: its own seed gives it its own shape, size and stretch along the wind; strength 0–1 grows
// it in and fades it out.
function drawCloud(ctx,[x,y,seed,strength],growth,form,time,windDirection,windSpeed,drift,sizeGain){
  const size=growth*(.4+.6*strength);
  // Every cloud has its own size (many small, a few large; on average the 10.12.2 size) and is drawn out along the
  // wind by its own amount, as drifting clouds are; stretched layers lie flatter.
  const {angle,scale,stretch,squash}=cloudLook(seed,form,windDirection);
  ctx.save();ctx.translate(128+(x+drift[0])*MASS_SCALE,128+(y+drift[1])*MASS_SCALE);ctx.scale(scale*sizeGain,scale*sizeGain);ctx.rotate(angle);
  ctx.scale(stretch,squash);
  for(const lobe of cloudLobes(seed,size,time,form)){
    const wind=windDirection*Math.PI/180-angle,push=lobe.travel*12*windSpeed;
    const lx=lobe.x+Math.cos(wind)*push/stretch,ly=lobe.y+Math.sin(wind)*push/squash;
    const extent=Math.hypot(lx*stretch,ly*squash)+lobe.radius*stretch;
    const fit=1/Math.pow(1+(extent/cloudReach(size))**8,1/8);
    const px=lx*fit,py=ly*fit,radius=lobe.radius*fit,opacity=lobe.opacity*Math.min(1,strength);
    ctx.globalAlpha=opacity;
    const g=ctx.createRadialGradient(px,py,0,px,py,radius);g.addColorStop(0,'#ffffffee');g.addColorStop(.38,'#ffffffbb');g.addColorStop(.7,'#ffffff55');g.addColorStop(1,'#ffffff00');
    ctx.fillStyle=g;ctx.fillRect(px-radius,py-radius,radius*2,radius*2);
  }
  ctx.restore();
}
let layer=null,sumLayer=null;
const clear=c=>{c.globalCompositeOperation='source-over';c.globalAlpha=1;c.fillStyle='black';c.fillRect(0,0,256,256);};
// field: [x, y, seed, strength] per cloud (see field.mjs); drift: the wind offset in sky units; sizeGain: the cloud-size
// slider. merge 1 adds overlapping clouds together (screen) as before, so near clouds fuse into one mass; towards 0 each
// point keeps only the denser of them (lighten), so clouds overlap without fusing.
export function drawCloudMass(ctx,field,growth,form='cumulus',time=0,windDirection=25,windSpeed=1,drift=[0,0],sizeGain=1,merge=1) {
  const clouds=field.filter(c=>c[3]>0),draw=(target,c)=>drawCloud(target,c,growth,form,time,windDirection,windSpeed,drift,sizeGain);
  clear(ctx);
  if(merge>=1){ctx.globalCompositeOperation='screen';for(const c of clouds)draw(ctx,c);}
  else{
    if(!layer){layer=Object.assign(document.createElement('canvas'),{width:256,height:256});sumLayer=Object.assign(document.createElement('canvas'),{width:256,height:256});}
    const one=layer.getContext('2d'),sum=sumLayer.getContext('2d');clear(sum);sum.globalCompositeOperation='screen';
    for(const c of clouds){clear(one);one.globalCompositeOperation='screen';draw(one,c);ctx.globalCompositeOperation='lighten';ctx.globalAlpha=1;ctx.drawImage(layer,0,0);if(merge>0)draw(sum,c);}
    if(merge>0){ctx.globalCompositeOperation='source-over';ctx.globalAlpha=merge;ctx.drawImage(sumLayer,0,0);}
  }
  // A black rim: the sky texture repeats, so a cloud on one edge of the map would otherwise bleed into the opposite edge.
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.strokeStyle='black';ctx.lineWidth=4;ctx.strokeRect(0,0,256,256);
}
// Plane mirror ray, in metres. A viewer at E sees screen point C through water point P.
export function reflectedCeilingPoint(point, eye, height) {
  if (!(eye.height > 0 && height > 0)) throw Error('眼高与天幕高度需大于零');
  const k = height / eye.height;
  return { x: (1 + k) * point.x - k * eye.x, z: (1 + k) * point.z - k * eye.z };
}
export function reflectionCoverage({ height, diameter, eyeHeight, distance, pondDiameter = .5, skyShape = 'circle' }) {
  let inside = 0, total = 0;
  for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) {
    if (x * x + z * z > 400) continue;
    const point = reflectedCeilingPoint({ x: x / 20 * pondDiameter / 2, z: z / 20 * pondDiameter / 2 }, { x: 0, z: distance, height: eyeHeight }, height);
    total++; if (panelContains({diameter,skyShape},point.x,point.z)) inside++;
  }
  return inside / total;
}
export function approachPose(progress, geometry) {
  const t = Math.max(0, Math.min(1, progress)), eased = t * t * (3 - 2 * t);
  const far = geometry.farDistance ?? Math.max(5, geometry.distance + 2, geometry.area ? landRadius(geometry) + 2 : 0), distance = t === 1 ? geometry.distance : far + (geometry.distance - far) * eased;
  return { distance, targetHeight: (geometry.baseHeight || 0) + (geometry.height - (geometry.baseHeight || 0)) * .48 * (1 - eased), eyeHeight: geometry.eyeHeight };
}
const VERTEX = `precision highp float;attribute vec3 aPosition;void main(){gl_Position=vec4(aPosition.xy,0.,1.);}`;
const UNDER = '0.045';
// Billow rescale [mean, gain] of the |2n-1| octave sum, the depth erosion can eat, and the silver-lining strength.
const BILLOW = ['0.325', '1.3'], ERODE = '0.45', SILVER = ['0.15', '0.2'];
// Influence of cloud k on point q (GLSL ES 1.0 indexes arrays only with loop counters, so this is pasted into the loop).
const LEAN_WEIGHT = 'vec4 c=uCloud[k];vec2 seg=(c.zw-c.xy)*.5;float h=clamp(dot(q-c.xy,seg)/max(dot(seg,seg),1e-6),0.,1.);vec2 d=(q-c.xy-seg*h)/uCloudSize[k].y;float w=uCloudSize[k].x*exp(-2.*dot(d,d));';
const SKY = `
precision highp float;
uniform vec2 uResolution;
uniform float uCloudScale;
uniform sampler2D uNoise,uMass,uSkyA,uSkyB,uSkyC,uSkyD;
uniform vec2 uWindOffset;
uniform vec4 uCloud[48];
uniform vec2 uCloudSize[48];
uniform float uCloudCount;
uniform vec3 uSunDir,uSunCloud,uAmbient,uNight,uCity,uDiskA,uDiskB,uDiskColA,uDiskColB,uSkyTint;
uniform vec3 uGradeLift,uGradeGamma,uGradeGain;
uniform float uSkyMix,uSkyMix2,uExpA,uExpB,uExpC,uExpD,uCross,uGradeSat,uCover,uExposure,uStars,uMotion,uSquare,uFill,uSkyTintMix,uClear,uSat;
uniform float uTime,uGrowth,uFade,uStyle,uStyleMix,uBrightness,uRotation,uProjection,uAlive,uReduced;
// Cloud look sliders (see CLOUD_LOOK in studio.mjs); at their defaults the clouds are those of 2026.10.19.2.
uniform float uWarp,uDetailScale,uDetail,uBillow,uErode,uThick,uShadow,uSilver;
uniform float uSoft,uMerge,uBump;
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;vec2 n=texture2D(uNoise,fract((uv+.5)/256.)).rg;return mix(n.x,n.y,f.z);}
float fbm(vec3 p){return noise3(p)*.50+noise3(p*2.03+13.1)*.28+noise3(p*4.09+7.8)*.15+noise3(p*8.17+19.2)*.07;}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hg(float mu,float g){return (1.-g*g)/(12.566*pow(1.+g*g-2.*g*mu,1.5));}
// The cloud-body part of the last density() call (the rest is the thin background veil).
float bodyPart;
float density(vec3 p,vec3 sky){
 // A narrow lens avoids radial streaks; rescale so on-screen cloud size still matches the particle mass.
 p.xy*=1.75;
 float profile=smoothstep(1.52,1.76,p.z)*(1.-smoothstep(2.65,3.08,p.z));
 if(profile<=0.)return 0.;
 // The texture inside the clouds drifts with the cloud field, at the same wind speed (cloud base: p.xy = .9737q).
 // Clouds made smaller for a cloud region keep their texture and outline in proportion (uCloudScale; 1 by default).
 vec3 flow=p-vec3(uWindOffset*${(FIELD.drift*.9737).toFixed(5)},0.),cf=vec3(flow.xy/uCloudScale,flow.z);
 vec2 warp=vec2(noise3(cf*1.7+vec3(0.,0.,uMotion*.055)),noise3(cf*1.7+vec3(11.,7.,uMotion*.047)))-.5;
 vec2 uv=(p.xy+warp*uWarp*uCloudScale)*.29+.5;
 float mass=uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.?0.:texture2D(uMass,uv).r;
 // The body term is exactly zero outside the cloud mass, so its five noise lookups are skipped there.
 float body=0.;
 if(mass>.02){
  vec3 at=(cf+vec3(warp*.08,0.))*(mix(7.5,10.,uGrowth)*uDetailScale)+vec3(0.,0.,uMotion*.06);
  float detail=uBillow<1.?fbm(at):.5,extra=0.,erode=0.;
  // Added noise (detail above 1, billows, erosion) changes slowly with height (z/5): the fbm octaves change almost
  // randomly from one of the 32 layers to the next, and amplifying them drew hatching where clouds lean.
  vec3 slow=vec3(at.xy,at.z*.2);
  if(uBillow>0.||uDetail>.6){
   vec4 o=vec4(noise3(slow),noise3(slow*2.03+13.1),noise3(slow*4.09+7.8),noise3(slow*8.17+19.2)),w=vec4(.50,.28,.15,.07);
   // Billows: rounded lumps parted by sharp creases (|2n-1| per octave), rescaled to the spread of the plain detail.
   detail=mix(detail,.5+(dot(abs(2.*o-1.),w)-${BILLOW[0]})*${BILLOW[1]},uBillow);
   extra=(dot(o,w)-.5)*max(0.,uDetail-.6);
  }
  // Erosion eats into the thin outer cloud and leaves the thick core. Its bites are broad and soft-edged: fine,
  // sharp ones fell between the layers of a leaning cloud and showed as hatching.
  if(uErode>0.)erode=uErode*(1.-smoothstep(.3,.85,mass))*smoothstep(.3,.7,(noise3(slow+31.7)*.5+noise3(slow*2.03+5.3)*.28)/.78)*${ERODE};
  float condensation=(noise3(cf*2.4+vec3(6.,2.,uMotion*.09))-.5)*.16;
  float humidity=mass*.92+(detail-.5)*min(uDetail,.6)+extra+condensation-erode;
  // Edge bumps: rounded bulges and bays along the outline (in size between the outline warp and the fine detail), only
  // where the cloud thins towards its edge; slow with height so the leaning layers stay together.
  if(uBump>0.)humidity+=(noise3(vec3(cf.xy*4.6,cf.z*.5+uMotion*.03)+21.4)*.6+noise3(vec3(cf.xy*9.3,cf.z*.5)+3.1)*.4-.5)*uBump*.9*(1.-smoothstep(.45,.95,mass));
  // Wide thresholds keep a feathered rim that thins into the sky instead of a hard outline.
  body=smoothstep(.1,.5,humidity)*max(0.,humidity-.2)*uThick*uFade*smoothstep(.02,.22,mass);
 }
 // The thin background veil does not lean with the clouds (sky: the same height straight above the point).
 vec3 open=sky*vec3(1.75,1.75,1.)-vec3(uWindOffset*${(FIELD.drift*.9737).toFixed(5)},0.);
 float veil=max(0.,fbm(open*3.1+vec3(0.,0.,uMotion*.04))-(.62-.3*uCover))*(.25+2.2*uCover);
 bodyPart=body*profile;
 return (body+veil)*profile;
}
// Where the cloud layers above this point lean: each cloud's upper layers converge on its own vanishing point (zw),
// weighted by how close the point is to that cloud and its leaning part. Open sky leans nowhere.
vec2 lean(vec2 q){
 vec2 sum=vec2(0.);float total=.02,top=0.;
 for(int k=0;k<48;k++){
  if(float(k)>=uCloudCount)break;
  ${LEAN_WEIGHT}sum+=w*(q-c.zw);total+=w;top=max(top,w);
 }
 // Where two clouds' influence is about equal their leans pull different ways and drew strings between them; with
 // less merging the lean fades out there, while each cloud keeps its own.
 return sum/total*mix(smoothstep(.5,.85,top/max(total-.02,1e-6)),1.,uMerge);
}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){
 vec2 q=(gl_FragCoord.xy-uResolution*.5)/(min(uResolution.x,uResolution.y)*mix(.49,.5,uFill));
 float radius=length(q),boundary=mix(radius,max(abs(q.x),abs(q.y)),uSquare);
 vec3 outside=mix(vec3(.9255,.9216,.8980),vec3(0.),uProjection);
 if(uFill<.5&&boundary>1.){gl_FragColor=vec4(outside,1.);return;}
 q=mat2(cos(uRotation),sin(uRotation),-sin(uRotation),cos(uRotation))*q;
 // Sky: physical scattering seen through a wide upward lens (frame corners ~55° from the zenith).
 vec3 view=normalize(vec3(q*.95,1.));
 float horizon=1.-view.z;
 vec2 lut=(q/${(2*TABLE_SPAN).toFixed(3)}+.5)*${((TABLE_SIZE-1)/TABLE_SIZE).toFixed(5)}+${(.5/TABLE_SIZE).toFixed(5)};
 vec3 ea=texture2D(uSkyA,lut).rgb,eb=texture2D(uSkyB,lut).rgb,sky=mix(ea*ea*4./uExpA,eb*eb*4./uExpB,uSkyMix);
 // While two skies cross-fade (a part in between is switched off), the second pair of tables holds the other sky.
 if(uCross>0.){vec3 ec=texture2D(uSkyC,lut).rgb,ed=texture2D(uSkyD,lut).rgb;sky=mix(sky,mix(ec*ec*4./uExpC,ed*ed*4./uExpD,uSkyMix2),uCross);}
 // Sky colour for this part: towards the chosen hue at the same brightness.
 if(uSkyTintMix>0.)sky=mix(sky,uSkyTint*dot(sky,vec3(.2126,.7152,.0722))/max(dot(uSkyTint,vec3(.2126,.7152,.0722)),1e-3),uSkyTintMix);
 // The sun by day, the full moon by night (both while two skies cross-fade).
 sky+=uDiskColA*smoothstep(.99994,.99997,dot(view,uDiskA))*(1.-uCross)+uDiskColB*smoothstep(.99994,.99997,dot(view,uDiskB))*uCross;
 // Stars: a soft dot about 1.4 px across (at any canvas size) at a random point in some cells of the view; most are
 // faint and a few bright.
 vec2 sv=view.xy/view.z*60.,cell=floor(sv);
 if(uStars>0.&&hash(cell)>.955){vec2 o=vec2(hash(cell+7.1),hash(cell+13.7))*.6+.2;float r=1.4*114./min(uResolution.x,uResolution.y);
  sky+=vec3(.9,.95,1.)*smoothstep(r,r*.25,length(fract(sv)-o))*(.06+.94*pow(hash(cell+3.),4.))*.1*uStars;}
 vec3 rd=normalize(vec3(q*.6,1.65));
 float stepSize=1.52/(rd.z*32.);
 float transmission=1.;vec3 sum=vec3(0.);
 float forward=hg(dot(rd,uSunDir),.6)*6.+.06;
 // A low sun shines straight onto cloud bases from the side (they are not shadowed by the cloud above), so near
 // sunrise and sunset the undersides take on the reddened sunlight: the pink-orange glow of morning and evening clouds.
 float under=pow(1.-clamp(uSunDir.z,0.,1.),4.)*${UNDER};
 // Each pixel starts its steps at a slightly different height (interleaved gradient noise), so the 32 layers of a
 // long leaning cloud do not show as stripes.
 float start=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
 // The layers fan out from each cloud's own vanishing point (this was the canopy centre for every cloud, toward = q).
 vec2 toward=lean(q);
 for(int i=0;i<32;i++){
  float z=1.53+(float(i)+start)*.0475;vec3 p=vec3((q+(z/1.53-1.)*toward)*.5564,z),sky=vec3(q*.5564,z);float d=density(p,sky);
  if(d>.012){
   float cloud=bodyPart/d; // read before the light sample below overwrites bodyPart
   // Light reaching this point through the cloud above it, then scattered down to the viewer.
   float light=exp(-density(p+uSunDir*.14,sky+uSunDir*.14)*uShadow);
   float inside=exp(-d*.7);
   vec3 color=uSunCloud*(light*forward*.09+under*(.35+.65*light))+uAmbient*(1.1+.7*inside)+uCity*(.9+.4*inside);
   // Silver lining: thin sunlit cloud scatters sunlight forward, so its edges glow, most of all towards the sun.
   if(uSilver>0.)color+=uSunCloud*(uSilver*cloud*light*inside*inside*(${SILVER[0]}+forward*${SILVER[1]}));
   float alpha=1.-exp(-d*stepSize*mix(2.5,1.45,step(1.5,uStyle)));
   sum+=color*alpha*transmission;transmission*=1.-alpha;
   if(transmission<.018)break;
  }
 }
 // Edge softness acts on the opacity of the whole column: each of the 32 layers stays soft, since hard layers that
 // lean apart showed as hatching. Harder: thin parts vanish and the rest turns opaque. Softer: thin rims thin out.
 if(uSoft!=1.){
  float a=1.-transmission,b=uSoft<1.?mix(a,smoothstep(.1,.4,a),(1.-uSoft)/.9):pow(a,uSoft);
  sum*=b/max(a,1e-4);transmission=1.-b;
 }
 // Cloud transparency for this part: the sky shows through the clouds.
 sum*=1.-uClear;transmission=mix(transmission,1.,uClear);
 vec3 radiance=sum+sky*transmission;
 vec3 result=pow(aces(radiance*uExposure*uBrightness),vec3(1./2.2));
 result=pow(result,1./uGradeGamma)*uGradeGain+uGradeLift*(1.-result);
 result=clamp(mix(vec3(dot(result,vec3(.2126,.7152,.0722))),result,uGradeSat*uSat),0.,1.);
 vec3 plain=result;
 vec2 grain=gl_FragCoord.xy;
 float paper=noise3(vec3(q*340.,13.));
 if(uStyle>.5&&uStyle<1.5){
  float brush=noise3(vec3(q*vec2(60.,18.),3.));
  result=mix(result,floor(result*8.+brush*.55)/8.,.6*(1.-transmission));
  result*=.97+.038*paper+.012*sin(grain.x*2.1)*sin(grain.y*2.0);
 }
 if(uStyle>1.5){
  result=mix(result,vec3(.96,.94,.88),(1.-transmission)*(.12+paper*.06));
  result*=.97+.045*paper+.018*noise3(vec3(q*80.,5.));
 }
 // Style strength: how far the painterly style replaces the plain image.
 result=mix(plain,result,uStyleMix);
 result+=(hash(grain)-.5)/255.;
 if(uFill<.5)result=mix(outside,result,(1.-smoothstep(.992,1.,boundary)));
 gl_FragColor=vec4(result*uAlive,1.);
}`;

function resizeRenderer(p, host, max = 1000) {
  if(!host.clientWidth||!host.clientHeight)return;
  const scale = Math.min(1, max / Math.max(host.clientWidth, host.clientHeight));
  p.resizeCanvas(Math.max(1, Math.round(host.clientWidth * scale)), Math.max(1, Math.round(host.clientHeight * scale)));
}
// Picker colour (sRGB hex) as linear light.
const linear = hex => [1, 3, 5].map(i => (parseInt(hex.slice(i, i + 2), 16) / 255) ** 2.2);
// c pushed towards colour `to` by m, keeping its brightness.
const tint = (c, to, m) => { if (!(m > 0)) return c; const k = luminance(c) / Math.max(luminance(to), 1e-6); return c.map((v, i) => v + (to[i] * k - v) * m); };
// The colour settings of the part on show, blended through a transition (from → to by blend).
function partLook(f) {
  const parts = paletteOf(f.palette), a = parts[f.from] || parts[0], b = parts[f.to] || a, t = Math.min(1, Math.max(0, f.blend || 0));
  const num = k => a[k] + (b[k] - a[k]) * t, col = k => linear(a[k]).map((v, i) => v + (linear(b[k])[i] - v) * t);
  return { sky: col('sky'), skyMix: num('skyMix'), light: col('light'), lightMix: num('lightMix'), shade: col('shade'), shadeMix: num('shadeMix'), clear: num('clear'), saturation: num('saturation'), stars: num('stars') };
}
export function createSky(host, getFrame, onError, projection = false) {
  let shader, noise, mass, previous = '', source = null, fps = 0, crossing = 0;
  // Sky light is precomputed at two sun positions (a behind, b ahead) and blended every frame. The next state is built
  // ~3 ms per frame in the background, so fast twilight changes stay smooth and no frame waits for a full table. A
  // second tracker follows the other sky while two skies cross-fade.
  const trackers = [0, 1].map(() => ({ base: '', a: null, b: null, job: null, offset: 0, last: null, lastAt: 0, speed: 0, images: null }));
  const lightAt = (hour, f) => skyState(hour, { ...(ATMOSPHERES[f.atmosphere] || ATMOSPHERES.melbourne), turbidity: f.turbidity ?? 2.5, cityGlow: f.cityGlow ?? .6, moonlight: lookMix(f).moonlight, north: f.skyNorth ?? 0 });
  const upload = (img, data) => { img.loadPixels(); img.pixels.set(data); img.updatePixels(); return img; };
  function track(s, hour, f) {
    const now = performance.now(), base = [f.atmosphere, f.turbidity, f.cityGlow, lookMix(f).moonlight, f.skyNorth].join('/');
    let h = (hour ?? 0) + s.offset;
    if (s.last !== null && h < s.last - 180) { s.offset += 360; h += 360; } // the loop wraps from night back to dawn
    if (s.last !== null) s.speed += (Math.max(0, (h - s.last) / Math.max(.001, (now - s.lastAt) / 1000)) - s.speed) * .2;
    s.last = h; s.lastAt = now;
    const step = Math.min(8, Math.max(.25, s.speed * .6));
    if (base !== s.base || !s.a || h < s.a.hour - .01 || h > s.b.hour + 2 * step) {
      s.base = base; s.job = null;
      const la = lightAt(h, f), lb = lightAt(h + step, f);
      s.a = { hour: h, light: la, img: upload(s.images[0], skyTable(la)) }; s.b = { hour: h + step, light: lb, img: upload(s.images[1], skyTable(lb)) };
    }
    if (!s.job) { const hour = s.b.hour + step; s.job = { hour, light: lightAt(hour, f), data: new Uint8ClampedArray(TABLE_SIZE * TABLE_SIZE * 4), row: 0 }; }
    for (const until = performance.now() + 3; s.job.row < TABLE_SIZE && performance.now() < until; s.job.row++) skyTableRows(s.job.light, s.job.data, s.job.row, s.job.row + 1);
    if (h >= s.b.hour && s.job.row >= TABLE_SIZE) { const img = upload(s.a.img, s.job.data); s.a = s.b; s.b = { hour: s.job.hour, light: s.job.light, img }; s.job = null; }
    const mix = Math.min(1, Math.max(0, (h - s.a.hour) / Math.max(1e-6, s.b.hour - s.a.hour)));
    return { ...blendLight(s.a.light, s.b.light, mix), mix, s };
  }
  // One sky, or two while they cross-fade. When a cross-fade completes the second sky becomes the only one, so its
  // tracker takes over and nothing is rebuilt.
  function skyLight(f) {
    const cross = Math.min(1, Math.max(0, f.cross || 0));
    if (!cross && crossing > .5) trackers.reverse();
    crossing = cross;
    const A = track(trackers[0], f.hour, f), B = cross ? track(trackers[1], f.hour2, f) : A;
    return { A, B, cross, light: cross ? blendLight(A, B, cross) : A };
  }
  const instance = new p5(p => {
    p.setup = () => {
      try {
        p.createCanvas(300, 300, p.WEBGL); p.setAttributes({ version: 1, alpha: false, antialias: false, preserveDrawingBuffer: true }); p.pixelDensity(1); p.textureWrap(p.REPEAT); // noise lookups wrap; clamped edges drew straight seams
        p.noStroke(); p.frameRate(24); shader = p.createShader(VERTEX, SKY);
        noise = p.createImage(256, 256); noise.loadPixels();
        const rnd = (x, y) => { let n = ((x & 255) + (y & 255) * 256) ^ 0x65ad713; n = Math.imul(n ^ n >>> 16, 0x45d9f3b); return (n ^ n >>> 16) & 255; };
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
          const i = (y * 256 + x) * 4; noise.pixels[i] = rnd(x, y); noise.pixels[i + 1] = rnd(x + 37, y + 17); noise.pixels[i + 2] = 0; noise.pixels[i + 3] = 255;
        }
        noise.updatePixels(); mass = p.createGraphics(256, 256); mass.pixelDensity(1); for (const t of trackers) t.images = [p.createImage(TABLE_SIZE, TABLE_SIZE), p.createImage(TABLE_SIZE, TABLE_SIZE)];
        source = p.canvas; source.setAttribute('role', 'img'); source.setAttribute('aria-label', tr('天幕：从下方观看的云层，随时间变厚、变暗并散开'));
        source.addEventListener('webglcontextlost', e => { e.preventDefault(); onError('图形连接中断，请刷新页面。'); });
        new ResizeObserver(() => resizeRenderer(p, host, projection ? 1200 : 900)).observe(host);
      } catch (e) { onError(e.message); p.noLoop(); }
    };
    p.draw = () => {
      if (!shader) return;
      try {
        // size: big clouds shrink with the cloud region (1 for the whole frame); the cloud-size slider scales them too.
        const f = getFrame(), motion=f.motionClock??f.clock, look=lookOf(f), scale=regionScale(f), size=look.cloudSize*scale;
        if(!host.clientWidth){const ratio=f.skyShape==='fill'?(f.skyAspect||16/9):1;const w=Math.round(600*Math.min(1,ratio)),h=Math.round(600/Math.max(1,ratio));if(p.width!==w||p.height!==h)p.resizeCanvas(w,h);}
        const drift=(f.windOffset||[0,0]).map(v=>v*FIELD.drift),key=JSON.stringify([f.field,f.growth,f.cloudForm,motion,f.windDirection,f.windSpeed,drift,size,look.cloudMerge]);
        if (key !== previous) {
          // Half-speed lobe clock: cloud edges form and fade about half as fast, so the group no longer seems to breathe.
          previous=key;drawCloudMass(mass.drawingContext,f.field||[],f.growth,f.cloudForm,motion*.5,f.windDirection,f.windSpeed,drift,size,look.cloudMerge);
        }
        // The strongest 48 clouds: on-screen centre, vanishing point, strength and reach of their influence. A forming or
        // fading cloud leans less, so its thin wisps are not scattered over the 32 layers as dots.
        const cloudData=[],cloudSize=[];
        for(const [x,y,seed,strength] of [...(f.field||[])].filter(c=>c[3]>.01).sort((a,b)=>b[3]-a[3]).slice(0,48)){
          const c=cloudLook(seed,f.cloudForm,f.windDirection??25),cx=x+drift[0],cy=y+drift[1];
          const reach=c.reach*Math.min(1,strength)*look.cloudLean*scale;cloudData.push(cx,cy,cx-reach*Math.cos(c.lean),cy-reach*Math.sin(c.lean));
          cloudSize.push(Math.min(1,strength),cloudReach(f.growth*(.4+.6*strength))*c.scale*size*c.stretch/MASS_SCALE+.1*scale);
        }
        p.shader(shader); shader.setUniform('uResolution', [p.drawingContext.drawingBufferWidth, p.drawingContext.drawingBufferHeight]);
        shader.setUniform('uNoise', noise); shader.setUniform('uMass', mass);
        shader.setUniform('uCloudCount',cloudData.length/4);if(cloudData.length){shader.setUniform('uCloud',cloudData);shader.setUniform('uCloudSize',cloudSize);}
        // Light on the clouds (sun or moon, tinted per part), the two skies' tables and discs, and the colour settings.
        const sky=skyLight(f),L=sky.light,A=sky.A,B=sky.B,part=partLook(f),mixes=lookMix(f);
        for(const [name,value] of Object.entries({uSunDir:L.light,uSunCloud:tint(L.sunCloud,part.light,part.lightMix),uAmbient:tint(L.ambient,part.shade,part.shadeMix),uNight:L.night,uCity:tint(L.city,part.shade,part.shadeMix),uDiskA:A.light,uDiskColA:A.sunCloud,uDiskB:B.light,uDiskColB:B.sunCloud,uSkyTint:part.sky}))shader.setUniform(name,value);
        for(const [name,value] of Object.entries({uSkyA:A.s.a.img,uSkyB:A.s.b.img,uExpA:A.s.a.light.exposure,uExpB:A.s.b.light.exposure,uSkyMix:A.mix,uSkyC:B.s.a.img,uSkyD:B.s.b.img,uExpC:B.s.a.light.exposure,uExpD:B.s.b.light.exposure,uSkyMix2:B.mix,uCross:sky.cross}))shader.setUniform(name,value);
        shader.setUniform('uExposure',L.exposure);shader.setUniform('uStars',L.stars*part.stars);shader.setUniform('uCover',.04);
        for(const [name,value] of Object.entries({uSkyTintMix:part.skyMix,uClear:part.clear,uSat:part.saturation,uStyleMix:mixes.styleMix}))shader.setUniform(name,value);
        // Colour grade at its set strength (0 leaves the image as it is).
        const grade=GRADES[f.grade]||GRADES.natural,g=mixes.gradeMix,toward=(x,one)=>x.map(v=>one+(v-one)*g);
        shader.setUniform('uGradeLift',toward(grade.lift,0));shader.setUniform('uGradeGamma',toward(grade.gamma,1));shader.setUniform('uGradeGain',toward(grade.gain,1));shader.setUniform('uGradeSat',1+(grade.saturation-1)*g);
        const wind=(f.windDirection??25)*Math.PI/180;
        shader.setUniform('uWindOffset',f.windOffset||[Math.cos(wind)*(f.windClock??f.motionClock??f.clock),Math.sin(wind)*(f.windClock??f.motionClock??f.clock)]);shader.setUniform('uMotion',f.motionClock??f.clock);shader.setUniform('uCloudScale',scale);
        for (const [name, value] of Object.entries({ uSquare:f.skyShape==='circle'?0:1,uFill:f.skyShape==='fill'?1:0,uTime: f.clock, uGrowth: f.growth, uFade: f.fade, uStyle: f.style, uBrightness: f.brightness, uRotation: f.rotation * Math.PI / 180, uProjection: projection || f.projection ? 1 : 0, uAlive: f.alive ?? 1, uReduced: f.reduced ? 1 : 0 })) shader.setUniform(name, value);
        for (const [name, value] of Object.entries({ uWarp:.19*look.cloudWarp,uDetailScale:look.cloudScale,uDetail:.6*look.cloudDetail,uBillow:look.cloudBillow,uErode:look.cloudErosion,uThick:6*look.cloudDensity,uShadow:1.3*look.cloudShadow,uSilver:look.cloudSilver,uSoft:look.cloudSoftness,uMerge:look.cloudMerge,uBump:look.cloudBump })) shader.setUniform(name, value);
        p.quad(-1, -1, 1, -1, 1, 1, -1, 1); fps = p.frameRate();
      } catch (e) { onError(e.message); p.noLoop(); }
    };
  }, host);
  return { instance, get canvas() { return source; }, get fps() { return fps; } };
}

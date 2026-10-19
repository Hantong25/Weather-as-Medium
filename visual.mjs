import { tr } from './i18n.mjs?v=2026.10.19.2';
import { landRadius, panelContains } from './layout.mjs?v=2026.10.19.2';
import { skyState, skyTable, skyTableRows, blendLight, applyOvercast, TABLE_SIZE, TABLE_SPAN, ATMOSPHERES } from './atmosphere.mjs?v=2026.10.19.2';
import { FIELD } from './field.mjs?v=2026.10.19.2';
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
// Each wisp has its own lifetime; its opacity and velocity reach zero before it is reseeded.
export function cloudLobes(seed,growth,time=0,form='cumulus') {
  const rnd=random(seed),base=(14+growth*25)*(.72+rnd()*.55);
  const count=form==='layered'?22:form==='broken'?14:20;
  return Array.from({length:count},(_,i)=>{
    const local=random(seed+i*1777),life=14+local()*14,phase=time/life+local(),cycle=Math.floor(phase),u=phase-cycle;
    const core=i<3,shape=random(seed+i*3491+(core?0:cycle*65537));
    const angle=shape()*Math.PI*2,offset=base*Math.sqrt(shape())*(core?.36:form==='broken'?1.35:.95);
    const envelope=Math.sin(Math.PI*u)**2,travel=u*u*(3-2*u)-.5;
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
// field: [x, y, seed, strength] per cloud (see field.mjs); drift: the wind offset in sky units. Each cloud has its own
// seed, so every new cloud takes a new shape; strength 0–1 grows it in and fades it out.
export function drawCloudMass(ctx,field,growth,form='cumulus',time=0,windDirection=25,windSpeed=1,drift=[0,0]) {
  ctx.globalCompositeOperation='source-over';ctx.fillStyle='black';ctx.fillRect(0,0,256,256);ctx.globalCompositeOperation='screen';
  for(const [x,y,seed,strength] of field){
    if(!(strength>0))continue;const size=growth*(.4+.6*strength);
    // Every cloud has its own size (many small, a few large; on average the 10.12.2 size) and is drawn out along the
    // wind by its own amount, as drifting clouds are; stretched layers lie flatter.
    const {angle,scale,stretch,squash}=cloudLook(seed,form,windDirection);
    ctx.save();ctx.translate(128+(x+drift[0])*MASS_SCALE,128+(y+drift[1])*MASS_SCALE);ctx.scale(scale,scale);ctx.rotate(angle);
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
const SKY = `
precision highp float;
uniform vec2 uResolution;
uniform sampler2D uNoise,uMass,uSkyA,uSkyB;
uniform vec2 uWindOffset;
uniform vec4 uCloud[48];
uniform vec2 uCloudSize[48];
uniform float uCloudCount;
uniform vec3 uSunDir,uSunCloud,uAmbient,uNight,uCity;
uniform vec3 uGradeLift,uGradeGamma,uGradeGain;
uniform float uSkyMix,uExpA,uExpB,uGradeSat,uCover,uExposure,uStars,uMotion,uSquare,uFill;
uniform float uTime,uGrowth,uDark,uFade,uStyle,uBrightness,uRotation,uProjection,uAlive,uReduced;
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);vec2 uv=i.xy+vec2(37.,17.)*i.z+f.xy;vec2 n=texture2D(uNoise,fract((uv+.5)/256.)).rg;return mix(n.x,n.y,f.z);}
float fbm(vec3 p){return noise3(p)*.50+noise3(p*2.03+13.1)*.28+noise3(p*4.09+7.8)*.15+noise3(p*8.17+19.2)*.07;}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float hg(float mu,float g){return (1.-g*g)/(12.566*pow(1.+g*g-2.*g*mu,1.5));}
float density(vec3 p,vec3 sky){
 // A narrow lens avoids radial streaks; rescale so on-screen cloud size still matches the particle mass.
 p.xy*=1.75;
 float profile=smoothstep(1.52,1.76,p.z)*(1.-smoothstep(2.65,3.08,p.z));
 if(profile<=0.)return 0.;
 // The texture inside the clouds drifts with the cloud field, at the same wind speed (cloud base: p.xy = .9737q).
 vec3 flow=p-vec3(uWindOffset*${(FIELD.drift*.9737).toFixed(5)},0.);
 vec2 warp=vec2(noise3(flow*1.7+vec3(0.,0.,uMotion*.055)),noise3(flow*1.7+vec3(11.,7.,uMotion*.047)))-.5;
 vec2 uv=(p.xy+warp*.19)*.29+.5;
 float mass=uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.?0.:texture2D(uMass,uv).r;
 // The body term is exactly zero outside the cloud mass, so its five noise lookups are skipped there.
 float body=0.;
 if(mass>.02){
  float detail=fbm((flow+vec3(warp*.08,0.))*mix(7.5,10.,uGrowth)+vec3(0.,0.,uMotion*.06));
  float condensation=(noise3(flow*2.4+vec3(6.,2.,uMotion*.09))-.5)*.16;
  float humidity=mass*.92+(detail-.5)*.60+condensation;
  // Wide thresholds keep a feathered rim that thins into the sky instead of a hard outline.
  body=smoothstep(.1,.5,humidity)*max(0.,humidity-.2)*6.*uFade*smoothstep(.02,.22,mass);
 }
 // The thin background veil does not lean with the clouds (sky: the same height straight above the point).
 vec3 open=sky*vec3(1.75,1.75,1.)-vec3(uWindOffset*${(FIELD.drift*.9737).toFixed(5)},0.);
 float veil=max(0.,fbm(open*3.1+vec3(0.,0.,uMotion*.04))-(.62-.3*uCover))*(.25+2.2*uCover);
 return (body+veil)*profile;
}
// Where the cloud layers above this point lean: each cloud's upper layers converge on its own vanishing point (zw),
// weighted by how close the point is to that cloud and its leaning part. Open sky leans nowhere.
vec2 lean(vec2 q){
 vec2 sum=vec2(0.);float total=.02;
 for(int k=0;k<48;k++){
  if(float(k)>=uCloudCount)break;
  vec4 c=uCloud[k];vec2 seg=(c.zw-c.xy)*.5;
  float h=clamp(dot(q-c.xy,seg)/max(dot(seg,seg),1e-6),0.,1.);
  vec2 d=(q-c.xy-seg*h)/uCloudSize[k].y;
  float w=uCloudSize[k].x*exp(-2.*dot(d,d));
  sum+=w*(q-c.zw);total+=w;
 }
 return sum/total;
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
 float mu=dot(view,uSunDir);
 sky+=uSunCloud*smoothstep(.99994,.99997,mu)*(1.-uDark);
 vec2 cell=floor(view.xy/view.z*170.);float star=step(.9965,hash(cell));
 sky+=vec3(.9,.95,1.)*star*hash(cell+3.)*.004*uStars;
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
   // Light reaching this point through the cloud above it, then scattered down to the viewer.
   float light=exp(-density(p+uSunDir*.14,sky+uSunDir*.14)*1.3);
   float inside=exp(-d*.7);
   vec3 color=uSunCloud*(light*forward*.09+under*(.35+.65*light))+uAmbient*(1.1+.7*inside)+uCity*(.9+.4*inside);
   color*=1.-.45*uDark;
   float alpha=1.-exp(-d*stepSize*mix(2.5,1.45,step(1.5,uStyle)));
   sum+=color*alpha*transmission;transmission*=1.-alpha;
   if(transmission<.018)break;
  }
 }
 vec3 radiance=sum+sky*transmission;
 vec3 result=pow(aces(radiance*uExposure*uBrightness),vec3(1./2.2));
 result=pow(result,1./uGradeGamma)*uGradeGain+uGradeLift*(1.-result);
 result=clamp(mix(vec3(dot(result,vec3(.2126,.7152,.0722))),result,uGradeSat),0.,1.);
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
 result+=(hash(grain)-.5)/255.;
 if(uFill<.5)result=mix(outside,result,(1.-smoothstep(.992,1.,boundary)));
 gl_FragColor=vec4(result*uAlive,1.);
}`;

function resizeRenderer(p, host, max = 1000) {
  if(!host.clientWidth||!host.clientHeight)return;
  const scale = Math.min(1, max / Math.max(host.clientWidth, host.clientHeight));
  p.resizeCanvas(Math.max(1, Math.round(host.clientWidth * scale)), Math.max(1, Math.round(host.clientHeight * scale)));
}
export function createSky(host, getFrame, onError, projection = false) {
  let shader, noise, mass, images = [], previous = '', source = null, fps = 0;
  // Sky light is precomputed at two sun positions (A behind, B ahead) and blended every frame. The next state is built
  // ~3 ms per frame in the background, so fast twilight changes stay smooth and no frame waits for a full table.
  const atmosphere = { base: '', a: null, b: null, job: null, offset: 0, last: null, lastAt: 0, speed: 0 };
  const lightAt = (hour, f) => skyState(hour, { ...(ATMOSPHERES[f.atmosphere] || ATMOSPHERES.melbourne), turbidity: f.turbidity ?? 2.5, cityGlow: f.cityGlow ?? .6, north: f.skyNorth ?? 0 });
  const upload = (img, data) => { img.loadPixels(); img.pixels.set(data); img.updatePixels(); return img; };
  function skyLight(f) {
    const s = atmosphere, now = performance.now(), base = [f.atmosphere, f.turbidity, f.cityGlow, f.skyNorth].join('/');
    let h = (f.hour ?? 0) + s.offset;
    if (s.last !== null && h < s.last - 180) { s.offset += 360; h += 360; } // the loop wraps from night back to dawn
    if (s.last !== null) s.speed += (Math.max(0, (h - s.last) / Math.max(.001, (now - s.lastAt) / 1000)) - s.speed) * .2;
    s.last = h; s.lastAt = now;
    const step = Math.min(8, Math.max(.25, s.speed * .6));
    if (base !== s.base || !s.a || h < s.a.hour - .01 || h > s.b.hour + 2 * step) {
      s.base = base; s.job = null;
      const la = lightAt(h, f), lb = lightAt(h + step, f);
      s.a = { hour: h, light: la, img: upload(images[0], skyTable(la)) }; s.b = { hour: h + step, light: lb, img: upload(images[1], skyTable(lb)) };
    }
    if (!s.job) { const hour = s.b.hour + step; s.job = { hour, light: lightAt(hour, f), data: new Uint8ClampedArray(TABLE_SIZE * TABLE_SIZE * 4), row: 0 }; }
    for (const until = performance.now() + 3; s.job.row < TABLE_SIZE && performance.now() < until; s.job.row++) skyTableRows(s.job.light, s.job.data, s.job.row, s.job.row + 1);
    if (h >= s.b.hour && s.job.row >= TABLE_SIZE) { const img = upload(s.a.img, s.job.data); s.a = s.b; s.b = { hour: s.job.hour, light: s.job.light, img }; s.job = null; }
    const mix = Math.min(1, Math.max(0, (h - s.a.hour) / Math.max(1e-6, s.b.hour - s.a.hour)));
    return { ...applyOvercast(blendLight(s.a.light, s.b.light, mix), f.overcast ?? 0), mix };
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
        noise.updatePixels(); mass = p.createGraphics(256, 256); mass.pixelDensity(1); images = [p.createImage(TABLE_SIZE, TABLE_SIZE), p.createImage(TABLE_SIZE, TABLE_SIZE)];
        source = p.canvas; source.setAttribute('role', 'img'); source.setAttribute('aria-label', tr('天幕：从下方观看的云层，随时间变厚、变暗并散开'));
        source.addEventListener('webglcontextlost', e => { e.preventDefault(); onError('图形连接中断，请刷新页面。'); });
        new ResizeObserver(() => resizeRenderer(p, host, projection ? 1200 : 900)).observe(host);
      } catch (e) { onError(e.message); p.noLoop(); }
    };
    p.draw = () => {
      if (!shader) return;
      try {
        const f = getFrame(), motion=f.motionClock??f.clock;
        if(!host.clientWidth){const ratio=f.skyShape==='fill'?(f.skyAspect||16/9):1;const w=Math.round(600*Math.min(1,ratio)),h=Math.round(600/Math.max(1,ratio));if(p.width!==w||p.height!==h)p.resizeCanvas(w,h);}
        const drift=(f.windOffset||[0,0]).map(v=>v*FIELD.drift),key=JSON.stringify([f.field,f.growth,f.cloudForm,motion,f.windDirection,f.windSpeed,drift]);
        if (key !== previous) {
          // Half-speed lobe clock: cloud edges form and fade about half as fast, so the group no longer seems to breathe.
          previous=key;drawCloudMass(mass.drawingContext,f.field||[],f.growth,f.cloudForm,motion*.5,f.windDirection,f.windSpeed,drift);
        }
        // The strongest 48 clouds: on-screen centre, vanishing point, strength and reach of their influence. A forming or
        // fading cloud leans less, so its thin wisps are not scattered over the 32 layers as dots.
        const cloudData=[],cloudSize=[];
        for(const [x,y,seed,strength] of [...(f.field||[])].filter(c=>c[3]>.01).sort((a,b)=>b[3]-a[3]).slice(0,48)){
          const look=cloudLook(seed,f.cloudForm,f.windDirection??25),cx=x+drift[0],cy=y+drift[1];
          const reach=look.reach*Math.min(1,strength);cloudData.push(cx,cy,cx-reach*Math.cos(look.lean),cy-reach*Math.sin(look.lean));
          cloudSize.push(Math.min(1,strength),cloudReach(f.growth*(.4+.6*strength))*look.scale*look.stretch/MASS_SCALE+.1);
        }
        p.shader(shader); shader.setUniform('uResolution', [p.drawingContext.drawingBufferWidth, p.drawingContext.drawingBufferHeight]);
        shader.setUniform('uNoise', noise); shader.setUniform('uMass', mass);
        shader.setUniform('uCloudCount',cloudData.length/4);if(cloudData.length){shader.setUniform('uCloud',cloudData);shader.setUniform('uCloudSize',cloudSize);}
        const sky=skyLight(f);
        for(const [name,value] of Object.entries({uSunDir:sky.sun,uSunCloud:sky.sunCloud,uAmbient:sky.ambient,uNight:sky.night,uCity:sky.city}))shader.setUniform(name,value);
        const grade=GRADES[f.grade]||GRADES.natural;shader.setUniform('uGradeLift',grade.lift);shader.setUniform('uGradeGamma',grade.gamma);shader.setUniform('uGradeGain',grade.gain);shader.setUniform('uGradeSat',grade.saturation);
        shader.setUniform('uSkyA',atmosphere.a.img);shader.setUniform('uSkyB',atmosphere.b.img);shader.setUniform('uExpA',atmosphere.a.light.exposure);shader.setUniform('uExpB',atmosphere.b.light.exposure);shader.setUniform('uSkyMix',sky.mix);shader.setUniform('uExposure',sky.exposure);shader.setUniform('uStars',sky.stars);shader.setUniform('uCover',.04+.96*(f.overcast??0));
        const wind=(f.windDirection??25)*Math.PI/180;
        shader.setUniform('uWindOffset',f.windOffset||[Math.cos(wind)*(f.windClock??f.motionClock??f.clock),Math.sin(wind)*(f.windClock??f.motionClock??f.clock)]);shader.setUniform('uMotion',f.motionClock??f.clock);
        for (const [name, value] of Object.entries({ uSquare:f.skyShape==='circle'?0:1,uFill:f.skyShape==='fill'?1:0,uTime: f.clock, uGrowth: f.growth, uDark: f.darkness, uFade: f.fade, uStyle: f.style, uBrightness: f.brightness, uRotation: f.rotation * Math.PI / 180, uProjection: projection || f.projection ? 1 : 0, uAlive: f.alive ?? 1, uReduced: f.reduced ? 1 : 0 })) shader.setUniform(name, value);
        p.quad(-1, -1, 1, -1, 1, 1, -1, 1); fps = p.frameRate();
      } catch (e) { onError(e.message); p.noLoop(); }
    };
  }, host);
  return { instance, get canvas() { return source; }, get fps() { return fps; } };
}

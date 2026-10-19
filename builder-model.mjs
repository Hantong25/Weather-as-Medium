import {puddles,landRadius,panelHalfSize,waterSurface} from './layout.mjs?v=2026.10.19.2';
export const PARTS={
 rock:{name:'石块',size:[.8,.5,.65],material:'stone',color:'#96978f'},
 bench:{name:'长凳',size:[1.4,.48,.48],material:'wood',color:'#b29266'},
 boots:{name:'雨靴',size:[.38,.42,.34],material:'rubber',color:'#d5ad32'},
 block:{name:'方块',size:[.8,.6,.8],material:'concrete',color:'#b0aaa0'},
 column:{name:'立柱',size:[.35,1.2,.35],material:'concrete',color:'#b7b6ad'},
 platform:{name:'地台',size:[2,.12,2],material:'stone',color:'#797e70'},
 canopy:{name:'天空面板',size:[2,.04,1.3],material:'metal',color:'#545a59'},
 pond:{name:'水洼',size:[1.1,.05,.75],material:'water',color:'#718986'},
};
export const WATER_MATERIALS={water:{zh:'自然水面',en:'Natural water',color:'#718986',reflection:.68,tint:.11},'clear-water':{zh:'清水',en:'Clear water',color:'#9cbec3',reflection:.5,tint:.4},'dark-water':{zh:'深色水面',en:'Dark water',color:'#263e42',reflection:.45,tint:.2},'muddy-water':{zh:'泥水',en:'Muddy water',color:'#8b7250',reflection:.18,tint:.75},mirror:{zh:'镜面测试',en:'Mirror test',color:'#ffffff',reflection:1,tint:0}};
export const MATERIALS=['stone','concrete','wood','rubber','metal',...Object.keys(WATER_MATERIALS)];
export const MAX_OBJECTS=96;
export function validObject(o){
 const num=(v,a,b)=>typeof v==='number'&&Number.isFinite(v)&&v>=a&&v<=b;
 return o&&typeof o.id==='string'&&o.id.length>0&&o.id.length<=80&&Object.hasOwn(PARTS,o.type)&&typeof o.name==='string'&&o.name.length<=60&&['x','z'].every(k=>num(o[k],-100,100))&&num(o.y,-5,30)&&['width','height','depth'].every(k=>num(o[k],.02,30))&&['rx','ry','rz'].every(k=>num(o[k],-360,360))&&MATERIALS.includes(o.material)&&/^#[0-9a-f]{6}$/i.test(o.color)&&num(o.seed,0,999999)&&num(o.roughness,0,2)&&[0,1,2,3,4,5,6,7].includes(o.shape);
}
export function newObject(type,point,id=crypto.randomUUID()){
 if(!Object.hasOwn(PARTS,type))throw Error('Unknown part');const p=PARTS[type];
 return {id,type,name:p.name,x:point.x,y:point.y+(type==='canopy'?2.2:0),z:point.z,width:p.size[0],height:p.size[1],depth:p.size[2],rx:0,ry:0,rz:0,material:p.material,color:p.color,seed:Math.floor(Math.random()*999999),roughness:1,shape:type==='pond'?1:2};
}
export function fixtureObjects(g){
 if(!g.equipment||g.layout==='center')return[];
 const angle=(g.baseRotation||0)*Math.PI/180,y=(g.baseY||0)+(g.baseHeight||0),world=(x,z)=>({x:g.baseX+Math.cos(angle)*x+Math.sin(angle)*z,y,z:g.baseZ-Math.sin(angle)*x+Math.cos(angle)*z});
 return [{...newObject('rock',world(-.14,-.1),'fixture-rock-a'),width:.78,height:.42,depth:.6,seed:42},{...newObject('rock',world(.32,-.15),'fixture-rock-b'),width:.48,height:.34,depth:.46,seed:17},{...newObject('boots',world(0,.4),'fixture-boots'),ry:g.baseRotation,seed:9}].filter(o=>!g.objects?.some(existing=>existing.id===o.id));
}
export function materializeFixtures(g){g.objects??=[];g.objects.push(...fixtureObjects(g));g.equipment=false;}
export function coreParts(g){
 const [w,h]=panelHalfSize(g),R=landRadius(g),s=g.surface||{material:'stone',color:'#797e70'};
 return [{id:'core-canopy',type:'canopy',name:'主天幕',x:g.panelX,y:g.height,z:g.panelZ,width:w*2,height:.04,depth:h*2,rx:g.tiltX,ry:g.panelYaw||0,rz:g.tiltZ,shape:g.skyShape==='circle'?0:2,material:'metal',color:'#545a59',seed:0,roughness:1},
 {id:'core-ground',type:'platform',name:'主地面',x:g.baseX,y:g.baseY||0,z:g.baseZ,width:R*2,height:g.baseHeight||.002,depth:R*2,rx:0,ry:0,rz:0,shape:0,material:s.material,color:s.color,seed:0,roughness:1}];
}
export function allObjects(g){return [...coreParts(g),...fixtureObjects(g),...(g.objects||[])];}
export function allPonds(g){
 return [...puddles(g).map((p,i)=>({...p,id:`pond:${i}`,rimY:(g.baseY||0)+g.baseHeight+(p.elevation||0),basinDepth:p.basinDepth??Math.max(.01,g.baseHeight),clip:{x:g.baseX,z:g.baseZ,radius:landRadius(g)}})),
 ...(g.objects||[]).filter(o=>o.type==='pond').map(o=>({id:o.id,x:o.x,z:o.z,a:o.width/2,b:o.depth/2,angle:-o.ry*Math.PI/180,seed:o.seed,shape:o.shape,roughness:o.roughness,color:o.color,material:o.material,rimY:o.y,basinDepth:o.height,clip:null}))];
}
export function pondWater(g,p,fraction){const w=waterSurface({...g,baseHeight:p.basinDepth,baseY:p.rimY-p.basinDepth},fraction);return w;}
export function setObjectTransform(g,id,patch){
 if(id.startsWith('fixture-'))materializeFixtures(g);
 if(id==='core-canopy'){
  const previousDepth=panelHalfSize(g)[1]*2;if(patch.depth!==undefined&&g.skyShape!=='circle'&&Math.abs(patch.depth-previousDepth)>.00001)g.skyShape='fill';
  if(patch.shape!==undefined)g.skyShape=patch.shape===0?'circle':'fill';
  if(patch.x!==undefined)g.panelX=patch.x;if(patch.y!==undefined)g.height=patch.y;if(patch.z!==undefined)g.panelZ=patch.z;
  if(patch.width!==undefined)g.diameter=Math.max(.2,patch.width);if(patch.depth!==undefined&&g.skyShape==='fill')g.skyAspect=Math.max(.25,Math.min(4,g.diameter/patch.depth));
  if(patch.ry!==undefined)g.panelYaw=patch.ry;if(patch.rx!==undefined)g.tiltX=patch.rx;if(patch.rz!==undefined)g.tiltZ=patch.rz;
  return;
 }
 if(id==='core-ground'){
  if(patch.x!==undefined)g.baseX=patch.x;if(patch.y!==undefined)g.baseY=patch.y;if(patch.z!==undefined)g.baseZ=patch.z;
  if(patch.width!==undefined)g.area=Math.PI*(Math.max(.2,patch.width)/2)**2;if(patch.height!==undefined)g.baseHeight=patch.height;
  if(patch.material||patch.color)g.surface={...(g.surface||{material:'stone',color:'#797e70'}),...(patch.material?{material:patch.material}:{}),...(patch.color?{color:patch.color}:{})};return;
 }
 const o=g.objects?.find(o=>o.id===id);if(!o)throw Error('Part no longer exists');Object.assign(o,patch);
}
export function cloneObject(o,id=crypto.randomUUID()){return {...structuredClone(o),id,name:(o.name+' copy').slice(0,60),x:Math.min(100,o.x+.25),z:Math.min(100,o.z+.25)};}
// Convex clipping is only used when geometry changes, never in the animation loop.
export function clipToDisc(points,disc){
 if(!disc)return points;let output=points;
 for(let i=0;i<64&&output.length;i++){
  const a=i*Math.PI/32,b=(i+1)*Math.PI/32,A={x:disc.x+Math.cos(a)*disc.radius,z:disc.z+Math.sin(a)*disc.radius},B={x:disc.x+Math.cos(b)*disc.radius,z:disc.z+Math.sin(b)*disc.radius};
  const inside=p=>(B.x-A.x)*(p.z-A.z)-(B.z-A.z)*(p.x-A.x)>=-1e-9;
  const cross=(p,q)=>{const dx=q.x-p.x,dz=q.z-p.z,ex=B.x-A.x,ez=B.z-A.z,den=dx*ez-dz*ex,t=((A.x-p.x)*ez-(A.z-p.z)*ex)/den;return{x:p.x+dx*t,z:p.z+dz*t};};
  const input=output;output=[];let previous=input.at(-1);
  for(const current of input){const a=inside(previous),b=inside(current);if(a!==b)output.push(cross(previous,current));if(b)output.push(current);previous=current;}
 }
 return output;
}

export function objectSpec(g,id){
 const o=allObjects(g).find(o=>o.id===id);if(o)return o;
 const p=allPonds(g).find(p=>p.id===id);return p?{id:p.id,type:'pond',name:p.name||('水洼 '+(+p.id.split(':')[1]+1)),x:p.x,y:p.rimY,z:p.z,width:p.a*2,height:p.basinDepth,depth:p.b*2,rx:0,ry:-p.angle*180/Math.PI,rz:0,material:p.material||'water',color:p.color||'#718986',shape:p.shape,roughness:p.roughness,seed:p.seed}:null;
}

export const SHAPES={
 pond:[[0,'柔和圆形','Soft round'],[1,'自然不规则','Organic'],[2,'椭圆','Ellipse'],[3,'豆形／弯月','Kidney'],[4,'双叶水洼','Two lobes'],[5,'碎边水洼','Ragged edge'],[6,'曲流水洼','Winding'],[7,'圆角矩形','Rounded rectangle']],
 rock:[[0,'圆润卵石','Smooth pebble'],[1,'扁平岩石','Flat boulder'],[2,'棱角岩块','Rough boulder'],[3,'柱状岩石','Rock pillar']],
 block:[[0,'球体','Sphere'],[1,'斜坡','Wedge'],[2,'长方体','Box'],[3,'圆柱体','Cylinder']],
 column:[[2,'圆柱','Round'],[1,'锥台','Tapered'],[0,'方柱','Square'],[3,'六角柱','Hexagonal']],
 platform:[[0,'圆形／椭圆','Round / oval'],[2,'矩形','Rectangle'],[4,'六边形','Hexagon']],
 canopy:[[0,'圆形／椭圆','Round / oval'],[2,'矩形','Rectangle'],[4,'六边形','Hexagon']],
 bench:[[0,'圆凳','Round stool'],[1,'石凳','Stone seat'],[2,'木条长凳','Slatted bench'],[3,'实心长凳','Solid bench']],
 boots:[[2,'雨靴','Rain boots']]
};

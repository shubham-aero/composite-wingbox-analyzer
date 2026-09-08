/* SI throughout, except explicitly named UI fields. See MODEL.md. */
export const REGION_NAMES = {upper:'Upper skin',lower:'Lower skin',front:'Front web',rear:'Rear web',caps:'Spar caps'};
const G=9.80665;
const fail=message=>{throw new Error(message);};
const sum=a=>a.reduce((s,x)=>s+x,0);
const zero=()=>Array.from({length:3},()=>[0,0,0]);
const cross=(a,b)=>a.x*b.z-a.z*b.x;
const lerp=(a,b,t)=>a+(b-a)*t;
export function defaults(){return {
  airfoil:{kind:'naca',code:'2412',text:'',name:'NACA 2412'},
  geometry:{length:3,spanMode:'half',chord:0.6,front:0.2,rear:0.65,capWidth:0.035},
  material:{E1:135,E2:10,G12:5,nu12:0.3,density:1600,Xt:1500,Xc:1000,Yt:40,Yc:150,S:70},
  layups:Object.fromEntries(Object.keys(REGION_NAMES).map(k=>[k,{mirror:true,rows:(k==='caps'?[0,0,0,0]:[0,45,-45,90]).map(angle=>({angle,thickness:0.125,count:1}))}])),
  loads:{force:1500,shape:'elliptical',x:0.25,multiplier:1,selfWeight:true,torqueDensity:0,tipTorque:0,points:[]}
};}
function finite(v,name,min=-Infinity,max=Infinity){if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail(`${name} must be between ${min} and ${max}.`);}
export function validate(c){
  if(!c?.geometry||!c?.material||!c?.layups||!c?.loads||!c?.airfoil)fail('This is not a Composite WingBox Analyzer project.');
  const g=c.geometry,m=c.material,l=c.loads;
  finite(g.length,'Wing length (m)',0.05,100);finite(g.chord,'Chord (m)',0.02,20);
  if(!['half','full'].includes(g.spanMode))fail('Choose root-to-tip length or full wingspan.');
  finite(g.front,'Front spar x/c',0.02,0.85);finite(g.rear,'Rear spar x/c',0.1,0.98);
  if(g.rear-g.front<0.05)fail('Place the rear spar at least 5% chord behind the front spar.');
  finite(g.capWidth,'Cap width (m)',0,(g.rear-g.front)*g.chord/2);
  for(const k of ['E1','E2','G12'])finite(m[k],`${k} (GPa)`,0.01,1000);
  finite(m.nu12,'Poisson ratio ν12',-0.9,0.9);if(1-m.nu12*m.nu12*m.E2/m.E1<=0)fail('Material constants do not form a positive-definite lamina.');
  finite(m.density,'Density (kg/m³)',10,30000);for(const k of ['Xt','Xc','Yt','Yc','S'])finite(m[k],`${k} strength (MPa)`,0.01,100000);
  finite(l.force,'Distributed force (N)',-1e8,1e8);finite(l.x,'Load position x/c',0,1);finite(l.multiplier,'Load multiplier',0.01,100);
  finite(l.torqueDensity,'Distributed torque (N·m/m)',-1e8,1e8);finite(l.tipTorque,'Tip torque (N·m)',-1e8,1e8);
  if(!['uniform','elliptical','triangular'].includes(l.shape))fail('Choose a supported load distribution.');
  if(!Array.isArray(l.points)||l.points.length>30)fail('Use at most 30 point loads.');
  const L=g.length/(g.spanMode==='full'?2:1);
  l.points.forEach((p,i)=>{finite(p.y,`Point ${i+1} span position (m)`,0,L);finite(p.force,`Point ${i+1} force (N)`,-1e8,1e8);finite(p.x,`Point ${i+1} x/c`,0,1);});
  return L;
}
export function laminate(spec,m){
  if(!spec||!Array.isArray(spec.rows)||!spec.rows.length||spec.rows.length>80)fail('Each laminate needs 1–80 ply rows.');
  let plies=[];
  for(const r of spec.rows){finite(r.angle,'Ply angle (°)',-180,180);finite(r.thickness,'Ply thickness (mm)',0.001,5);finite(r.count,'Ply repeat count',1,100);if(!Number.isInteger(r.count))fail('Ply repeat counts must be whole numbers.');for(let i=0;i<r.count;i++)plies.push({angle:r.angle,t:r.thickness/1000});}
  if(spec.mirror)plies=[...plies,...plies.slice().reverse().map(p=>({...p}))];
  if(plies.length>400)fail('Use at most 400 physical plies per laminate.');
  const t=sum(plies.map(p=>p.t)),nu21=m.nu12*m.E2/m.E1,den=1-m.nu12*nu21;
  const q11=m.E1*1e9/den,q22=m.E2*1e9/den,q12=m.nu12*m.E2*1e9/den,q66=m.G12*1e9;
  const A=zero(),B=zero(),D=zero();let z=-t/2;
  plies=plies.map((p,i)=>{
    const a=p.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),c2=c*c,s2=s*s;
    const b11=q11*c2*c2+2*(q12+2*q66)*c2*s2+q22*s2*s2;
    const b22=q11*s2*s2+2*(q12+2*q66)*c2*s2+q22*c2*c2;
    const b12=(q11+q22-4*q66)*c2*s2+q12*(c2*c2+s2*s2);
    const b16=(q11-q12-2*q66)*c*c*c*s-(q22-q12-2*q66)*c*s*s*s;
    const b26=(q11-q12-2*q66)*c*s*s*s-(q22-q12-2*q66)*c*c*c*s;
    const b66=(q11+q22-2*q12-2*q66)*c2*s2+q66*(c2*c2+s2*s2);
    const Q=[[b11,b12,b16],[b12,b22,b26],[b16,b26,b66]],z0=z,z1=z+p.t;z=z1;
    for(let j=0;j<3;j++)for(let k=0;k<3;k++){A[j][k]+=Q[j][k]*(z1-z0);B[j][k]+=Q[j][k]*(z1*z1-z0*z0)/2;D[j][k]+=Q[j][k]*(z1**3-z0**3)/3;}
    return {...p,index:i+1,c,s,z0,z1};
  });
  const balanced=Math.max(Math.abs(A[0][2])/Math.sqrt(A[0][0]*A[2][2]),Math.abs(A[1][2])/Math.sqrt(A[1][1]*A[2][2]))<1e-7;
  const symmetric=Math.max(...B.flat().map(Math.abs))/Math.sqrt(Math.max(...A.flat().map(Math.abs))*Math.max(...D.flat().map(Math.abs)))<1e-7;
  const axial=A[0][0]-A[0][1]**2/A[1][1];
  return {plies,t,A,B,D,axial,shear:A[2][2],E:axial/t,G:A[2][2]/t,symmetric,balanced,q11,q22,q12,q66};
}
function interp(points,x){
  if(x<=points[0].x)return points[0].z;if(x>=points.at(-1).x)return points.at(-1).z;
  let lo=0,hi=points.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid].x<=x)lo=mid;else hi=mid;}
  return lerp(points[lo].z,points[hi].z,(x-points[lo].x)/(points[hi].x-points[lo].x));
}
function cleanBranch(a){
  const s=a.slice().sort((a,b)=>a.x-b.x),out=[];
  for(const p of s){if(out.length&&Math.abs(out.at(-1).x-p.x)<1e-9)out.at(-1).z=(out.at(-1).z+p.z)/2;else out.push({...p});}
  if(out.length<4)fail('Each airfoil surface needs at least four distinct x coordinates.');return out;
}
export function parseAirfoil(text){
  if(typeof text!=='string'||text.length>1000000)fail('Use an airfoil coordinate file smaller than 1 MB.');
  const pts=[];
  for(const line of text.split(/\r?\n/)){
    const raw=line.trim();if(!raw||raw.startsWith('#'))continue;
    const v=raw.replace(/[,;\t]/g,' ').split(/\s+/).map(Number);
    if(v.length!==2||!v.every(Number.isFinite))continue;
    if(pts.length===0&&v.every(x=>x>=4&&Number.isInteger(x)))continue;
    pts.push({x:v[0],z:v[1]});
  }
  if(pts.length<10||pts.length>20000)fail('Provide 10–20,000 ordered airfoil x y coordinate pairs (Selig or Lednicer format).');
  const xs=pts.map(p=>p.x),xmin=Math.min(...xs),xmax=Math.max(...xs),c=xmax-xmin;
  if(c<1e-8)fail('Airfoil coordinates need a nonzero chord.');
  let a,b;const eps=c*0.03;
  if(pts[0].x>xmax-eps&&pts.at(-1).x>xmax-eps){
    const le=xs.indexOf(xmin);a=pts.slice(0,le+1);b=pts.slice(le);
  }else if(pts[0].x<xmin+eps&&pts.at(-1).x>xmax-eps){
    let cut=-1,drop=0;for(let i=1;i<pts.length;i++){const d=pts[i-1].x-pts[i].x;if(d>drop){drop=d;cut=i;}}
    if(drop<c*0.5)fail('Coordinates must include both upper and lower surfaces, ordered in Selig or Lednicer format.');
    a=pts.slice(0,cut);b=pts.slice(cut);
  }else fail('Start at the trailing edge for Selig data, or supply upper and lower LE-to-TE blocks for Lednicer data.');
  a=cleanBranch(a);b=cleanBranch(b);
  if(Math.max(a[0].x,b[0].x)>xmin+eps||Math.min(a.at(-1).x,b.at(-1).x)<xmax-eps)fail('Both surfaces must extend from leading edge to trailing edge.');
  const zref=(interp(a,xmax)+interp(b,xmax))/2;
  a=a.map(p=>({x:(p.x-xmin)/c,z:(p.z-zref)/c}));b=b.map(p=>({x:(p.x-xmin)/c,z:(p.z-zref)/c}));
  if(interp(a,0.4)<interp(b,0.4))[a,b]=[b,a];
  for(let i=2;i<99;i++)if(interp(a,i/100)<interp(b,i/100)-1e-5)fail('Airfoil surfaces cross. Check coordinate ordering.');
  const maxThickness=Math.max(...Array.from({length:99},(_,i)=>interp(a,(i+1)/100)-interp(b,(i+1)/100)));
  if(maxThickness<0.005||maxThickness>0.6)fail('Airfoil thickness must lie between 0.5% and 60% chord after normalization.');
  return {upper:a,lower:b,name:'Imported airfoil',normalizedChord:c};
}
export function naca4(code){
  if(!/^\d{4}$/.test(String(code)))fail('Enter a four-digit NACA code, such as 0012 or 2412.');
  const m=Number(code[0])/100,p=Number(code[1])/10,t=Number(code.slice(2))/100;
  if(t<0.01||t>0.4||(m>0&&p===0))fail('Use thickness 01–40 and a nonzero camber position for cambered NACA sections.');
  const up=[],low=[];
  for(let i=0;i<=160;i++){
    const x=(1-Math.cos(i*Math.PI/160))/2;
    const yt=5*t*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x**3-.1036*x**4);
    let yc=0,dy=0;if(m>0){if(x<p){yc=m/p**2*(2*p*x-x*x);dy=2*m/p**2*(p-x);}else{yc=m/(1-p)**2*(1-2*p+2*p*x-x*x);dy=2*m/(1-p)**2*(p-x);}}
    const theta=Math.atan(dy);up.push({x:x-yt*Math.sin(theta),z:yc+yt*Math.cos(theta)});low.push({x:x+yt*Math.sin(theta),z:yc-yt*Math.cos(theta)});
  }
  return {upper:cleanBranch(up),lower:cleanBranch(low),name:`NACA ${code}`};
}
export function airfoilFor(c){if(c.airfoil.kind==='naca')return naca4(c.airfoil.code);if(c.airfoil.kind==='coordinates')return parseAirfoil(c.airfoil.text);fail('Choose NACA or coordinate input.');}
const GAUSS=[[.06943184420297371,.17392742256872693],[.33000947820757187,.32607257743127307],[.6699905217924281,.32607257743127307],[.9305681557970262,.17392742256872693]];
export function buildSection(g,airfoil,lams,density,resolution=64){
  const x1=g.front*g.chord,x2=g.rear*g.chord;
  const u=x=>({x,z:interp(airfoil.upper,x/g.chord)*g.chord}),b=x=>({x,z:interp(airfoil.lower,x/g.chord)*g.chord});
  const corners=[u(x1),u(x2),b(x2),b(x1)],nodes=[],types=[];
  const add=(p0,p1,n,type,curved)=>{for(let i=0;i<n;i++){const f=i/n,x=lerp(p0.x,p1.x,f);nodes.push(curved?curved(x):{x,z:lerp(p0.z,p1.z,f)});types.push(type);}};
  add(corners[0],corners[1],resolution,'upper',u);add(corners[1],corners[2],24,'rear');add(corners[2],corners[3],resolution,'lower',b);add(corners[3],corners[0],24,'front');
  const boomAt=new Map(),boomIndices=[0,resolution,resolution+24,2*resolution+24];
  const booms=g.capWidth>0?corners.map((p,i)=>{const v={...p,area:g.capWidth*lams.caps.t,EA:g.capWidth*lams.caps.axial,region:'caps',label:['Front upper cap','Rear upper cap','Rear lower cap','Front lower cap'][i]};boomAt.set(boomIndices[i],v);return v;}):[];
  const panels=nodes.map((p,i)=>{const end=nodes[(i+1)%nodes.length],l=Math.hypot(end.x-p.x,end.z-p.z),lam=lams[types[i]];return {p,end,l,region:types[i],lam,EA:lam.axial*l};});
  const EA=sum(panels.map(p=>p.EA))+sum(booms.map(b=>b.EA));
  const xe=(sum(panels.map(p=>p.EA*(p.p.x+p.end.x)/2))+sum(booms.map(b=>b.EA*b.x)))/EA;
  const ze=(sum(panels.map(p=>p.EA*(p.p.z+p.end.z)/2))+sum(booms.map(b=>b.EA*b.z)))/EA;
  let Izz=0,Ixx=0,Ixz=0;
  for(const p of panels){const x0=p.p.x-xe,x1=p.end.x-xe,z0=p.p.z-ze,z1=p.end.z-ze;Izz+=p.EA*(z0*z0+z0*z1+z1*z1)/3;Ixx+=p.EA*(x0*x0+x0*x1+x1*x1)/3;Ixz+=p.EA*(2*x0*z0+x0*z1+x1*z0+2*x1*z1)/6;}
  for(const b of booms){Izz+=b.EA*(b.z-ze)**2;Ixx+=b.EA*(b.x-xe)**2;Ixz+=b.EA*(b.x-xe)*(b.z-ze);}
  const det=Izz*Ixx-Ixz*Ixz;if(det<=0||!Number.isFinite(det))fail('The wing-box bending stiffness is singular. Check geometry and layups.');
  const betaZ=Ixx/det,betaX=-Ixz/det,area2=sum(panels.map(p=>cross(p.p,p.end)));
  if(Math.abs(area2)<1e-9)fail('Wing box has zero enclosed area.');
  let qb=0,integral=0,compliance=0;
  for(let i=0;i<panels.length;i++){
    const boom=boomAt.get(i);if(boom)qb-=boom.EA*(betaZ*(boom.z-ze)+betaX*(boom.x-xe));
    const p=panels[i],f0=betaZ*(p.p.z-ze)+betaX*(p.p.x-xe),f1=betaZ*(p.end.z-ze)+betaX*(p.end.x-xe);
    p.qb0=qb;p.qa=-p.EA*f0;p.qb=-p.EA*(f1-f0)/2;
    p.qavg=qb+p.qa/2+p.qb/3;qb+=p.qa+p.qb;
    compliance+=p.l/p.lam.shear;integral+=p.qavg*p.l/p.lam.shear;
  }
  const closureResidual=qb,qshift=-integral/compliance;let shearCompliance=0,xsc=0,forceZ=0,forceX=0;
  for(const p of panels){p.q0=p.qb0+qshift;p.qavg+=qshift;xsc+=p.qavg*cross(p.p,p.end);forceZ+=p.qavg*(p.end.z-p.p.z);forceX+=p.qavg*(p.end.x-p.p.x);for(const [t,w]of GAUSS)shearCompliance+=(p.q0+p.qa*t+p.qb*t*t)**2*p.l/p.lam.shear*w;}
  const GJ=area2*area2/compliance;
  // A second unit-shear solution locates the other shear-centre coordinate
  // and supplies transverse shear compliance coupling.
  let hb=0,hIntegral=0;
  for(let i=0;i<panels.length;i++){
    const boom=boomAt.get(i);if(boom)hb-=boom.EA*((-Ixz/det)*(boom.z-ze)+(Izz/det)*(boom.x-xe));
    const p=panels[i],f0=(-Ixz/det)*(p.p.z-ze)+(Izz/det)*(p.p.x-xe),f1=(-Ixz/det)*(p.end.z-ze)+(Izz/det)*(p.end.x-xe);
    p.h0=hb;p.ha=-p.EA*f0;p.hb=-p.EA*(f1-f0)/2;hIntegral+=(hb+p.ha/2+p.hb/3)*p.l/p.lam.shear;hb+=p.ha+p.hb;
  }
  const hShift=-hIntegral/compliance;let zsc=0,crossShearCompliance=0,forceHX=0,forceHZ=0;
  for(const p of panels){p.h0+=hShift;const avg=p.h0+p.ha/2+p.hb/3;zsc-=avg*cross(p.p,p.end);forceHX+=avg*(p.end.x-p.p.x);forceHZ+=avg*(p.end.z-p.p.z);for(const [t,w]of GAUSS)crossShearCompliance+=(p.q0+p.qa*t+p.qb*t*t)*(p.h0+p.ha*t+p.hb*t*t)*p.l/p.lam.shear*w;}
  const materialArea=sum(panels.map(p=>p.l*p.lam.t))+sum(booms.map(b=>b.area));
  const massPerLength=materialArea*density;
  const xcg=(sum(panels.map(p=>p.l*p.lam.t*(p.p.x+p.end.x)/2))+sum(booms.map(b=>b.area*b.x)))/materialArea;
  const massBreakdown=Object.keys(REGION_NAMES).map(region=>({region,perLength:density*(region==='caps'?sum(booms.map(b=>b.area)):sum(panels.filter(p=>p.region===region).map(p=>p.l*p.lam.t)))}));
  return {panels,booms,corners,xe,ze,xcg,xsc,zsc,EA,Izz,Ixx,Ixz,betaZ,betaX,EI:1/betaZ,area2,area:Math.abs(area2)/2,GJ,shearCompliance,crossShearCompliance,massPerLength,massBreakdown,checks:{closureResidual,forceZ,forceX,forceHX,forceHZ}};
}
export function distributed(force,L,y,shape){
  const u=Math.max(0,Math.min(1,y/L)),v=1-u;
  if(shape==='uniform')return {w:force/L,V:force*v,M:force*L*v*v/2};
  if(shape==='triangular')return {w:2*force/L*v,V:force*v*v,M:force*L*v**3/3};
  const root=Math.sqrt(Math.max(0,1-u*u)),integral=Math.PI/4-(Math.asin(u)+u*root)/2;
  return {w:4*force/(Math.PI*L)*root,V:4*force/Math.PI*integral,M:4*force*L/Math.PI*(root**3/3-u*integral)};
}
export function loadAt(c,s,L,y,side='inboard'){
  const l=c.loads,a=distributed(l.force,L,y,l.shape),weight=l.selfWeight?distributed(-s.massPerLength*G*L,L,y,'uniform'):{w:0,V:0,M:0};
  let V=a.V+weight.V,M=a.M+weight.M,T=a.V*(l.x*c.geometry.chord-s.xsc)+weight.V*(s.xcg-s.xsc)+l.torqueDensity*(L-y);
  if(y<L||side==='inboard')T+=l.tipTorque;
  for(const p of l.points)if(p.y>y||(side==='inboard'&&Math.abs(p.y-y)<1e-12)){V+=p.force;M+=p.force*Math.max(0,p.y-y);T+=p.force*(p.x*c.geometry.chord-s.xsc);}
  return {y,side,V:V*l.multiplier,M:M*l.multiplier,T:T*l.multiplier,w:(a.w+weight.w)*l.multiplier};
}
function plyStress(lam,ply,eps,q,m){
  const es=-lam.A[0][1]/lam.A[1][1]*eps,gamma=q/lam.shear,c=ply.c,s=ply.s;
  const e1=c*c*eps+s*s*es+c*s*gamma,e2=s*s*eps+c*c*es-c*s*gamma,g12=-2*c*s*eps+2*c*s*es+(c*c-s*s)*gamma;
  const s1=(lam.q11*e1+lam.q12*e2)/1e6,s2=(lam.q12*e1+lam.q22*e2)/1e6,t12=lam.q66*g12/1e6;
  const ratios=[Math.abs(s1)/(s1>=0?m.Xt:m.Xc),Math.abs(s2)/(s2>=0?m.Yt:m.Yc),Math.abs(t12)/m.S];
  const FI=Math.max(...ratios),mode=['Fibre '+(s1>=0?'tension':'compression'),'Transverse '+(s2>=0?'tension':'compression'),'In-plane shear'][ratios.indexOf(FI)];
  return {s1,s2,t12,FI,mode,eps,q};
}
export function sectionStress(c,s,lams,load,withRows=true){
  let worst={FI:0,region:'upper',ply:1,angle:0,mode:'No applied load',x:s.corners[0].x,z:s.corners[0].z,s1:0,s2:0,t12:0,eps:0,q:0,y:load.y,side:load.side};
  const rows=new Map(),walls=[];
  const inspect=(region,label,x,z,q,lam)=>{
    const eps=-load.M*(s.betaZ*(z-s.ze)+s.betaX*(x-s.xe));let wallFI=0;
    for(const ply of lam.plies){const v=plyStress(lam,ply,eps,q,c.material),item={...v,region,label,ply:ply.index,angle:ply.angle,x,z,y:load.y,side:load.side};if(v.FI>worst.FI)worst=item;wallFI=Math.max(wallFI,v.FI);if(withRows){const key=region+':'+ply.index;if(!rows.has(key)||v.FI>rows.get(key).FI)rows.set(key,item);}}
    return wallFI;
  };
  for(const p of s.panels){let fi=0;for(const t of [0,.5,1]){const x=lerp(p.p.x,p.end.x,t),z=lerp(p.p.z,p.end.z,t),q=(p.q0+p.qa*t+p.qb*t*t)*load.V+load.T/s.area2;fi=Math.max(fi,inspect(p.region,REGION_NAMES[p.region],x,z,q,p.lam));}if(withRows)walls.push({...p,FI:fi});}
  for(const b of s.booms)inspect('caps',b.label,b.x,b.z,0,lams.caps);
  return {worst,rows:[...rows.values()],walls};
}
export function analyse(c,options={}){
  const L=validate(c),airfoil=airfoilFor(c),lams=Object.fromEntries(Object.keys(REGION_NAMES).map(k=>[k,laminate(c.layups[k],c.material)]));
  for(const [k,v]of Object.entries(lams)){
    if(k==='caps'&&c.geometry.capWidth===0)continue;
    if(!v.symmetric)fail(`${REGION_NAMES[k]} is unsymmetric (B ≠ 0). Mirror the stack or enter a symmetric stack; this beam model does not resolve laminate bending–extension coupling.`);
    if(!v.balanced)fail(`${REGION_NAMES[k]} has extension–shear coupling. Balance +θ and −θ plies with equal thickness; this model requires A16 = A26 = 0.`);
  }
  const section=buildSection(c.geometry,airfoil,lams,c.material.density,options.resolution??64);
  const n=options.stations??160,ys=[...new Set([...Array.from({length:n+1},(_,i)=>L*i/n),...c.loads.points.map(p=>p.y)])].sort((a,b)=>a-b);
  const stations=[];let rotation=0,lateralRotation=0,bend=0,lateral=0,lateralShear=0,shear=0,twist=0,worst={FI:-1};
  for(let i=0;i<ys.length;i++){
    const y=ys[i],load=loadAt(c,section,L,y);
    if(i){const h=y-ys[i-1],a=loadAt(c,section,L,ys[i-1],'outboard'),b=load;
      const next=rotation+h*(a.M+b.M)*section.betaZ/2,nextLat=lateralRotation+h*(a.M+b.M)*section.betaX/2;
      bend+=h*(rotation+next)/2;lateral+=h*(lateralRotation+nextLat)/2;rotation=next;lateralRotation=nextLat;
      shear+=h*(a.V+b.V)*section.shearCompliance/2;twist+=h*(a.T+b.T)/(2*section.GJ);
      lateralShear+=h*(a.V+b.V)*section.crossShearCompliance/2;
    }
    const stress=sectionStress(c,section,lams,load,false);if(stress.worst.FI>worst.FI)worst=stress.worst;
    let FIout=stress.worst.FI;
    if(c.loads.points.some(p=>Math.abs(p.y-y)<1e-12)){const out=sectionStress(c,section,lams,loadAt(c,section,L,y,'outboard'),false);FIout=out.worst.FI;if(out.worst.FI>worst.FI)worst=out.worst;}
    stations.push({...load,rotation,bend,lateral:lateral+lateralShear,lateralBend:lateral,lateralShear,shear,deflection:bend+shear,twist,FI:stress.worst.FI,FIout});
  }
  const tip=stations.at(-1),warnings=[];
  const height=Math.max(...section.corners.map(p=>p.z))-Math.min(...section.corners.map(p=>p.z));
  if(L/height<10)warnings.push('Short beam: span/box depth < 10. Cross-section distortion and local effects may be significant.');
  if(Math.max(...stations.map(p=>Math.abs(p.deflection)))/L>0.1)warnings.push('Deflection exceeds 10% of half-span. Geometrically nonlinear analysis is needed.');
  if(Math.max(...stations.map(p=>Math.abs(p.rotation)))>0.1||Math.abs(tip.twist)>0.1)warnings.push('Bending rotation or twist exceeds 0.1 rad. Small-rotation assumptions may be inaccurate.');
  if(Math.max(lams.upper.t,lams.lower.t,lams.front.t,lams.rear.t)/height>0.05)warnings.push('A wall exceeds 5% of box depth. The thin-wall approximation is weak.');
  if(worst.FI>=1)warnings.push('At least one ply reaches a supplied maximum-stress allowable. This is a first-ply screening result.');
  return {L,airfoil,lams,section,stations,tip,worst,warnings,mass:section.massPerLength*L,reserve:worst.FI>1e-12?1/worst.FI:Infinity,root:stations[0]};
}

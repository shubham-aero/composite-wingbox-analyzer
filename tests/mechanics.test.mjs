import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,laminate,buildSection,analyse,distributed,loadAt,sectionStress,parseAirfoil,naca4} from '../dist/solver.mjs';
const near=(actual,expected,rtol=1e-8,atol=1e-10)=>assert.ok(Math.abs(actual-expected)<=atol+rtol*Math.abs(expected),`${actual} differs from ${expected}`);
const keys=['upper','lower','front','rear','caps'];
const iso={E1:70,E2:70,G12:70/2.6,nu12:.3,density:1600,Xt:800,Xc:800,Yt:800,Yc:800,S:400};
const plate={mirror:true,rows:[{angle:0,thickness:1,count:1}]};
const flat={upper:[{x:0,z:.05},{x:.25,z:.05},{x:.75,z:.05},{x:1,z:.05}],lower:[{x:0,z:-.05},{x:.25,z:-.05},{x:.75,z:-.05},{x:1,z:-.05}]};
const rect=()=>buildSection({chord:1,front:.2,rear:.8,capWidth:0},flat,Object.fromEntries(keys.map(k=>[k,laminate(plate,iso)])),1600);
function rectangleConfig(){const c=defaults();c.airfoil={kind:'coordinates',name:'Rectangle benchmark',text:'Rectangle\n1 .05\n.9 .05\n.7 .05\n.5 .05\n.2 .05\n.1 .05\n0 0\n.1 -.05\n.2 -.05\n.5 -.05\n.7 -.05\n.9 -.05\n1 -.05'};c.geometry={length:2,spanMode:'half',chord:1,front:.2,rear:.8,capWidth:0};c.material={...iso};c.layups=Object.fromEntries(keys.map(k=>[k,structuredClone(plate)]));c.loads={force:1000,shape:'uniform',x:.5,multiplier:1,selfWeight:false,torqueDensity:0,tipTorque:0,points:[]};return c;}
test('laminate isotropic and single-direction limits; A/B/D dimensions',()=>{
  const l=laminate({mirror:true,rows:[{angle:37,thickness:1,count:1}]},iso),t=.002;
  near(l.E,70e9);near(l.G,iso.G12*1e9);near(l.A[0][0],70e9/(1-.3**2)*t);near(l.D[0][0],70e9/(1-.3**2)*t**3/12);assert.ok(l.symmetric&&l.balanced);
  const ud=laminate(plate,defaults().material);near(ud.E,135e9);near(ud.G,5e9);
});
test('laminate mirror and balanced tests detect unsupported coupling',()=>{
  const m=defaults().material,s=defaults().layups.upper;assert.ok(laminate(s,m).symmetric&&laminate(s,m).balanced);
  assert.equal(laminate({...s,mirror:false},m).symmetric,false);
  assert.equal(laminate({mirror:true,rows:[{angle:45,thickness:.125,count:1}]},m).balanced,false);
  const c=defaults();c.layups.upper.mirror=false;assert.throws(()=>analyse(c),/unsymmetric/);
});
test('thin rectangular box exact bending rigidity, torsion and mass',()=>{
  const s=rect(),b=.6,h=.1,t=.002,E=70e9,G=iso.G12*1e9;
  near(s.EI,E*(2*b*t*(h/2)**2+2*t*h**3/12));near(s.GJ,4*(b*h)**2/(2*(b+h)/(G*t)));near(s.massPerLength,2*(b+h)*t*1600);near(s.xsc,.5);near(s.zsc,0);near(s.crossShearCompliance,0);
});
test('unit-shear flows close and balance forces for cambered capped wing',()=>{
  const r=analyse(defaults()),s=r.section;
  near(s.checks.closureResidual,0,1e-8,1e-10);near(s.checks.forceZ,1);near(s.checks.forceX,0);near(s.checks.forceHX,1);near(s.checks.forceHZ,0);
  near(s.panels.reduce((n,p)=>n+p.qavg*p.l/p.lam.shear,0),0,1e-8,1e-15);
});
test('uniform-load cantilever: bending and shear deflections',()=>{
  const c=rectangleConfig(),r=analyse(c),F=1000,L=2;
  near(r.root.V,F);near(r.root.M,F*L/2);near(r.tip.bend,F*L**3/(8*r.section.EI),3e-5);near(r.tip.shear,F*L*r.section.shearCompliance/2);near(r.tip.twist,0);near(r.tip.lateral,0);
});
test('point-load cantilever: arbitrary location, load jumps and free-end deflection',()=>{
  const c=rectangleConfig(),P=700,a=.731,L=2;c.loads.force=0;c.loads.points=[{y:a,force:P,x:.5}];const r=analyse(c);
  near(r.root.M,P*a);near(r.tip.bend,P*a*a*(3*L-a)/(6*r.section.EI),8e-5);near(r.tip.shear,P*a*r.section.shearCompliance);
  near(loadAt(c,r.section,L,a,'inboard').V,P);near(loadAt(c,r.section,L,a,'outboard').V,0);
  assert.ok(r.stations.some(s=>s.y===a));
});
test('tip load and torque match exact linear solutions',()=>{
  const c=rectangleConfig();c.loads.force=0;c.loads.points=[{y:2,force:1000,x:.5}];c.loads.tipTorque=200;const r=analyse(c);
  near(r.tip.bend,1000*2**3/(3*r.section.EI),3e-5);near(r.tip.twist,200*2/r.section.GJ);near(r.root.T,200);
});
test('pure torsion ply shear is T/(2 A t), with zero normal stress',()=>{
  const c=rectangleConfig();c.loads.force=0;c.loads.tipTorque=100;const r=analyse(c),stress=sectionStress(c,r.section,r.lams,r.root);
  const expected=100/(2*.6*.1*.002)/1e6;for(const p of stress.rows){near(p.s1,0);near(p.s2,0);near(Math.abs(p.t12),expected);}
});
test('upward bending compresses top fibres; factor scaling is linear',()=>{
  const c=rectangleConfig(),a=analyse(c),s=sectionStress(c,a.section,a.lams,a.root);
  assert.ok(s.rows.filter(p=>p.region==='upper').every(p=>p.s1<0));assert.ok(s.rows.filter(p=>p.region==='lower').every(p=>p.s1>0));
  c.loads.multiplier=2;const b=analyse(c);near(b.tip.deflection,2*a.tip.deflection);near(b.worst.FI,2*a.worst.FI);near(b.reserve,a.reserve/2);near(b.mass,a.mass);
});
test('load distributions integrate to prescribed force and first moment',()=>{
  const F=1200,L=3;for(const [shape,centroid]of [['uniform',L/2],['triangular',L/3],['elliptical',4*L/(3*Math.PI)]]){
    near(distributed(F,L,0,shape).V,F);near(distributed(F,L,0,shape).M,F*centroid);near(distributed(F,L,L,shape).M,0);
    const n=20000,dy=L/n;let force=0,moment=0;for(let i=0;i<n;i++){const y=(i+.5)*dy,q=distributed(F,L,y,shape).w;force+=q*dy;moment+=y*q*dy;}
    near(force,F,1e-6);near(moment,F*centroid,1e-6);
  }
});
test('self-weight scales with calculated box mass, not excluded airframe',()=>{
  const c=rectangleConfig();c.loads.force=0;c.loads.selfWeight=true;const r=analyse(c);near(r.root.V,-r.mass*9.80665);near(r.root.M,-r.mass*9.80665*r.L/2);assert.ok(r.tip.deflection<0);
});
test('full-span convention halves input length without halving half-wing force',()=>{
  const c=rectangleConfig(),a=analyse(c);c.geometry.spanMode='full';c.geometry.length=4;const b=analyse(c);near(b.L,a.L);near(b.tip.deflection,a.tip.deflection);near(b.mass,a.mass);near(b.root.V,a.root.V);
});
test('Selig and Lednicer airfoils agree after scale/translation normalization',()=>{
  const a=naca4('0012'),sel=[...a.upper.slice().reverse(),...a.lower.slice(1)],selText='NACA0012\n'+sel.map(p=>`${p.x*300+10},${p.z*300+22}`).join('\n');
  const ledText=`NACA0012\n${a.upper.length} ${a.lower.length}\n\n`+a.upper.map(p=>`${p.x} ${p.z}`).join('\n')+'\n\n'+a.lower.map(p=>`${p.x} ${p.z}`).join('\n');
  const s=parseAirfoil(selText),l=parseAirfoil(ledText);near(s.normalizedChord,300);near(s.upper[50].z,l.upper[50].z,1e-7);
  assert.throws(()=>parseAirfoil('bad input'),/coordinate pairs/);assert.throws(()=>naca4('2012'),/camber position/);
});
test('invalid inputs fail explicitly; zero load remains finite',()=>{
  const c=rectangleConfig();c.geometry.rear=c.geometry.front;assert.throws(()=>analyse(c),/rear spar/);
  const d=rectangleConfig();d.loads.points=[{y:2.1,force:1,x:.5}];assert.throws(()=>analyse(d),/Point 1/);
  const z=rectangleConfig();z.loads.force=0;const r=analyse(z);near(r.tip.deflection,0);near(r.worst.FI,0);assert.equal(r.reserve,Infinity);
});

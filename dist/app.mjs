import {defaults,analyse,laminate,sectionStress,loadAt,REGION_NAMES} from './solver.mjs';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(x,n=2)=>Number.isFinite(x)?x.toLocaleString('en-GB',{minimumFractionDigits:n,maximumFractionDigits:n}):'∞';
const cfg=defaults();let result=null,activeTab='geometry',activeRegion='upper',timer,inspection=null;
let yaw=-.36,pitch=.48,zoom=1,deformScale=5,drag=null;
const value=path=>path.split('.').reduce((o,k)=>o[k],cfg);
function setValue(path,v){const keys=path.split('.');let obj=cfg;for(const k of keys.slice(0,-1))obj=obj[k];obj[keys.at(-1)]=v;}
const option=(v,label,selected)=>`<option value="${esc(v)}"${v===selected?' selected':''}>${esc(label)}</option>`;
function field(label,path,{step='any',min,max,help='',text=false}={}){return `<div class="field"><label for="f-${path}">${label}</label><input id="f-${path}" data-bind="${path}" ${text?'data-text="true" type="text"':'type="number"'} value="${esc(value(path))}" step="${step}" ${min!==undefined?`min="${min}"`:''} ${max!==undefined?`max="${max}"`:''}>${help?`<p class="help">${help}</p>`:''}</div>`;}
function select(label,path,options,help=''){return `<div class="field"><label for="f-${path}">${label}</label><select id="f-${path}" data-bind="${path}" data-text="true">${options.map(([v,l])=>option(v,l,value(path))).join('')}</select>${help?`<p class="help">${help}</p>`:''}</div>`;}
const check=(label,path,help='')=>`<div class="inline-check"><input type="checkbox" id="f-${path}" data-bind="${path}" ${value(path)?'checked':''}><div><label for="f-${path}">${label}</label>${help?`<p class="help">${help}</p>`:''}</div></div>`;
function renderControls(){
  $('input-content').setAttribute('aria-labelledby','tab-'+activeTab);
  for(const b of document.querySelectorAll('[data-tab]')){b.setAttribute('aria-selected',String(b.dataset.tab===activeTab));b.tabIndex=b.dataset.tab===activeTab?0:-1;}
  let html='';
  if(activeTab==='geometry'){
    html=`<div class="section-label">Airfoil shape</div>${select('Input method','airfoil.kind',[['naca','NACA 4-digit'],['coordinates','Airfoil coordinates']])}`;
    if(cfg.airfoil.kind==='naca')html+=field('NACA designation','airfoil.code',{text:true,help:'For example 0012, 2412 or 4415. Closed trailing edge.'});
    else html+=`<div class="field"><label for="airfoil-text">x/c, y/c coordinates</label><textarea id="airfoil-text" placeholder="NACA 0012&#10;1.000 0.000&#10;0.950 0.008&#10;…" spellcheck="false">${esc(cfg.airfoil.text)}</textarea><p class="help">Selig (TE → LE → TE) or Lednicer upper/lower blocks. Coordinates are normalized by their chord.</p><label class="file-label">Import .dat / .txt / .csv<input type="file" id="airfoil-file" accept=".dat,.txt,.csv,text/plain"></label><p class="help">${esc(cfg.airfoil.name==='NACA 2412'?'No coordinate file loaded':cfg.airfoil.name)}</p></div>`;
    html+=`<div class="section-label">Straight wing</div>${select('Length convention','geometry.spanMode',[['half','Root-to-tip half-span'],['full','Full tip-to-tip span']])}<div class="field-row">${field('Wing length (m)','geometry.length',{min:.05,step:.1})}${field('Chord (m)','geometry.chord',{min:.02,step:.01})}</div><div class="section-label">Wing-box layout</div><div class="field-row">${field('Front spar (x/c)','geometry.front',{min:.02,max:.85,step:.01})}${field('Rear spar (x/c)','geometry.rear',{min:.1,max:.98,step:.01})}</div>${field('Width of each cap (m)','geometry.capWidth',{min:0,step:.005,help:'Four identical axial caps, one at each box corner. Set zero to omit. Width must be ≤ half the spar spacing.'})}<div class="input-callout">Constant section and layup along the span. The root is clamped; the tip is free.</div>`;
  }else if(activeTab==='layup'){
    const spec=cfg.layups[activeRegion];
    html=`<div class="field"><label for="layup-region">Structural component</label><select id="layup-region">${Object.entries(REGION_NAMES).map(([k,v])=>option(k,v,activeRegion)).join('')}</select></div><p class="help">Enter plies from outside to inside. Repeats expand before mirroring. All use the material in the Material tab.</p><div class="layup-header"><span>Angle (°)</span><span>t (mm)</span><span>Repeat</span><span></span></div>${spec.rows.map((r,i)=>`<div class="ply-input-row"><input type="number" data-ply="${i}" data-prop="angle" aria-label="Ply row ${i+1} angle in degrees" value="${r.angle}" min="-180" max="180" step="15"><input type="number" data-ply="${i}" data-prop="thickness" aria-label="Ply row ${i+1} thickness in millimetres" value="${r.thickness}" min="0.001" max="5" step="0.025"><input type="number" data-ply="${i}" data-prop="count" aria-label="Ply row ${i+1} repeat count" value="${r.count}" min="1" max="100" step="1"><button class="remove" data-remove-ply="${i}" aria-label="Remove ply row ${i+1}" ${spec.rows.length===1?'disabled':''}>×</button></div>`).join('')}<button id="add-ply" class="button small">+ Add ply row</button><div class="inline-check"><input type="checkbox" id="mirror-stack" ${spec.mirror?'checked':''}><label for="mirror-stack">Mirror stack about the midplane</label></div><p class="help">[0, +45, −45, 90] mirrored becomes an eight-ply symmetric laminate.</p><div id="laminate-summary"></div><div class="input-callout">Use symmetric, balanced layups. Match +θ and −θ total thickness; 0° and 90° plies need no angle partner.</div><button id="copy-skin" class="button small">Copy this stack to other box walls</button><p class="help">Copies to upper/lower skins and both webs. Cap layup stays independent.</p>`;
  }else if(activeTab==='material'){
    html=`<div class="input-callout">Illustrative unidirectional carbon/epoxy. Replace these values with your laminate supplier’s properties and design allowables.</div><div class="section-label">Elastic lamina properties</div><div class="field-row">${field('E₁ (GPa)','material.E1',{min:.01,step:1})}${field('E₂ (GPa)','material.E2',{min:.01,step:1})}</div><div class="field-row">${field('G₁₂ (GPa)','material.G12',{min:.01,step:.1})}${field('Poisson ratio ν₁₂','material.nu12',{min:-.9,max:.9,step:.01})}</div>${field('Density (kg/m³)','material.density',{min:10,step:10})}<div class="section-label">In-plane strength allowables</div><div class="field-row">${field('X tensile (MPa)','material.Xt',{min:.01,step:10})}${field('X compressive (MPa)','material.Xc',{min:.01,step:10})}</div><div class="field-row">${field('Y tensile (MPa)','material.Yt',{min:.01,step:5})}${field('Y compressive (MPa)','material.Yc',{min:.01,step:5})}</div>${field('Shear S (MPa)','material.S',{min:.01,step:5,help:'Strengths are entered as positive magnitudes. X is along the fibre; Y is transverse to the fibre.'})}`;
  }else{
    const L=cfg.geometry.length/(cfg.geometry.spanMode==='full'?2:1);
    html=`<div class="input-callout">Enter loads on <strong>one ${fmt(L,2)} m half-wing</strong>. Positive forces act upwards. These are prescribed structural loads.</div><div class="section-label">Distributed load</div>${field('Total distributed force (N)','loads.force',{step:100,help:'Integral of the distribution over one half-wing, before the load multiplier.'})}${select('Spanwise distribution','loads.shape',[['elliptical','Elliptical'],['uniform','Uniform'],['triangular','Triangular: root to zero at tip']])}<div class="field-row">${field('Force line (x/c)','loads.x',{min:0,max:1,step:.01})}${field('Load multiplier','loads.multiplier',{min:.01,step:.1})}</div>${check('Include wing-box self-weight','loads.selfWeight','Applied downward at the material centroid. No mass from excluded components is included.')}<div class="section-label">Applied torque</div>${field('Torque per span (N·m/m)','loads.torqueDensity',{step:5})}${field('Additional tip torque (N·m)','loads.tipTorque',{step:5,help:'Positive torque raises the trailing edge. Both are in addition to force eccentricity.'})}<div class="section-label">Point loads</div>${cfg.loads.points.map((p,i)=>`<div class="point-card"><div class="point-title">Point load ${i+1}<button data-remove-point="${i}" class="remove" aria-label="Remove point load ${i+1}">×</button></div>${field('Vertical force (N)',`loads.points.${i}.force`,{step:50})}<div class="field-row">${field('Root distance (m)',`loads.points.${i}.y`,{min:0,max:L,step:.1})}${field('Position (x/c)',`loads.points.${i}.x`,{min:0,max:1,step:.01})}</div></div>`).join('')}<button id="add-point" class="button small">+ Add point load</button><p class="help">Use a negative force for payload or equipment weight. Root distance must be within the half-span.</p>`;
  }
  $('input-content').innerHTML=html;renderLaminateSummary();
}
function renderLaminateSummary(){if(!$('laminate-summary'))return;try{const l=laminate(cfg.layups[activeRegion],cfg.material);$('laminate-summary').innerHTML=`<div class="laminate-summary"><strong>${l.plies.length} plies · ${fmt(l.t*1000,3)} mm</strong><p>${l.symmetric?'Symmetric':'Unsymmetric'} · ${l.balanced?'Balanced':'Coupled'} · E<sub>span</sub> ${fmt(l.E/1e9,1)} GPa</p><div class="stack-strip" aria-label="Physical ply stack">${l.plies.map(p=>`<i title="Ply ${p.index}: ${p.angle}°, ${fmt(p.t*1000,3)} mm" style="background:${Math.abs(p.angle)<.1?'#15515b':Math.abs(Math.abs(p.angle)-90)<.1?'#94a8ac':p.angle>0?'#10a396':'#c58a48'}"></i>`).join('')}</div><div class="stack-legend">0° dark teal · +θ green · −θ amber · 90° grey</div></div>`;}catch(e){$('laminate-summary').innerHTML=`<p class="help">${esc(e.message)}</p>`;}}
function schedule(){clearTimeout(timer);$('input-state').textContent='Updating…';$('export-results').disabled=true;timer=setTimeout(recalculate,250);}
function recalculate(){
  try{
    result=analyse(cfg);$('error').hidden=true;document.querySelector('.results').classList.remove('result-invalid');$('export-results').disabled=false;$('input-state').textContent='Live calculation';
    renderResults();
  }catch(e){result=null;inspection=null;$('error').hidden=false;$('error').innerHTML=`<strong>Calculation paused</strong>${esc(e.message)}`;document.querySelector('.results').classList.add('result-invalid');$('export-results').disabled=true;$('input-state').textContent='Check inputs';
    $('metrics').innerHTML=['Wing-box mass','Tip deflection','Tip twist','Maximum-stress index'].map(t=>`<div class="metric"><div class="metric-label">${t}</div><div class="metric-value">–</div><div class="metric-foot">Awaiting valid inputs</div></div>`).join('');
    for(const id of ['response-chart','load-chart','section-viz','section-values','ply-rows','critical-line','station-loads','warnings','matrices'])$(id).innerHTML='';drawWing();
  }
  renderLaminateSummary();
}
function renderResults(){
  const r=result;
  $('metrics').innerHTML=`<div class="metric"><div class="metric-label">Wing-box mass</div><div class="metric-value">${fmt(r.mass)}<span>kg</span></div><div class="metric-foot">One ${fmt(r.L,1)} m half-wing</div></div><div class="metric featured"><div class="metric-label">Tip vertical deflection</div><div class="metric-value">${fmt(r.tip.deflection*1000,1)}<span>mm</span></div><div class="metric-foot">${fmt(r.tip.deflection/r.L*100,2)}% of half-span</div></div><div class="metric"><div class="metric-label">Tip twist</div><div class="metric-value">${fmt(r.tip.twist*180/Math.PI,3)}<span>°</span></div><div class="metric-foot">About the shear centre</div></div><div class="metric ${r.worst.FI>=1?'alert':''}"><div class="metric-label">Maximum-stress index</div><div class="metric-value">${fmt(r.worst.FI,3)}</div><div class="metric-foot">${r.worst.FI>=1?'Allowable reached':r.worst.FI===0?'No load':'Proportional reserve '+fmt(r.reserve,2)+'×'}</div></div>`;
  $('wing-caption').textContent=`${r.airfoil.name} · ${fmt(cfg.geometry.chord,2)} m chord · ${fmt(r.L,2)} m half-span`;
  $('section-values').innerHTML=[['Spar spacing',`${fmt((cfg.geometry.rear-cfg.geometry.front)*cfg.geometry.chord*1000,0)} mm`],['Shear centre',`${fmt(r.section.xsc/cfg.geometry.chord*100,1)}% chord`],['Bending rigidity EI',`${fmt(r.section.EI/1000,2)} kN·m²`],['Torsional rigidity GJ',`${fmt(r.section.GJ/1000,2)} kN·m²`],['Root bending moment',`${fmt(r.root.M/1000,3)} kN·m`],['Root shear force',`${fmt(r.root.V,1)} N`]].map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('');
  const w=r.worst;$('critical-line').className='critical-line'+(w.FI>=1?' fail':'');$('critical-line').innerHTML=w.FI>0?`Global peak: <strong>${esc(REGION_NAMES[w.region])}, ply ${w.ply} (${w.angle}°)</strong> · ${esc(w.mode)} · y = ${fmt(w.y,3)} m${w.side==='outboard'?' (outboard side)':''} · index ${fmt(w.FI,3)}`:'No applied load: all calculated in-plane ply stresses are zero.';
  $('warnings').innerHTML=r.warnings.map(w=>`<div class="warning">${esc(w)}</div>`).join('');
  renderInspection();renderCharts();renderMatrices();drawWing();
}
function currentY(){return result?Number($('station').value)/100*result.L:0;}
function renderInspection(){if(!result)return;const y=currentY(),l=loadAt(cfg,result.section,result.L,y);inspection=sectionStress(cfg,result.section,result.lams,l,true);$('station-value').value=fmt(y,3)+' m';$('station-loads').textContent=`M ${fmt(l.M/1000,3)} kN·m · V ${fmt(l.V,1)} N · T ${fmt(l.T,1)} N·m`;
  const rows=inspection.rows.filter(p=>p.region===$('stress-region').value);
  $('ply-rows').innerHTML=rows.length?rows.map(p=>`<tr><td>${p.ply}</td><td>${p.angle}°</td><td>${fmt(p.s1,2)}</td><td>${fmt(p.s2,2)}</td><td>${fmt(p.t12,2)}</td><td class="${p.FI>=1?'high':''}">${fmt(p.FI,3)}</td><td>${esc(p.FI===0?'No load':p.mode)}</td></tr>`).join(''):'<tr><td colspan="7">No caps in this model. Set a nonzero cap width to include them.</td></tr>';
  drawSection();
}
function renderMatrices(){if(!result)return;const l=result.lams[$('matrix-region').value];$('matrices').innerHTML=`<div class="matrix-grid">${[['A','N/m'],['B','N'],['D','N·m']].map(([k,unit])=>`<div class="matrix"><strong>${k} [${unit}]</strong><pre>${l[k].map(row=>row.map(x=>(Math.abs(x)<1e-7?0:x).toExponential(3).padStart(11)).join(' ')).join('\n')}</pre></div>`).join('')}</div>`;}
function drawSection(){if(!result)return;const {section:s,airfoil:a}=result,c=cfg.geometry.chord;
  const heights=[...a.upper,...a.lower].map(p=>p.z*c),zmin=Math.min(...heights),zmax=Math.max(...heights),scale=Math.min(370/c,85/(zmax-zmin)),X=x=>220+(x-c/2)*scale,Z=z=>70-(z-(zmax+zmin)/2)*scale;
  const path=points=>points.map((p,i)=>`${i?'L':'M'}${X(p.x).toFixed(2)},${Z(p.z).toFixed(2)}`).join(' ');
  const outer=[...a.upper.slice().reverse(),...a.lower].map(p=>({x:p.x*c,z:p.z*c}));
  let svg=`<svg viewBox="0 0 440 170" role="img" aria-label="Airfoil with a closed box between ${cfg.geometry.front*100}% and ${cfg.geometry.rear*100}% chord"><path d="${path(outer)} Z" fill="#f3f6f7" stroke="#9cb0b7" stroke-dasharray="4 3"/><path d="${path(s.panels.map(p=>p.p))} Z" fill="#d3efeb" stroke="#087f87" stroke-width="2"/>`;
  if(inspection)for(const w of inspection.walls)if(w.FI>=1)svg+=`<path d="${path([w.p,w.end])}" stroke="#bc4534" stroke-width="3"/>`;
  for(let i=0;i<s.booms.length;i++){const b=s.booms[i],dir=(i===0||i===3)?1:-1;svg+=`<line x1="${X(b.x)}" y1="${Z(b.z)}" x2="${X(b.x+dir*cfg.geometry.capWidth)}" y2="${Z(b.z)}" stroke="#bf7b33" stroke-width="4"/>`;}
  const sx=X(s.xsc),sz=Z(s.zsc);svg+=`<path d="M${sx-4},${sz-4} L${sx+4},${sz+4} M${sx-4},${sz+4} L${sx+4},${sz-4}" stroke="#203f48" stroke-width="1.5"/>`;
  for(const [i,label]of [[0,'Front'],[1,'Rear']]){const x=s.corners[i].x;svg+=`<path d="M${X(x)},${Z(s.corners[i===0?3:2].z)+7} V131" stroke="#afc1c6"/><text x="${X(x)}" y="146" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="12" fill="#5b7881">${label} ${fmt(x/c*100,0)}%</text>`;}
  svg+=`<text x="${X(0)}" y="123" font-family="DM Sans, sans-serif" font-size="12" fill="#80949c">LE</text><text x="${X(c)}" y="123" text-anchor="end" font-family="DM Sans, sans-serif" font-size="12" fill="#80949c">TE</text></svg>`;
  $('section-viz').innerHTML=svg;
}
function interpStation(y,key){const a=result.stations;let i=a.findIndex(s=>s.y>=y);if(i<=0)return a[0][key];const t=(y-a[i-1].y)/(a[i].y-a[i-1].y);return a[i-1][key]+t*(a[i][key]-a[i-1][key]);}
const quantities={deflection:['Vertical deflection','mm',1000],lateral:['Chordwise deflection','mm',1000],twist:['Twist','deg',180/Math.PI],FI:['Maximum-stress index','–',1],M:['Bending moment','kN·m',.001],V:['Shear force','N',1],T:['Torque','N·m',1],w:['Distributed force','N/m',1]};
function renderChart(id,key,color){
  if(!result)return;const [name,unit,mult]=quantities[key],W=560,H=235,pad={l:60,r:18,t:36,b:40},pw=W-pad.l-pad.r,ph=H-pad.t-pad.b;
  const data=[];for(const s of result.stations){data.push({y:s.y,v:s[key]*mult});if(['V','T','FI'].includes(key)&&cfg.loads.points.some(p=>Math.abs(s.y-p.y)<1e-9)){data.push({y:s.y,v:(key==='FI'?s.FIout:loadAt(cfg,result.section,result.L,s.y,'outboard')[key])*mult});}}
  let lo=Math.min(0,...data.map(d=>d.v)),hi=Math.max(0,...data.map(d=>d.v));if(hi-lo<1e-10){lo=-1;hi=1;}const margin=(hi-lo)*.12;hi+=margin;if(lo<0)lo-=margin;
  const X=y=>pad.l+y/result.L*pw,Y=v=>pad.t+(hi-v)/(hi-lo)*ph;
  let svg=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${name} along the half-span, in ${unit}"><text x="${pad.l}" y="20">${unit}</text>`;
  for(let i=0;i<=4;i++){const v=lo+(hi-lo)*i/4,dec=Math.abs(hi-lo)<1?3:Math.abs(hi-lo)<10?2:Math.abs(hi-lo)<100?1:0;svg+=`<line x1="${pad.l}" x2="${W-pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#e8eef0"/><text x="${pad.l-8}" y="${Y(v)+4}" text-anchor="end">${fmt(v,dec)}</text>`;}
  for(let i=0;i<=4;i++){const y=result.L*i/4;svg+=`<text x="${X(y)}" y="${H-21}" text-anchor="middle">${fmt(y,2)}</text>`;}
  svg+=`<text x="${pad.l+pw/2}" y="${H-3}" text-anchor="middle">Distance from root (m)</text>`;
  const line=data.map((p,i)=>`${i?'L':'M'}${X(p.y).toFixed(2)},${Y(p.v).toFixed(2)}`).join(' ');
  svg+=`<path d="${line} L${X(result.L)},${Y(0)} L${X(0)},${Y(0)} Z" fill="${color}" opacity=".08"/><path d="${line}" stroke="${color}" stroke-width="2.3" fill="none" stroke-linejoin="round"/>`;
  if(key==='FI'&&hi>1)svg+=`<line x1="${pad.l}" x2="${W-pad.r}" y1="${Y(1)}" y2="${Y(1)}" stroke="#b84d36" stroke-dasharray="5 4"/><text x="${W-pad.r}" y="${Y(1)-5}" text-anchor="end">Allowable index 1</text>`;
  const y=currentY(),isLoad=['M','V','T','w'].includes(key);const v=(isLoad?loadAt(cfg,result.section,result.L,y)[key]:key==='FI'?inspection.worst.FI:interpStation(y,key))*mult;
  svg+=`<line x1="${X(y)}" x2="${X(y)}" y1="${pad.t}" y2="${H-pad.b}" stroke="#90a6ad" stroke-dasharray="3 4"/><circle cx="${X(y)}" cy="${Y(v)}" r="4" fill="${color}" stroke="white" stroke-width="2"/><text class="chart-value" x="${W-pad.r}" y="20" text-anchor="end">${fmt(v,Math.abs(v)<10?3:1)} ${unit==='–'?'':unit} at ${fmt(y,2)} m</text></svg>`;
  $(id).innerHTML=svg;
}
function renderCharts(){if(!result)return;renderChart('response-chart',$('response-choice').value,'#07858b');renderChart('load-chart',$('load-choice').value,'#b47a37');}
function drawWing(){
  const canvas=$('wing-canvas'),box=canvas.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2),W=box.width,H=box.height;if(W===0||H===0)return;
  canvas.width=W*dpr;canvas.height=H*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);if(!result)return;
  const r=result,s=r.section,c=cfg.geometry.chord,L=r.L;
  const raw=(x,y,z)=>{const a=y-L/2,b=x-c/2,xx=a*Math.cos(yaw)+b*Math.sin(yaw),depth=-a*Math.sin(yaw)+b*Math.cos(yaw);return {x:xx,y:z*Math.cos(pitch)+depth*Math.sin(pitch),depth:depth*Math.cos(pitch)-z*Math.sin(pitch)};};
  const transform=(p,y,def)=>{const tw=def?interpStation(y,'twist')*deformScale:0,w=def?interpStation(y,'deflection')*deformScale:0,v=def?interpStation(y,'lateral')*deformScale:0;const dx=p.x-s.xsc,dz=p.z-s.zsc;return raw(s.xsc+dx*Math.cos(tw)-dz*Math.sin(tw)+v,y,s.zsc+dx*Math.sin(tw)+dz*Math.cos(tw)+w);};
  const bounds=[];for(const y of [0,L/2,L])for(const p of [{x:0,z:-c*.12},{x:c,z:c*.12}]){bounds.push(transform(p,y,false));bounds.push(transform(p,y,true));}
  const minX=Math.min(...bounds.map(p=>p.x)),maxX=Math.max(...bounds.map(p=>p.x)),minY=Math.min(...bounds.map(p=>p.y)),maxY=Math.max(...bounds.map(p=>p.y));
  const scale=Math.min((W-85)/(maxX-minX),(H-85)/(maxY-minY))*zoom,midX=(minX+maxX)/2,midY=(minY+maxY)/2;
  const screen=p=>({x:W/2+(p.x-midX)*scale,y:H/2+4-(p.y-midY)*scale,depth:p.depth});
  const proj=(p,y,def=true)=>screen(transform(p,y,def));
  function stroke(points,color,width=1,dash=[],close=false){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
  const loops=[];for(let i=0;i<s.panels.length;i++){const p=s.panels[i];if((p.region==='upper'||p.region==='lower')?i%8===0:(i===64||i===152))loops.push({p:p.p,region:p.region});}
  const original0=loops.map(p=>proj(p.p,0,false)),original1=loops.map(p=>proj(p.p,L,false));stroke(original0,'#96afb8',1,[4,4],true);stroke(original1,'#96afb8',1,[4,4],true);for(const p of s.corners)stroke([proj(p,0,false),proj(p,L,false)],'#91aab2',1,[4,4]);
  const faces=[];for(let j=0;j<14;j++)for(let i=0;i<loops.length;i++){const y0=L*j/14,y1=L*(j+1)/14,a=loops[i],b=loops[(i+1)%loops.length];const pts=[proj(a.p,y0),proj(b.p,y0),proj(b.p,y1),proj(a.p,y1)];faces.push({pts,depth:pts.reduce((n,p)=>n+p.depth,0)/4,region:a.region});}
  faces.sort((a,b)=>b.depth-a.depth);for(const f of faces){ctx.beginPath();f.pts.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=f.region==='upper'?'rgba(18,149,148,.51)':f.region==='lower'?'rgba(44,132,142,.38)':'rgba(18,83,102,.58)';ctx.fill();ctx.lineWidth=.4;ctx.strokeStyle='rgba(29,115,127,.19)';ctx.stroke();}
  for(const y of [0,L])stroke(loops.map(p=>proj(p.p,y)),'#08717a',1.3,[],true);
  for(const b of s.booms)stroke(Array.from({length:25},(_,i)=>proj(b,L*i/24)),'#b18440',1.7);
  const outline=[...r.airfoil.upper.slice().reverse(),...r.airfoil.lower].filter((_,i)=>i%4===0).map(p=>({x:p.x*c,z:p.z*c}));
  for(const y of [0,L])stroke(outline.map(p=>proj(p,y)),'#688e9a',1,[3,3],true);
  const root=proj({x:c*.43,z:0},0,false),tip=proj({x:c*.43,z:0},L,true);
  ctx.font='12px "DM Sans",sans-serif';ctx.fillStyle='#436b78';ctx.textAlign='center';ctx.fillText('Fixed root',Math.max(40,Math.min(W-40,root.x)),Math.min(H-18,root.y+32));ctx.fillText('Free tip',Math.max(40,Math.min(W-40,tip.x)),Math.max(30,tip.y-22));
  stroke([proj(s.corners[0],0),proj(s.corners[1],0)],'#1e4958',3.5);
}
function showToast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,3200);}
function exportResults(){if(!result)return;const r=result,lines=[],csv=row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',');
  lines.push(['Composite WingBox Analyzer','Preliminary linear wing-box sizing'],['Scope','One half-wing; box walls and caps only'],['Excluded','Buckling, joints, ribs, outer fairings, local pressure bending, damage and aeroelasticity'],['Airfoil',r.airfoil.name],['Half-span (m)',r.L],['Chord (m)',cfg.geometry.chord],['Front spar x/c',cfg.geometry.front],['Rear spar x/c',cfg.geometry.rear],['Each cap width (m)',cfg.geometry.capWidth],['Box mass (kg)',r.mass],['EI (N m2)',r.section.EI],['GJ (N m2)',r.section.GJ],['Shear centre x (m)',r.section.xsc],['Global maximum-stress index',r.worst.FI],['Global peak component',REGION_NAMES[r.worst.region]],['Global peak physical ply',r.worst.ply],['Global peak y (m)',r.worst.y],['Proportional reserve',r.reserve],['Tip deflection (m)',r.tip.deflection],['Tip twist (rad)',r.tip.twist],[],['Input configuration (JSON)',JSON.stringify(cfg)],[],['y (m)','Distributed force (N/m)','V (N)','M (N m)','T about SC (N m)','Vertical deflection (m)','Bending contribution (m)','Shear contribution (m)','Chordwise deflection (m)','Twist (rad)','Maximum-stress index']);
  for(const p of r.stations)lines.push([p.y,p.w,p.V,p.M,p.T,p.deflection,p.bend,p.shear,p.lateral,p.twist,p.FI]);
  lines.push([],['Inspected span station (m)',currentY()],['Component','Ply','Angle (deg)','sigma1 (MPa)','sigma2 (MPa)','tau12 (MPa)','Index','Mode','x (m)','z (m)']);for(const p of inspection.rows)lines.push([REGION_NAMES[p.region],p.ply,p.angle,p.s1,p.s2,p.t12,p.FI,p.mode,p.x,p.z]);
  lines.push([],['Warning','Illustrative material defaults require replacement with verified properties and allowables.'],...r.warnings.map(w=>['Warning',w]));
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.map(csv).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='composite-wingbox-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Results exported with inputs and assumptions.');
}
document.addEventListener('input',e=>{
  const t=e.target;if(t.matches('[data-bind]')){setValue(t.dataset.bind,t.type==='checkbox'?t.checked:t.dataset.text!==undefined?t.value:t.value===''?NaN:Number(t.value));if(t.dataset.bind==='airfoil.kind'||t.dataset.bind==='geometry.spanMode')renderControls();schedule();}
  if(t.matches('[data-ply]')){cfg.layups[activeRegion].rows[Number(t.dataset.ply)][t.dataset.prop]=t.value===''?NaN:Number(t.value);schedule();}
  if(t.id==='mirror-stack'){cfg.layups[activeRegion].mirror=t.checked;schedule();}
  if(t.id==='airfoil-text'){cfg.airfoil.text=t.value;cfg.airfoil.name='Pasted coordinates';schedule();}
  if(t.id==='station'){renderInspection();renderCharts();}
  if(t.id==='deform-scale'){deformScale=Number(t.value);$('scale-value').value=deformScale+'×';drawWing();}
});
document.addEventListener('change',async e=>{
  const t=e.target;if(t.id==='layup-region'){activeRegion=t.value;renderControls();}
  if(t.id==='airfoil-file'&&t.files[0]){const f=t.files[0];if(f.size>1000000){showToast('Choose a coordinate file under 1 MB.');return;}cfg.airfoil.text=await f.text();cfg.airfoil.name=f.name;renderControls();recalculate();}
  if(t.id==='response-choice'||t.id==='load-choice')renderCharts();if(t.id==='stress-region')renderInspection();if(t.id==='matrix-region')renderMatrices();
});
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.tab){activeTab=t.dataset.tab;renderControls();}
  if(t.id==='add-ply'){cfg.layups[activeRegion].rows.push({angle:0,thickness:.125,count:1});renderControls();schedule();}
  if(t.dataset.removePly!==undefined){cfg.layups[activeRegion].rows.splice(Number(t.dataset.removePly),1);renderControls();schedule();}
  if(t.id==='copy-skin'){for(const k of ['upper','lower','front','rear'])if(k!==activeRegion)cfg.layups[k]=structuredClone(cfg.layups[activeRegion]);schedule();showToast('Stack copied to upper/lower skins and both webs.');}
  if(t.id==='add-point'){cfg.loads.points.push({y:cfg.geometry.length/(cfg.geometry.spanMode==='full'?2:1)/2,force:-100,x:.4});renderControls();schedule();}
  if(t.dataset.removePoint!==undefined){cfg.loads.points.splice(Number(t.dataset.removePoint),1);renderControls();schedule();}
  if(t.id==='reset-view'){yaw=-.36;pitch=.48;zoom=1;drawWing();}if(t.id==='export-results')exportResults();
});
document.querySelector('.input-tabs').addEventListener('keydown',e=>{if(!['ArrowRight','ArrowLeft','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['geometry','layup','material','loads'],i=tabs.indexOf(activeTab);activeTab=e.key==='Home'?tabs[0]:e.key==='End'?tabs[3]:tabs[(i+(e.key==='ArrowRight'?1:3))%4];renderControls();$('tab-'+activeTab).focus();});
for(const id of ['response-chart','load-chart'])$(id).addEventListener('pointerdown',e=>{if(!result)return;const box=e.currentTarget.getBoundingClientRect(),p=Math.max(0,Math.min(100,((e.clientX-box.left)/box.width*560-60)/(560-60-18)*100));$('station').value=p;renderInspection();renderCharts();});
const canvas=$('wing-canvas');canvas.tabIndex=0;canvas.setAttribute('aria-label','Wing geometry. Drag to rotate, scroll to zoom, or use arrow keys to rotate.');
canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag.x)*.009;pitch=Math.max(-1.2,Math.min(1.2,pitch+(e.clientY-drag.y)*.008));drag={x:e.clientX,y:e.clientY};drawWing();});
canvas.addEventListener('pointerup',()=>drag=null);canvas.addEventListener('pointercancel',()=>drag=null);
canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.55,Math.min(2.5,zoom*Math.exp(-e.deltaY*.001)));drawWing();},{passive:false});
canvas.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw-=.12;if(e.key==='ArrowRight')yaw+=.12;if(e.key==='ArrowUp')pitch=Math.min(1.2,pitch+.1);if(e.key==='ArrowDown')pitch=Math.max(-1.2,pitch-.1);drawWing();});
new ResizeObserver(()=>drawWing()).observe(canvas.parentElement);
renderControls();recalculate();

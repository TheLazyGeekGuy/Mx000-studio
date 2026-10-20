// Offline tests for the M2000 side of the TC M-series editor: generic machinery on a fixture map (exact bytes),
// then invariants on the shipped map built from docs/instruments/tc-m2000/. No MIDI.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdirSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import path from 'node:path'

const out=path.resolve('output/test-tc-m2000');mkdirSync(out,{recursive:true})
execFileSync(process.execPath,['scripts/build-tc-m2000-map.mjs','--check'],{stdio:'pipe'})
const entry=`export * from './src/editors/tc-m3000/m2000-model';export * from './src/editors/tc-m3000/m2000-format';export * from './src/editors/tc-m3000/conversion';export * from './src/editors/tc-m3000/workspace';export {m3000Module} from './src/editors/tc-m3000/module';export {m2000Map} from './src/editors/tc-m3000/m2000-map';export {initialValues as m3000InitialValues,paramsFor as paramsForM3000} from './src/editors/tc-m3000/model'`
async function load(name,map){
 const redirect=map?{name:'fixture-map',setup(b){b.onResolve({filter:/^\.\/m2000-map$/},()=>({path:map}))}}:null
 const r=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',metafile:true,plugins:redirect?[redirect]:[]})
 assert.ok(!Object.keys(r.metafile.inputs).some(p=>p.endsWith('.tsx')||p.includes('node_modules')),'Headless code imported a view or a dependency')
 const file=path.join(out,name);writeFileSync(file,r.outputFiles[0].text);return import(pathToFileURL(file).href)
}
const lease=()=>({open(){},release(){releases++},send(){sends++},get state(){return 'idle'}});let sends=0,releases=0

// ---------- A. Fixture: exact behaviour of the generic M2000 machinery ----------
const fixtureDir=path.resolve('scripts/fixtures/tc-m2000'),fixtureMap=path.join(out,'m2000-map.fixture.ts')
execFileSync(process.execPath,['scripts/build-tc-m2000-map.mjs'],{stdio:'pipe',env:{...process.env,TC_M2000_DATA:path.join(fixtureDir,'parameters.json'),TC_M2000_MAPPING:path.join(fixtureDir,'mapping.json'),TC_M2000_TARGET:fixtureMap}})
const f=await load('fixture.mjs',fixtureMap)
const reverb=f.m2000Algorithm('fixture-reverb'),P=k=>reverb.params.find(p=>p.key===k)
assert.deepEqual(reverb.params.map(p=>[p.key,p.cc,p.domain.kind,p.domain.max]),[['mix',10,'steps',100],['out',11,'steps',100],['decay',12,'steps',199],['type',13,'list',2],['diffuse',14,'cc',127],['hidden',null,'steps',10],['level',null,'cc',127],['freq',null,'cc',127]],'Action line (Expert mode) is not a parameter')
const d=f.defaultM2000State();assert.equal(d.engines[0].algorithm,'fixture-reverb');assert.equal(d.engines[1].algorithm,'fixture-delay')
assert.deepEqual(d.engines[0].values,{mix:0,out:100,decay:0,type:0,diffuse:0,hidden:0,level:64,freq:0},'Initial step nearest 0 in display units')
assert.deepEqual(f.validateM2000State(structuredClone(d)),d)
assert.equal(f.formatM2000(P('decay'),24),'2,5 s');assert.equal(f.formatM2000(P('decay'),24,'en'),'2.5 s');assert.equal(f.formatM2000(P('out'),88),'-12 dB')
assert.equal(f.formatM2000(P('type'),1),'B');assert.equal(f.formatM2000(P('diffuse'),64),'64');assert.ok(f.isRawCc(P('diffuse')))
assert.equal(f.parseM2000Entry(P('decay'),'2,5 s'),24);assert.equal(f.parseM2000Entry(P('decay'),'2.5'),24);assert.throws(()=>f.parseM2000Entry(P('decay'),'2,55'),/Pas de/)
assert.throws(()=>f.parseM2000Entry(P('decay'),'2 dB'),/Unité/);assert.equal(f.parseM2000Entry(P('type'),'c'),2);assert.throws(()=>f.parseM2000Entry(P('diffuse'),'128'),/domaine/)
assert.deepEqual([0,100,199].map(s=>f.ccValue(P('decay'),s)),[0,64,127]);assert.deepEqual([0,1,2].map(s=>f.ccValue(P('type'),s)),[0,64,127]);assert.equal(f.ccValue(P('diffuse'),77),77)
assert.ok(f.ccApproximate(P('decay'))&&!f.ccApproximate(P('mix')))
// Raw controller values with printed ends (M2K-CC: "scaled to parameter values"): ends exact, linear units approximate.
assert.deepEqual([0,64,127].map(v=>f.formatM2000(P('level'),v)),['-12 dB','≈ 0,1 dB','12 dB']);assert.deepEqual([0,64,127].map(v=>f.formatM2000(P('freq'),v)),['20 Hz','64','20\u202f000 Hz'],'No interpolation in Hz')
assert.equal(f.parseM2000Entry(P('level'),'0 dB'),64);assert.equal(f.parseM2000Entry(P('level'),'≈ 0,1 dB'),64);assert.equal(f.parseM2000Entry(P('level'),'cc 10'),10);assert.throws(()=>f.parseM2000Entry(P('level'),'13'),/domaine/)
assert.equal(f.parseM2000Entry(P('freq'),'20 Hz'),0);assert.equal(f.parseM2000Entry(P('freq'),'64'),64);assert.ok(f.isAssumedScale(P('level'))&&f.isRawCc(P('freq'))&&!f.isAssumedScale(P('freq')))
const delayOut=f.m2000Algorithm('fixture-delay').params.find(p=>p.key==='out');assert.deepEqual([0,64,127].map(v=>f.formatM2000(delayOut,v)),['off','64','0 dB']);assert.equal(f.parseM2000Entry(delayOut,'off'),0)
assert.throws(()=>f.validateM2000State({...d,engines:[{...d.engines[0],values:{...d.engines[0].values,decay:200}},d.engines[1]]}),/hors domaine/)
assert.throws(()=>f.validateM2000State({...d,engines:[{algorithm:'nope',values:{}},d.engines[1]]}),/inconnu/)
assert.throws(()=>f.validateM2000State({...d,engines:[{...d.engines[0],values:{...d.engines[0].values,extra:1}},d.engines[1]]}),/incohérents/)

// Standard MIDI File: exact bytes of a single-engine export, then structure of a dual export.
const edited=f.setM2000Parameter(f.setM2000Parameter(f.setM2000Parameter(d,0,'mix',50),0,'decay',24),0,'type',1)
const x=f.exportCcMidiFile(edited,[1,2]),hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0')).join(' ')
const name=Array.from(new TextEncoder().encode('M2000 Brouillon local')),track=[0,0xff,0x03,name.length,...name,0,0xff,0x51,0x03,0x07,0xa1,0x20,0,0xb0,10,64,2,0xb0,11,127,2,0xb0,12,15,2,0xb0,13,64,2,0xb0,14,0,0,0xff,0x2f,0]
assert.equal(hex(x.bytes),hex([0x4d,0x54,0x68,0x64,0,0,0,6,0,0,0,1,0,96,0x4d,0x54,0x72,0x6b,0,0,0,track.length,...track]))
assert.deepEqual([x.events,x.approximate,x.unaddressable],[5,1,3])
function readSmf(b){assert.equal(String.fromCharCode(...b.slice(0,4)),'MThd');const len=(b[18]<<24)|(b[19]<<16)|(b[20]<<8)|b[21];assert.equal(22+len,b.length,'Track length matches the file');const cc=[];for(let i=22;i<b.length;){let delta=0;while(b[i]&0x80)delta=(delta<<7)|(b[i++]&0x7f);delta=(delta<<7)|b[i++];if(b[i]===0xff){const l=b[i+2];i+=3+l;continue}cc.push([b[i]&0x0f,b[i+1],b[i+2],delta]);i+=3}return cc}
const dual=readSmf(f.exportCcMidiFile({...edited,type:'dual'},[3,16]).bytes);assert.deepEqual(dual.map(([c,n])=>[c,n]),[[2,10],[2,11],[2,12],[2,13],[2,14],[15,10],[15,11],[15,12]])
assert.ok(dual.every(([,,v])=>v>=0&&v<=127));assert.throws(()=>f.exportCcMidiFile(d,[0,2]),/Canal/);assert.throws(()=>f.exportCcMidiFile(d,[1,17]),/Canal/)

// Workspace: legacy M3000-only state migrates; sub-workspace files replace only their part.
const w=f.defaultWorkspace();assert.equal(w.device,'m3000');assert.deepEqual(f.validateWorkspace(structuredClone(w)),w)
const legacy={...w.m3000,name:'Ancien'};const migrated=f.validateWorkspace(legacy);assert.equal(migrated.device,'m3000');assert.equal(migrated.m3000.name,'Ancien');assert.deepEqual(migrated.m2000,f.defaultM2000State())
assert.equal(f.replaceIn(w,{...edited,name:'Seul M2000'}).m2000.name,'Seul M2000');assert.deepEqual(f.replaceIn(w,{...edited}).m3000,w.m3000)
assert.throws(()=>f.validateWorkspace({...w,device:'m5000'}),/Appareil/);assert.throws(()=>f.validateWorkspace({...w,version:3}),/Version/)

// Conversion through the fixture mapping (VSS-3 Reverb, type 15): display units, confirmed vs hypothesis, not carried.
const c=f.convertToM3000({algorithm:'fixture-reverb',values:{...edited.engines[0].values,out:88}})
assert.equal(c.engine.algorithm,15);assert.equal(c.engine.values['0'],50,'Mix 50 % → raw 50');assert.equal(c.engine.values['1'],-12,'Out −12 dB → raw −12');assert.equal(c.engine.values['2'],250,'Decay 2,5 s → raw 250 (×0.01 s)')
assert.deepEqual([c.report.converted,c.report.hypotheses,c.report.notCarried,c.report.outOfRange],[['Mix','Out Level'],['Decay','Level'],['Type','Diffuse','Hidden','Freq'],[]],'A confirmed row read through the CC scaling hypothesis is reported as a hypothesis')
const untouched=f.m3000InitialValues(15);for(const [k,v] of Object.entries(c.engine.values))if(!['0','1','2','5'].includes(k))assert.equal(v,untouched[k],'Unmapped M3000 parameters keep their initial value')
const back=f.convertToM2000(c.engine);assert.equal(back.engine.algorithm,'fixture-reverb');assert.deepEqual([back.engine.values.mix,back.engine.values.out,back.engine.values.decay],[50,88,24],'Round trip M2000 → M3000 → M2000')
const lowest=f.convertToM3000({algorithm:'fixture-reverb',values:{...edited.engines[0].values,level:0}});assert.equal(lowest.engine.values['5'],-24,'−12 dB (printed end) → Lo Damp raw −24');assert.ok(lowest.report.converted.includes('Level'),'Printed end converts as confirmed')
const asIs=f.convertToM3000({algorithm:'fixture-reverb',values:{...edited.engines[0].values,diffuse:64}});assert.ok(asIs.report.notCarried.includes('Diffuse')&&!asIs.report.sameRange.length,'Raw value without a printed scale is not carried by default')
const relative=f.convertToM3000({algorithm:'fixture-reverb',values:{...edited.engines[0].values,diffuse:64}},15,{assumeSameRange:true}),diffuseRow=f.paramsForM3000(15).find(p=>p.id===15)
assert.deepEqual(relative.report.sameRange,['Diffuse']);assert.equal(relative.engine.values['15'],Math.round(diffuseRow.min+64/127*(diffuseRow.max-diffuseRow.min)),'Opt-in relative position in the M3000 range')
assert.equal(f.convertToM2000(relative.engine,{assumeSameRange:true}).engine.values.diffuse,64,'Relative position round trip')
const highest=f.convertToM3000({algorithm:'fixture-reverb',values:{...edited.engines[0].values,level:127}});assert.deepEqual(highest.report.outOfRange,['Level'],'+12 dB does not fit Lo Damp (−18…0 dB)')
const tooShort=f.convertToM2000({...c.engine,values:{...c.engine.values,'2':1}});assert.deepEqual(tooShort.report.outOfRange,['Decay'],'0,01 s fits the M3000, not the fixture M2000 grid (from 0,1 s)')
assert.throws(()=>f.convertToM3000({algorithm:'fixture-delay',values:d.engines[1].values}),/Aucun algorithme M3000/);assert.throws(()=>f.convertToM2000({algorithm:18,values:f.m3000InitialValues(18)}),/Aucun algorithme M2000/)

// Session: device switch, M2000 actions, shared history, selection per device, lock, no MIDI.
const s=f.m3000Module.create({instanceId:'m2k',midi:lease(),now:()=>0})
s.dispatch({type:'focus',engine:0,id:0});s.dispatch({type:'set-device',device:'m2000'});assert.equal(s.getSnapshot().selection,null,'Selection cleared on device switch')
s.dispatch({type:'m2000-set-parameter',engine:0,key:'decay',value:24});s.dispatch({type:'m2000-set-algorithm',engine:1,algorithm:'fixture-reverb'});s.dispatch({type:'m2000-set-type',value:'dual'});s.dispatch({type:'m2000-set-routing',value:1});s.dispatch({type:'m2000-set-name',value:'Essai'})
assert.deepEqual([s.serialize().device,s.serialize().m2000.engines[0].values.decay,s.serialize().m2000.engines[1].algorithm,s.serialize().m2000.type,s.serialize().m2000.routing,s.serialize().m2000.name],['m2000',24,'fixture-reverb','dual',1,'Essai'])
s.dispatch({type:'focus',device:'m2000',engine:0,key:'decay'});assert.deepEqual(s.getSnapshot().selection,{device:'m2000',engine:0,key:'decay'})
assert.throws(()=>s.dispatch({type:'m2000-set-parameter',engine:0,key:'decay',value:200}),/domaine/);assert.throws(()=>s.dispatch({type:'focus',device:'m2000',engine:0,key:'nope'}),/inconnu/)
for(let i=0;i<4;i++)s.dispatch({type:'undo'});assert.equal(s.serialize().m2000.engines[0].values.decay,24);s.dispatch({type:'undo'});assert.equal(s.serialize().m2000.engines[0].values.decay,0);s.dispatch({type:'undo'});assert.equal(s.serialize().device,'m3000','Device switch is one undo step')
assert.throws(()=>s.dispatch({type:'set-device',device:'m5000'}),/inconnu/)
s.setLocked(true);assert.throws(()=>s.dispatch({type:'set-device',device:'m2000'}),/verrouillée/);s.setLocked(false);assert.throws(()=>s.setSending(true),/désactivés/);s.dispose()

// ---------- B. Shipped map (docs/instruments/tc-m2000): invariants on the real data ----------
const r=await load('shipped.mjs',null),map=r.m2000Map
assert.ok(map.algorithms.length>0&&!map.algorithms.some(a=>a.key.startsWith('fixture-')),'Shipped map is the documented one, not the fixture')
let params=0,raw=0,lists=0,steps=0,noCc=0,printed=0,linear=0
for(const a of map.algorithms){
 const ccs=a.params.map(p=>p.cc).filter(v=>v!==null);assert.equal(new Set(ccs).size,ccs.length,`Distinct CCs in ${a.key}`);assert.ok(ccs.every(v=>v>=10&&v<=127))
 const st=r.defaultM2000State();st.engines[0]={algorithm:a.key,values:r.initialM2000Values(a.key)};r.validateM2000State(st)
 const smf=readSmf(r.exportCcMidiFile({...st,type:'single'},[1,2]).bytes);assert.equal(smf.length,ccs.length,`One CC per addressable parameter of ${a.key}`)
 for(const p of a.params){params++;if(p.cc===null)noCc++;if(p.domain.kind==='cc'){raw++;if(p.domain.printed)printed++;if(p.domain.printed?.interpolate)linear++}else if(p.domain.kind==='list')lists++;else steps++
  for(const v of [0,p.domain.max]){assert.equal(r.parseM2000Entry(p,r.formatM2000(p,v)),v,`Format/parse round trip ${a.key}.${p.key}=${v}`)}}
}
let pairs=0,confirmedParams=0,hypothesisParams=0,carriedRelative=0
for(const pair of map.mapping.pairs.filter(p=>p.m3000Algorithm!==null)){
 pairs++;confirmedParams+=pair.params.filter(p=>p.status==='confirmed'&&p.m3000Id!==null).length;hypothesisParams+=pair.params.filter(p=>p.status==='hypothesis'&&p.m3000Id!==null).length
 for(const options of [{},{assumeSameRange:true}]){
  const there=r.convertToM3000({algorithm:pair.m2000,values:r.initialM2000Values(pair.m2000)},pair.m3000Algorithm,options),ws=r.defaultWorkspace();ws.m3000.engines[0]=there.engine;r.validateWorkspace(ws)
  const back=r.convertToM2000(there.engine,options);ws.m2000.engines[0]=back.engine;r.validateWorkspace(ws)
  if(options.assumeSameRange)carriedRelative+=there.report.sameRange.length
 }
}
assert.equal(sends,0,'No MIDI sent');assert.ok(releases>=1)
console.log(`PASS TC M2000: fixture machinery (step grids, lists, raw CC, exact SMF bytes, channels, workspace migration, display-unit conversion both ways with confirmed/hypothesis/not carried, session device switch and shared history); shipped map ${map.algorithms.length} algorithms, ${params} parameters (${steps} grids, ${lists} lists, ${raw} raw CC of which ${printed} with printed ends and ${linear} read linearly; ${noCc} without a published CC), ${pairs} M2000→M3000 pairs (${confirmedParams} confirmed, ${hypothesisParams} hypothesis parameter mappings; ${carriedRelative} values carried only with the opt-in same-range assumption) all converting both ways to valid workspaces; zero MIDI sent`)

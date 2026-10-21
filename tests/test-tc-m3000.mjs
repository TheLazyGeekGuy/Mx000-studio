// Offline tests for the TC Electronic M3000 module: pure codecs, validators, model and session. No MIDI.
import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdirSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {pathToFileURL} from 'node:url'
import path from 'node:path'

execFileSync(process.execPath,['scripts/build-tc-m3000-map.mjs','--check'],{stdio:'pipe'})
const bundle=await build({stdin:{contents:`export * from './src/editors/tc-m3000/module';export * from './src/editors/tc-m3000/model';export * from './src/editors/tc-m3000/protocol';export {m3000Map} from './src/editors/tc-m3000/parameter-map';export * from './src/editors/tc-m3000/format';export * from './src/editors/tc-m3000/preset-codec';export {ENGINE_LAYOUT,ENGINE_TEMPLATE} from './src/editors/tc-m3000/engine-layout';export {validateInstrumentDefinition} from './src/instrument-sdk/contracts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'esm',metafile:true})
assert.ok(!Object.keys(bundle.metafile.inputs).some(p=>p.endsWith('.tsx')||p.includes('/view')||p.includes('node_modules')),'Headless module imported a view or dependency')
mkdirSync('output/test-tc-m3000',{recursive:true});writeFileSync('output/test-tc-m3000/core.mjs',bundle.outputFiles[0].text)
const m=await import(pathToFileURL(path.resolve('output/test-tc-m3000/core.mjs')).href)
const hex=b=>Array.from(b,v=>v.toString(16).padStart(2,'0').toUpperCase()).join(' ')

// Parameter map: counts of the manufacturer tables (M3000 MIDI specification V1.01 pp.4–11).
assert.equal(m.m3000Map.algorithms.length,21);assert.equal(m.m3000Map.tables.length,17);assert.equal(m.m3000Map.system.length,34)
assert.equal(m.m3000Map.tables.reduce((n,t)=>n+t.params.length,0),274)
for(const t of m.m3000Map.tables)for(const p of t.params)assert.ok(p.cc===null||p.cc===p.id+10,'Controller is ID+10 in this edition')
assert.ok(Object.isFrozen(m.m3000Map.tables[0].params[0]))

// Display map (manuals, docs/instruments/tc-m3000/DISPLAY-MAP.json): only confirmed linear/list mappings render values.
const tableOf=a=>m.m3000Map.tables.find(t=>t.algorithmIds.includes(a)),param=(a,id)=>tableOf(a).params.find(p=>p.id===id)
assert.equal(m.m3000Map.source.displaySha256!==null,true,'Display map merged')
const decay=param(15,2),loDamp=param(15,5),roomType=param(15,31),order=param(3,4),loFreq=param(13,2),pitch=param(12,3),routing=m.m3000Map.system.find(p=>p.id===34)
assert.deepEqual([1,250,2000].map(v=>m.formatValue(decay,v)),['0,01 s','2,50 s','20,00 s']);assert.equal(m.formatValue(decay,250,'en'),'2.50 s')
assert.equal(m.parseEntry(decay,'2,5 s'),250);assert.equal(m.parseEntry(decay,'2.5'),250);assert.throws(()=>m.parseEntry(decay,'2 dB'),/Unité/);assert.throws(()=>m.parseEntry(decay,'25'),/domaine/)
assert.equal(m.formatValue(loDamp,-36),'-18,0 dB');const loDecay=param(15,8);assert.equal(m.formatValue(loDecay,50),'×0,50');assert.equal(m.parseEntry(loDecay,'×0,5'),50);assert.equal(m.parseEntry(loDecay,'0.5'),50);assert.throws(()=>m.parseEntry(loDecay,'0,5 s'),/Multiplicateur/)
for(const t of m.m3000Map.tables){const labels=t.params.map(p=>m.parameterLabel(p));assert.equal(new Set(labels).size,labels.length,`Distinct labels in ${t.heading}`)}
assert.equal(m.parseEntry(loDamp,'-0,5'),-1)
assert.equal(m.formatValue(roomType,1),'Natural');assert.equal(m.parseEntry(roomType,'natural'),1);assert.ok(m.orderPresumed(roomType),'Range-slot label order is flagged as presumed')
assert.ok(m.hasConfirmedDisplay(order)&&!m.orderPresumed(order),'Printed ascending list is confirmed');assert.ok(!m.orderPresumed(routing)&&m.hasConfirmedDisplay(routing),'Routing order confirmed on hardware (2026-10-20)');assert.equal(m.formatValue(routing,4),'Couplé (Linked)')
assert.ok(!m.hasConfirmedDisplay(loFreq)&&m.anchorHint(loFreq),'Endpoint-only table never interpolates');assert.equal(m.formatValue(loFreq,1),'1')
assert.equal(pitch.display.status,'conflict');assert.equal(m.formatValue(pitch,-1200),'-1200','Conflicting mapping stays raw')
for(const t of m.m3000Map.tables){const ids=t.params.map(p=>p.id).sort((a,b)=>a-b),grouped=(t.groups??[]).flatMap(g=>g.params).sort((a,b)=>a-b);assert.deepEqual(grouped,ids,`Groups of ${t.heading} cover each parameter once`)}

// Requests and Parameter Data: examples of docs/instruments/TC-ELECTRONIC-M3000.md §6.
assert.equal(hex(m.presetRequest(0,0,0)),'F0 00 20 1F 00 42 45 00 00 00 F7')
assert.equal(hex(m.presetRequest(0,0,513)),'F0 00 20 1F 00 42 45 00 04 01 F7')
assert.equal(hex(m.presetRequest(0,2,257)),'F0 00 20 1F 00 42 45 02 02 01 F7')
assert.equal(hex(m.parameterRequest(0,0,0,2)),'F0 00 20 1F 00 42 47 00 00 02 F7')
assert.equal(hex(m.parameterRequest(0,2,35,5)),'F0 00 20 1F 00 42 47 02 23 05 F7')
assert.equal(hex(m.parameterData(0,0,0,[50])),'F0 00 20 1F 00 42 22 00 00 00 32 F7')
assert.deepEqual(m.encodeSigned14(-100),[0x7f,0x1c]);for(const v of [-8192,-100,-1,0,1,127,128,1920,8191])assert.equal(m.decodeSigned14(...m.encodeSigned14(v)),v)
assert.throws(()=>m.presetRequest(0,2,513));assert.throws(()=>m.presetRequest(128,0,0));assert.throws(()=>m.parameterRequest(0,0,120,9));assert.throws(()=>m.encodeSigned14(8192))
assert.deepEqual(m.describePreset(0,513),{bank:'user',slot:1});assert.deepEqual(m.describePreset(2,257),{bank:'snapshot',slot:1});assert.deepEqual(m.describePreset(2,0),{bank:'edit',slot:0})

// Preset Data (p.3): 80/142 data bytes as nibbles, checksum on decoded bytes (likely reading, kept as diagnostic).
function presetFrame(kind,preset,size,device=0,nibbleChecksum=false){const data=Array.from({length:size},(_,i)=>(i*37+11)&255);let s=0,n=0;const wire=[];for(const d of data){wire.push(d>>4,d&15);s+=d;n+=(d>>4)+(d&15)}return Uint8Array.from([0xf0,0,0x20,0x1f,device,0x42,0x20,kind,preset>>7,preset&127,...wire,((-(nibbleChecksum?n:s))&127),0xf7])}
const single=presetFrame(0,513,80),dual=presetFrame(2,129,142)
assert.equal(single.length,172);assert.equal(dual.length,296)
const ps=m.parseMessage(single);assert.equal(ps.type,'preset-data');assert.equal(ps.preset,513);assert.equal(ps.data.length,80);assert.equal(ps.checksum.decodedSumMatches,true)
assert.equal(m.parseMessage(presetFrame(0,513,80,0,true)).checksum.decodedSumMatches,false,'nibble-sum reading is distinguishable')
assert.equal(m.parseMessage(dual).data.length,142)
for(const bad of [single.slice(1),Uint8Array.from(single).map((v,i)=>i===5?0x40:v),Uint8Array.from(single).map((v,i)=>i===20?16:v),presetFrame(0,1100,80),Uint8Array.from([...single.slice(0,-1),0,0xf7])])assert.equal(m.parseMessage(bad)?.type==='preset-data',false)

// Validators: reads = Identity, Preset, Parameter and Bank Requests; edit buffer = one known engine value or a Recall.
assert.ok(m.acceptsQuery([...m.presetRequest(5,1,0)]));assert.ok(m.acceptsQuery([...m.parameterRequest(5,2,0,34)]));assert.ok(m.acceptsQuery([...m.IDENTITY_REQUEST]));assert.ok(m.acceptsQuery([...m.bankRequest(0,2)]))
for(const refused of [[0xf0,0,0x20,0x1f,0,0x42,0x44,0,0,1,0xf7],[...m.parameterData(0,0,0,[50])],[...single],[0xf0,0,0x20,0x1f,0,0x40,0x45,0,0,0,0xf7],[0xf0,0x7e,0x7f,0x06,0x02,0xf7]])assert.equal(m.acceptsQuery(refused),false)
assert.ok(m.acceptsEditBuffer([...m.parameterData(0,0,0,[50])]));assert.ok(m.acceptsEditBuffer([...m.parameterData(0,1,1,[-100])]))
assert.equal(hex(m.recallRequest(0,2,89)),'F0 00 20 1F 00 42 44 02 00 59 F7');assert.ok(m.acceptsEditBuffer([...m.recallRequest(0,2,89)]));assert.ok(m.acceptsEditBuffer([...m.recallRequest(0,0,500)]))
assert.throws(()=>m.recallRequest(0,0,0),/buffer/);assert.equal(m.acceptsEditBuffer([0xf0,0,0x20,0x1f,0,0x42,0x44,2,0x04,1,0xf7]),false,'Recall beyond the dual range refused')
assert.ok(m.acceptsEditBuffer([...m.parameterData(0,2,34,[1])]),'Routing of the running preset (system 34) admitted');assert.equal(m.acceptsEditBuffer([...m.parameterData(0,2,34,[6])]),false)
for(const refused of [[...m.parameterData(0,2,33,[1])],[...m.parameterData(0,2,0,[1])],[...m.parameterData(0,0,0,[50,0])],[...m.parameterData(0,0,0,[101])],[...m.parameterData(0,0,99,[0])],[...single],[...m.presetRequest(0,0,0)],[...m.bankRequest(0,0)]])assert.equal(m.acceptsEditBuffer(refused),false)

// Identity Reply as sent by the owner's M3000 (2026-10-20): family 0x42, version 2.04, device ID 0.
const reply=[0xf0,0x7e,0x00,0x06,0x02,0x00,0x20,0x1f,0x42,0x00,0x00,0x00,0x00,0x00,0x02,0x04,0xf7],ident=m.parseIdentity(reply)
assert.deepEqual([ident.manufacturer,ident.family,ident.model,ident.version,ident.device],['tc-electronic',0x42,0,'2.04',0]);assert.ok(m.isM3000Identity(ident))
assert.equal(m.isM3000Identity(m.parseIdentity(reply.map((v,i)=>i===8?0x40:v))),false,'FireworX family is not an M3000');assert.equal(m.parseIdentity(reply.slice(0,-2).concat([0xf7])),null)
// Dual Preset Data as the unit sends it: 144 data bytes (the specification prints 142); header fields decoded.
function dualFrame(n,name,a1,a2,s1,s2,routing){const d=new Uint8Array(144);d[0]=(n-1)>>8&255;d[1]=(n-1)&255;[...name.padEnd(20)].forEach((c,i)=>d[2+i]=c.charCodeAt(0));d[23]=a1;d[25]=a2
 const w16=(i,v)=>{const u=v&0xffff;d[i]=u>>8;d[i+1]=u&255};w16(26,s1);w16(28,s2);d[30]=routing;let sum=0;const wire=[];for(const v of d){wire.push(v>>4,v&15);sum+=v}
 return Uint8Array.from([0xf0,0,0x20,0x1f,0,0x42,0x20,2,n>>7,n&127,...wire,(-sum)&127,0xf7])}
const real=m.parseMessage(dualFrame(17,'Linked Delay',18,9,225,-1,4));assert.equal(real.type,'preset-data');assert.equal(real.data.length,144);assert.equal(real.raw.length,300)
assert.deepEqual(m.decodePresetHeader(2,real.data),{index:16,name:'Linked Delay',algorithms:[18,9],sources:[226,null],routing:4})
const nul=m.parseMessage(dualFrame(3,'Eq Flat',13,13,-1,-1,0));nul.data.fill(0,9,22);assert.equal(m.decodePresetHeader(2,nul.data).name,'Eq Flat','NUL-padded name')

// Model: strict validation, algorithm change, export ⇄ import round trip, opaque dumps preserved.
const base=m.defaultState();assert.deepEqual(m.validateState(structuredClone(base)),base)
assert.throws(()=>m.validateState({...base,engines:[{...base.engines[0],values:{...base.engines[0].values,99:1}},base.engines[1]]}),/incohérents/)
const mixId=m.paramsFor(15).find(p=>p.name==='MIDI_MIX')?.id??m.paramsFor(15)[0].id
const edited=m.setParameter(base,0,mixId,42);assert.equal(edited.engines[0].values[String(mixId)],42);assert.throws(()=>m.setParameter(base,0,mixId,9999))
const switched=m.setAlgorithm(edited,0,3);assert.equal(switched.engines[0].algorithm,3);assert.equal(Object.keys(switched.engines[0].values).length,7)
const dualState={...edited,type:'dual'},file=m.exportParameterSysex(dualState,0)
const frames=m.splitSysex(file).frames;assert.equal(frames.length,m.paramsFor(15).length+m.paramsFor(18).length);assert.ok(frames.every(f=>m.acceptsEditBuffer([...f])))
const reimported=m.importSysex(m.defaultState(),file);assert.deepEqual(reimported.state.engines,dualState.engines);assert.equal(reimported.report.ignoredValues,0)
const mixed=Uint8Array.from([0x90,0x40,0x7f,...single,...m.parameterData(0,0,mixId,[17]),...m.parameterData(0,0,mixId,[999]),0xf0,0x7e,0x7f,0x06,0x01,0xf7,...single])
const r=m.importSysex(base,mixed);assert.equal(r.report.presetDumps,2);assert.equal(r.state.originals.length,1,'duplicate dump kept once');assert.equal(r.report.appliedValues,1);assert.equal(r.report.ignoredValues,1);assert.equal(r.report.foreignFrames,1);assert.equal(r.report.stray,3)
assert.deepEqual(r.state.originals[0].bytes,[...single]);assert.equal(r.state.engines[0].values[String(mixId)],17)

// Module/session: inert, isolated instances, history, lock, hardware disabled, disposal.
m.validateInstrumentDefinition(m.m3000Instrument)
let releases=0,sends=0;const lease=()=>({release(){releases++},send(){sends++;throw Error('no send expected')},subscribe(){return()=>{}},bind(){}})
const a=m.m3000Module.create({instanceId:'a',midi:lease(),now:()=>0}),b=m.m3000Module.create({instanceId:'b',midi:lease(),now:()=>0})
const s0=a.getSnapshot();assert.equal(a.getSnapshot(),s0,'stable snapshot between notifications')
a.dispatch({type:'set-parameter',engine:0,id:mixId,value:33});assert.notEqual(a.getSnapshot(),s0);assert.equal(b.serialize().m3000.engines[0].values[String(mixId)],base.engines[0].values[String(mixId)])
a.dispatch({type:'undo'});assert.equal(a.serialize().m3000.engines[0].values[String(mixId)],base.engines[0].values[String(mixId)]);a.dispatch({type:'redo'});assert.equal(a.serialize().m3000.engines[0].values[String(mixId)],33)
const detached=a.serialize();detached.m3000.engines[0].values[String(mixId)]=1;assert.equal(a.serialize().m3000.engines[0].values[String(mixId)],33)
assert.throws(()=>a.dispatch({type:'set-parameter',engine:0,id:mixId,value:9999}));assert.match(a.getSnapshot().lastError,/domaine/)
a.dispatch({type:'focus',engine:0,id:mixId});assert.deepEqual(a.getSnapshot().selection,{device:'m3000',engine:0,id:mixId})
a.setLocked(true);assert.throws(()=>a.dispatch({type:'set-name',value:'X'}),/verrouillée/);a.setLocked(false)
assert.throws(()=>a.setSending(true),/Autorisation/);assert.throws(()=>a.setSending(true,{operation:'value'}),/edit-buffer/);assert.throws(()=>a.setSending(true,{operation:'edit-buffer'}),/Identifiez/);assert.equal(a.getSnapshot().sending,false)
a.dispatch({type:'import-sysex',bytes:[...single]});assert.equal(a.lastImport.presetDumps,1);assert.equal(a.serialize().m3000.originals.length,1)
a.dispatch({type:'remove-original',index:0});assert.equal(a.serialize().m3000.originals.length,0)
assert.throws(()=>a.dispatch({type:'unknown'}),/non prise en charge/)
const restored=m.m3000Module.create({instanceId:'c',midi:lease(),now:()=>0},a.serialize());assert.deepEqual(restored.serialize(),a.serialize())
a.dispose();a.dispose();assert.throws(()=>a.dispatch({type:'undo'}),/fermée/);b.dispose();restored.dispose()
assert.equal(sends,0,'No MIDI sent');assert.ok(releases>=3)
// Full-backup scale: every addressable Single (1–1024) and Dual (1–512) location fits one workspace; budgets measured.
const backup=[];for(let n=1;n<=1024;n++)backup.push(...presetFrame(0,n,80));for(let n=1;n<=512;n++)backup.push(...presetFrame(2,n,142))
const median=f=>{const t=[];for(let i=0;i<5;i++){const s=performance.now();f();t.push(performance.now()-s)}return t.sort((a,b)=>a-b)[2]}
let full;const importMs=median(()=>{full=m.importSysex(m.defaultState(),backup)});assert.equal(full.state.originals.length,1536);assert.equal(full.report.presetDumps,1536)
const json=JSON.stringify(full.state),validateMs=median(()=>m.validateState(JSON.parse(json))),again=m.importSysex(full.state,backup)
assert.equal(again.state.originals.length,1536,'Re-importing the same backup adds nothing')
assert.throws(()=>m.importSysex(full.state,[...presetFrame(0,1,80,1),...Array.from({length:64},(_,i)=>[...presetFrame(1,i+1,80)]).flat()]),/Import refusé/,'Cap refuses the whole import')
assert.ok(m.MAX_ORIGINALS>=1536+3)
assert.ok(importMs<1000&&validateMs<500&&json.length<4*1024*1024,`Budgets: import ${importMs.toFixed(0)} ms (<1000), validate ${validateMs.toFixed(0)} ms (<500), JSON ${(json.length/1024).toFixed(0)} KiB (<4096)`)
console.log(`MEASURE full backup 1536 dumps (${(backup.length/1024).toFixed(0)} KiB .syx): import ${importMs.toFixed(1)} ms, validate ${validateMs.toFixed(1)} ms, workspace JSON ${(json.length/1024).toFixed(0)} KiB`)
// Preset codec (engine layout decoded on the owner's unit, SW 2.04, 2026-10-20; docs/instruments/tc-m3000/ENGINE-LAYOUT.json).
{
 const algos=Object.keys(m.ENGINE_LAYOUT).map(Number);assert.equal(algos.length,21,'Every algorithm of the specification');for(const [x,b] of [[100,2],[120,15],[122,16],[126,19]])assert.deepEqual(m.ENGINE_LAYOUT[x],m.ENGINE_LAYOUT[b],'Expert variant = base layout')
 for(const a of algos){
  const fields=m.ENGINE_LAYOUT[a],ids=fields.map(f=>f.id).sort((x,y)=>x-y);assert.deepEqual(ids,m.paramsFor(a).map(p=>p.id).sort((x,y)=>x-y),`Layout covers every parameter of algorithm ${a}`)
  const bytes=new Set();for(const f of fields)for(let k=0;k<(f.encoding.endsWith('16')?2:1);k++){const i=f.offset+k;assert.ok(i>=26&&i<=79&&!bytes.has(i),`No overlap, inside the block (algorithm ${a})`);bytes.add(i)}
  for(const f of fields){const p=m.paramsFor(a).find(p=>p.id===f.id);if(f.encoding.endsWith('8')){assert.equal(f.encoding,p.min<0?'s8':'u8');assert.ok(p.max<=(p.min<0?127:255)&&p.min>=-128,'A byte holds the whole range')}else assert.equal(f.encoding,p.min<0?'s16':'u16')}
  assert.equal(m.ENGINE_TEMPLATE[a].length,54)
 }
 let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648
 const randomEngine=a=>({algorithm:a,values:Object.fromEntries(m.paramsFor(a).map(p=>[String(p.id),p.min+Math.floor(rnd()*(p.max-p.min+1))]))})
 assert.deepEqual([4,7,10,13,16].map(id=>m.ENGINE_LAYOUT[13].find(f=>f.id===id)).map(f=>[f.offset,f.encoding]),[[30,'s16'],[34,'s16'],[38,'s16'],[42,'s16'],[46,'s16']],'Parametric EQ gains are signed words')
 // Round trips: single, combined (both engines), extremes of every range.
 for(const a of algos){
  const e=randomEngine(a),single=m.encodeEngine(0,m.blankPreset(0),0,e);assert.deepEqual(m.decodeEngine(0,single,0).engine,e)
  assert.equal(single[22]<<8|single[23],a);assert.deepEqual([single[24],single[25]],[0,1])
  for(const end of ['min','max']){const x={algorithm:a,values:Object.fromEntries(m.paramsFor(a).map(p=>[String(p.id),p[end]]))};assert.deepEqual(m.decodeEngine(0,m.encodeEngine(0,m.blankPreset(0),0,x),0).engine,x)}
  const b=randomEngine(algos[(algos.indexOf(a)+5)%algos.length]),dual=m.encodeEngine(2,m.encodeEngine(2,m.blankPreset(2),0,e),1,b)
  assert.deepEqual(m.decodeEngine(2,dual,0).engine,e);assert.deepEqual(m.decodeEngine(2,dual,1).engine,b)
 }
 // Engine 1 occupies combined bytes 36–89 and engine 2 bytes 90–143: writing one never touches the other.
 const one=m.encodeEngine(2,m.blankPreset(2),0,randomEngine(15)),two=m.encodeEngine(2,one,1,randomEngine(18))
 for(let i=0;i<144;i++)if(i<24||(i>=36&&i<90))assert.equal(two[i],one[i],`Engine 2 leaves byte ${i} alone`)
 // Bytes the editor does not model are kept from the base while the algorithm is unchanged; refilled on a change.
 const base=m.encodeEngine(0,m.blankPreset(0),0,randomEngine(15));const unowned=Array.from({length:54},(_,k)=>26+k).find(i=>![15,18].some(a=>m.ENGINE_LAYOUT[a].some(f=>i>=f.offset&&i<f.offset+(f.encoding.endsWith('16')?2:1))))
 base[unowned]=0x5a;assert.equal(m.encodeEngine(0,base,0,randomEngine(15))[unowned],0x5a);assert.equal(m.encodeEngine(0,base,0,randomEngine(18))[unowned],m.ENGINE_TEMPLATE[18][unowned-26])
 // Out-of-range stored values (seen in factory presets) are clamped and reported; unknown layouts decode to null.
 const odd=m.encodeEngine(0,m.blankPreset(0),0,randomEngine(15)),hiCross=m.ENGINE_LAYOUT[15].find(f=>f.id===14);odd[hiCross.offset]=129
 const dec=m.decodeEngine(0,odd,0);assert.deepEqual(dec.clamped.map(c=>[c.id,c.stored,c.value]),[[14,129,136]])
 const unknown=m.blankPreset(0);unknown[23]=112;assert.equal(m.decodeEngine(0,unknown,0),null);assert.throws(()=>m.encodeEngine(0,unknown,0,{algorithm:112,values:{}}),/disposition/)
 assert.throws(()=>m.encodeEngine(0,m.blankPreset(0),0,{...randomEngine(15),values:{...randomEngine(15).values,'2':99999}}),/hors domaine/)
 // Unit ranges (measured on the unit): the editor table narrows the published range; the specification stays available.
 const revbal=m.paramsFor(19).find(p=>p.id===28),hidecay=m.paramsFor(10).find(p=>p.id===9);assert.deepEqual([revbal.min,revbal.max,hidecay.min,hidecay.max],[-125,0,1,200])
 assert.deepEqual([m.specTableFor(19).params.find(p=>p.id===28).max,m.paramsFor(126).find(p=>p.id===28).max,m.paramsFor(2).find(p=>p.id===28)?.max],[127,0,m.specTableFor(2).params.find(p=>p.id===28)?.max])
 {const st=m.setAlgorithm(m.defaultState(),0,19);assert.throws(()=>m.setParameter(st,0,28,50),/refusée par l’appareil.*-125…0.*-127…127/);assert.equal(m.setParameter(st,0,28,-125).engines[0].values['28'],-125)
  const old={...m.defaultState(),engines:[{algorithm:10,values:{...m.initialValues(10),'9':240}},m.defaultState().engines[1]]};assert.equal(m.validateState(old).engines[0].values['9'],200,'Older workspace value brought into the unit range')}
 // Whole draft → P0 frame accepted by the edit-buffer validator, not by the store validator.
 const draft={...m.defaultState(),name:'Codec test',type:'dual',routing:1,engines:[randomEngine(15),randomEngine(18)]},enc=m.encodeDraft(draft)
 assert.equal(enc.kind,2);assert.equal(enc.data[30],1);const dp=m.decodePreset(2,enc.data);assert.equal(dp.name,'Codec test');assert.deepEqual([dp.engines[0].engine,dp.engines[1].engine],draft.engines)
 const frame=Array.from(m.presetDataFrame(0,2,0,enc.data));assert.ok(m.acceptsEditBuffer(frame));assert.ok(!m.acceptsPresetStore(frame))
 // Dynamic Morphing in the combined header: bytes 32 (mode), 33 (speed), 35 (threshold, signed).
 const morphDraft={...draft,morph:{mode:2,speed:1,threshold:-23}},md=m.encodeDraft(morphDraft).data;assert.deepEqual([md[32],md[33],md[35]],[2,1,233]);assert.deepEqual(m.decodePreset(2,md).morph,{mode:2,speed:1,threshold:-23})
 assert.deepEqual(m.stateFromPreset(m.defaultState(),2,md).state.morph,{mode:2,speed:1,threshold:-23});assert.deepEqual(m.defaultState().morph,{mode:0,speed:0,threshold:-6})
 assert.throws(()=>m.validateState({...m.defaultState(),morph:{mode:3,speed:0,threshold:-6}}),/Morphing/);assert.deepEqual(m.validateState((({morph,...rest})=>rest)(m.defaultState())).morph,{mode:0,speed:0,threshold:-6},'Older workspaces get the default')
 const sys=(id,v)=>Array.from(m.parameterData(0,2,id,[v]))
 assert.ok(m.acceptsEditBuffer(sys(19,2))&&m.acceptsEditBuffer(sys(20,0))&&m.acceptsEditBuffer(sys(21,-40))&&m.acceptsEditBuffer(sys(34,5)))
 for(const [id,v] of [[19,3],[21,-5],[22,1],[23,1000],[0,0],[17,1],[35,1]])assert.ok(!m.acceptsEditBuffer(sys(id,v)),`System ${id}=${v} refused`)
 const sDraft=m.encodeDraft({...draft,type:'single'});assert.equal(sDraft.kind,0);assert.equal(sDraft.data.length,80)
}
console.log('PASS TC M3000 module: 21 algorithms/274 engine rows/34 system rows, preset codec (21 algorithms incl. Limiter and Expert, Dynamic Morphing, single + combined round trips, template refill, clamps), confirmed-only display formatting (raw for conflicts/unknowns, no interpolation, presumed orders flagged), exact requests and Parameter Data, signed 14-bit round trip, Preset Data nibble/checksum parsing, read/edit-buffer validators, strict state, export⇄import, opaque dump preservation, full-backup scale (1536 dumps) within budgets, isolated sessions, history, lock, hardware disabled, idempotent disposal, zero MIDI sent')

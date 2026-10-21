// M3000 hardware operations for one session: identification, reading the running state and the memory, recall and
// live parameter sending. Measured on an M3000, 2026-10-20.
// Every packet goes through the host broker with a grant chosen by the view ('query' for reads, 'edit-buffer' for
// volatile writes, 'preset-store' for STORE) and the module validators.
import type {MidiAuthorization,MidiLease} from '../../editor-host/midi-broker'
import {createDeviceLink} from './device-link'
import {IDENTITY_REQUEST,USER_SINGLES,bankRequest,decodePresetHeader,isM3000Identity,isUserSlot,parameterData,parameterRequest,parseIdentity,parseMessage,presetDataFrame,presetRequest,recallRequest,withName,type Identity,type PresetData,type PresetKind} from './protocol'
import {algorithmById,importSysex,initialValues,paramsFor,validateState as validateM3000State,type EngineState,type M3000State} from './model'
import {decodeEngine,encodeDraft} from './preset-codec'
import {UNRELIABLE_READ_BACK} from './engine-layout'

export interface RunningStatus {single1:number|null;single2:number|null;combined:number|null;algorithms:[number,number]}
/** What the unit plays, as last read: a combined preset, or two independent single presets (one per engine). */
export interface RunningPreset {combined:number|null;combinedName:string|null;singles:[number|null,number|null];names:[string,string]}
export interface HardwareSnapshot {
 identity:Identity|null
 /** SysEx device ID learned from the Identity Reply (the unit's UTIL/MIDI setting). */
 device:number
 busy:string|null
 progress:{done:number;total:number;found:number}|null
 live:boolean
 status:RunningStatus|null
 running:RunningPreset|null
 lastReport:string|null
 /** Locations asked for that did not answer (`kind:number`): confirmed empty for this session. */
 empties:readonly string[]
}
export interface HardwareHost {
 getM3000():M3000State
 /** Commits a new M3000 sub-workspace and shows the M3000 device. A baseline (state read from the unit) starts a
  * fresh history: undo never walks back past what the unit was playing. */
 commitM3000(next:M3000State,baseline?:boolean):void
 changed():void
}

/** A factory single preset per algorithm (read from the unit, SW 2.04): no MIDI message selects an algorithm, so an
 * algorithm change recalls one of these into the engine. Limiter (6) and the Expert variants have no factory preset. */
export const FACTORY_PRESET_BY_ALGORITHM:Readonly<Record<number,number>>={2:251,3:244,4:69,5:233,7:240,8:231,9:247,10:77,12:228,13:230,14:235,15:1,16:17,17:238,18:226,19:470}
const statusFrom=(v:number[]):RunningStatus=>({single1:v[0]>0?v[0]:null,single2:v[1]>0?v[1]:null,combined:v[2]>0?v[2]:null,algorithms:[v[3],v[4]]})
const presetFrame=(kind:PresetKind,n:number)=>(b:readonly number[])=>{const m=parseMessage(b);return m?.type==='preset-data'&&m.kind===kind&&m.preset===n?m:null}

export function createHardware(lease:MidiLease,host:HardwareHost){
 const link=createDeviceLink(lease)
 const snap:HardwareSnapshot={identity:null,device:0,busy:null,progress:null,live:false,status:null,running:null,lastReport:null,empties:[]}
 let liveGrant:MidiAuthorization|null=null,liveQuery:MidiAuthorization|null=null,cancelled=false,pending=new Map<string,number[]>(),flushTimer:ReturnType<typeof setTimeout>|undefined
 const set=(patch:Partial<HardwareSnapshot>)=>{Object.assign(snap,patch);host.changed()}
 async function task<T>(label:string,fn:()=>Promise<T>):Promise<T>{
  if(snap.busy)throw Error(`Opération en cours : ${snap.busy}`)
  cancelled=false;set({busy:label,progress:null})
  try{return await fn()}finally{set({busy:null,progress:null})}
 }
 // The unit drops a Parameter Data value equal to the LAST value it received over MIDI for that parameter, even when a
 // recall changed the parameter since (seen on SW 2.04, 2026-10-20: Mix 60 written, preset recalled, 60 again ignored).
 // So a value that may repeat the unit's last received one (same as our last send, or never sent by this session) goes
 // through an in-range neighbour first.
 const lastSent=new Map<string,number>()
 const rangeOf=(target:0|1|2,id:number):[number,number]|null=>{if(target===2)return ({34:[0,5],19:[0,2],20:[0,2],21:[-40,-6]} as Record<number,[number,number]>)[id]??null;const p=paramsFor(host.getM3000().engines[target].algorithm).find(x=>x.id===id);return p?[p.min,p.max]:null}
 function sendValue(grant:MidiAuthorization,target:0|1|2,id:number,v:number){
  const key=`${target}:${id}`,range=rangeOf(target,id)
  if(range&&(!lastSent.has(key)||lastSent.get(key)===v)){const n=v<range[1]?v+1:v-1;if(n>=range[0]&&n!==v)link.send(grant,Array.from(parameterData(snap.device,target,id,[n])))}
  link.send(grant,Array.from(parameterData(snap.device,target,id,[v])));lastSent.set(key,v)
 }
 const params=(grant:MidiAuthorization,target:0|1|2,base:number,count:number)=>link.query(grant,Array.from(parameterRequest(snap.device,target,base,count)),b=>{const m=parseMessage(b);return m?.type==='parameter-data'&&m.target===target&&m.baseId===base?m.values:null})

 async function readStatus(grant:MidiAuthorization){const v=await params(grant,2,35,5);const status=statusFrom(v);set({status});return status}

 /** Reads the running preset: system status, routing, both engines' parameters and the edit-buffer name. */
 async function readCurrentInner(grant:MidiAuthorization,baseline=true){
  const status=await readStatus(grant),[routing]=await params(grant,2,34,1),[mode,speed,threshold]=await params(grant,2,19,3),notes:string[]=[]
  // Edit buffers: each engine's (single format) and, in a combined preset, the combined one. They carry the names and
  // the bytes the editor does not model (kept as the draft's base for whole-preset sends).
  const buffer=async(kind:PresetKind)=>(await link.query(grant,Array.from(presetRequest(snap.device,kind,0)),presetFrame(kind,0))).data
  const dual=status.combined!==null,buffers=[await buffer(0),await buffer(1)],dualBuffer=dual?await buffer(2):null
  const engines=[] as EngineState[]
  for(const e of [0,1] as const){
   const algorithm=status.algorithms[e]
   if(!algorithmById(algorithm)){notes.push(`moteur ${e+1} : algorithme ${algorithm} absent de la spécification, gardé localement`);engines.push(host.getM3000().engines[e]);continue}
   const table=paramsFor(algorithm),count=Math.min(64,Math.max(...table.map(p=>p.id))+1),values=await params(grant,e,0,count),next=initialValues(algorithm)
   // Pitcher voices: the unit's Parameter Request answer does not follow its edit buffer (SW 2.04): decoded instead.
   const unreliable=UNRELIABLE_READ_BACK[algorithm]??[],decoded=unreliable.length?(dualBuffer?decodeEngine(2,dualBuffer,e):decodeEngine(0,buffers[e],0)):null
   if(decoded?.engine.algorithm===algorithm)for(const id of unreliable)values[id]=decoded.engine.values[String(id)]
   for(const p of table){const v=values[p.id];if(Number.isInteger(v)&&v>=p.min&&v<=p.max)next[String(p.id)]=v;else notes.push(`moteur ${e+1} · ${p.name} = ${v} hors de la plage documentée ${p.min}…${p.max}`)}
   engines.push({algorithm,values:next})
  }
  // Linked routing (4): engine 2 follows engine 1 on the unit (manual: "copies Engine 1 into Engine 2"); what it reports
  // for engine 2 is stale. Shown as a copy of engine 1 (observed 2026-10-20 with the factory "Linked …" presets).
  if(routing===4){engines[1]=structuredClone(engines[0]);notes.push('routage Linked : le moteur 2 suit le moteur 1')}
  // Names: each engine edit buffer carries the name of its single preset ("<Combined Preset>" inside a combined one);
  // the dual edit buffer carries the combined preset's name.
  const names:[string,string]=[decodePresetHeader(0,buffers[0]).name,decodePresetHeader(1,buffers[1]).name],combinedName=dualBuffer?decodePresetHeader(2,dualBuffer).name:null
  const running:RunningPreset={combined:status.combined,combinedName,singles:[status.single1,status.single2],names}
  // The draft is taken now, not before the reads: an import or an opening made meanwhile (the reads take ~1 s) is kept.
  const current=host.getM3000(),name=(dual?combinedName:names[0])?.slice(0,40)||current.name
  const next=validateM3000State({...current,name,type:dual?'dual':'single',routing:Number.isInteger(routing)&&routing>=0&&routing<=5?routing:current.routing,engines,engineSources:dual?undefined:[status.single1,status.single2],morph:dual?{mode,speed,threshold}:current.morph,base:{kind:dual?2:0,data:Array.from(dualBuffer??buffers[0])}})
  host.commitM3000(next,baseline)
  const label=dual?`combiné ${status.combined} « ${combinedName} »`:`moteur 1 : simple ${status.single1??'—'} « ${names[0]} », moteur 2 : simple ${status.single2??'—'} « ${names[1]} »`
  set({running,lastReport:`Lu sur l’appareil : ${label}, algorithmes ${engines.map(e=>algorithmById(e.algorithm)?.name??e.algorithm).join(' + ')}.${notes.length?' '+notes.join(' ; ')+'.':''}`})
  return next
 }

 const api={
  getSnapshot:():HardwareSnapshot=>snap,
  /** Universal Identity Request; accepts only a TC unit reporting the M3000 family (0x42). */
  async identify(grant:MidiAuthorization):Promise<Identity>{
   return task('identification',async()=>{
    const identity=await link.query(grant,IDENTITY_REQUEST,parseIdentity,1200)
    if(!isM3000Identity(identity))throw Error(`Appareil identifié mais pas comme un M3000 (fabricant ${identity.manufacturerId.join(' ')}, famille 0x${identity.family.toString(16)})`)
    set({identity,device:identity.device});await readStatus(grant);return identity
   })
  },
  /** Probe used by automatic detection: resolves null when nothing answers. */
  async probeIdentity(grant:MidiAuthorization,timeoutMs=700):Promise<Identity|null>{return task('détection',()=>link.tryQuery(grant,IDENTITY_REQUEST,parseIdentity,timeoutMs))},
  readCurrent(grant:MidiAuthorization){if(!snap.identity)return Promise.reject(Error('Identifiez d’abord l’appareil'));return task('lecture de l’état',()=>readCurrentInner(grant))},
  /** Reads stored presets into the M3000 originals (raw frames kept byte for byte). Factory banks are scanned one
   * number at a time; user banks are read with Bank Request bursts. */
  readMemory(grant:MidiAuthorization,scope:'user'|'factory'|'all'){
   if(!snap.identity)return Promise.reject(Error('Identifiez d’abord l’appareil'))
   return task('lecture de la mémoire',async()=>{
    const frames:PresetData[]=[],ranges:[PresetKind,number,number][]=scope==='user'?[]:[[2,1,128],[2,257,384],[0,1,512]]
    const total=ranges.reduce((n,[,a,b])=>n+b-a+1,0)+(scope==='factory'?0:1+USER_SINGLES.last-USER_SINGLES.first+1);let done=0
    for(const [kind,from,to] of ranges){
     let misses=0,seen=false
     for(let n=from;n<=to&&!cancelled;n++){
      const m=await link.tryQuery(grant,Array.from(presetRequest(snap.device,kind,n)),presetFrame(kind,n),900)
      done++;if(m){frames.push(m);seen=true;misses=0}else misses++
      if(done%8===0)set({progress:{done,total,found:frames.length}})
      if(seen&&misses>=16){done+=to-n;break}
     }
    }
    // User memory. Combined: Bank Request burst (answers with the stored user combined presets). Singles: the single
    // Bank Request answered nothing on SW 2.04 even with user single 762 stored (2026-10-20), so every user single slot
    // is asked for (no early stop: user slots can be sparse).
    if(scope!=='factory'){
     if(!cancelled){const burst=await link.burst(grant,Array.from(bankRequest(snap.device,2)),b=>{const m=parseMessage(b);return m?.type==='preset-data'?m:null},1500,120000)
      frames.push(...burst);done++;set({progress:{done,total,found:frames.length}})}
     for(let n=USER_SINGLES.first;n<=USER_SINGLES.last&&!cancelled;n++){
      const m=await link.tryQuery(grant,Array.from(presetRequest(snap.device,0,n)),presetFrame(0,n),400)
      done++;if(m)frames.push(m);if(done%8===0)set({progress:{done,total,found:frames.length}})
     }
    }
    const bytes=frames.flatMap(f=>Array.from(f.raw)),{state:next,report}=importSysex(host.getM3000(),bytes)
    host.commitM3000(next)
    set({lastReport:`Mémoire lue${cancelled?' (interrompue)':''} : ${report.presetDumps} preset(s) reçu(s), ${next.originals.length} conservé(s) dans l’espace (doublons ignorés).`})
    return report
   })
  },
  /** Reads chosen locations of one kind (librarian: this page, this bank, unread ones). Found presets join the
   * originals; locations that do not answer are recorded as empty. Stops on cancel. */
  readLocations(grant:MidiAuthorization,kind:PresetKind,numbers:readonly number[]){
   if(!snap.identity)return Promise.reject(Error('Identifiez d’abord l’appareil'))
   return task('lecture des emplacements',async()=>{
    const frames:PresetData[]=[],empty=new Set(snap.empties),total=numbers.length;let done=0
    for(const n of numbers){if(cancelled)break
     const m=await link.tryQuery(grant,Array.from(presetRequest(snap.device,kind,n)),presetFrame(kind,n),900)
     done++;if(m){frames.push(m);empty.delete(`${kind}:${n}`)}else empty.add(`${kind}:${n}`)
     if(done%4===0||done===total)set({progress:{done,total,found:frames.length}})}
    if(frames.length){const {state:next}=importSysex(host.getM3000(),frames.flatMap(f=>Array.from(f.raw)));host.commitM3000(next)}
    set({empties:[...empty],lastReport:`${done} emplacement(s) lu(s)${cancelled?' (arrêté)':''} : ${frames.length} preset(s), ${done-frames.length} vide(s).`})
    return {found:frames.length,empty:done-frames.length}
   })
  },
  /** Preset Recall (volatile: replaces the running preset; unsaved edits on the unit are lost), then reads it back. */
  recall(write:MidiAuthorization,read:MidiAuthorization,kind:PresetKind,preset:number){
   if(!snap.identity)return Promise.reject(Error('Identifiez d’abord l’appareil'))
   return task('rappel',async()=>{link.send(write,Array.from(recallRequest(snap.device,kind,preset)));await new Promise(r=>setTimeout(r,350));return readCurrentInner(read)})
  },
  /** STORE (persistent): the edit buffer of an engine (single preset) or the combined edit buffer, renamed, written to a
   * user memory slot. The destination is read first (kept as a backup original when occupied), the slot is read back
   * after writing and compared. Never ROM, card or snapshot slots. */
  store(write:MidiAuthorization,read:MidiAuthorization,section:0|1|2,slot:number,name:string){
   if(!snap.identity)return Promise.reject(Error('Identifiez d’abord l’appareil'))
   if(write.operation!=='preset-store')return Promise.reject(Error('Mémorisation : autorisation « preset-store » requise'))
   const kind:PresetKind=section===2?2:0
   if(!isUserSlot(kind,slot))return Promise.reject(Error('Emplacement hors de la mémoire utilisateur'))
   return task('mémorisation',async()=>{
    const source=await link.query(read,Array.from(presetRequest(snap.device,section,0)),presetFrame(section,0))
    const before=await link.tryQuery(read,Array.from(presetRequest(snap.device,kind,slot)),presetFrame(kind,slot),900)
    const data=withName(source.data,name);data[0]=((slot-1)>>8)&255;data[1]=(slot-1)&255
    link.send(write,Array.from(presetDataFrame(snap.device,kind,slot,data)));await new Promise(r=>setTimeout(r,700))
    const after=await link.query(read,Array.from(presetRequest(snap.device,kind,slot)),presetFrame(kind,slot),1500)
    const same=after.data.length===data.length&&after.data.every((v,i)=>i<2||v===data[i])
    const frames=[...(before?Array.from(before.raw):[]),...Array.from(after.raw)],{state:next}=importSysex(host.getM3000(),frames);host.commitM3000(next)
    set({lastReport:`${section===2?'Combiné':`Moteur ${section+1}`} mémorisé en ${kind===2?'combiné':'simple'} ${slot} « ${decodePresetHeader(kind,after.data).name} »${same?', relu à l’identique':' — RELECTURE DIFFÉRENTE, vérifiez l’appareil'}${before?` (ancien contenu « ${decodePresetHeader(kind,before.data).name} » conservé dans les dumps)`:''}.`})
    if(!same)throw Error('La relecture de l’emplacement ne correspond pas aux données envoyées')
   })
  },
  /** P0: a whole preset (decoded data) into an edit buffer — sets the algorithm too. Volatile, then read back. */
  loadEditBuffer(write:MidiAuthorization,read:MidiAuthorization,kind:PresetKind,data:Uint8Array){
   if(!snap.identity)return Promise.reject(Error('Identifiez d’abord l’appareil'))
   return task('chargement du buffer d’édition',async()=>{link.send(write,Array.from(presetDataFrame(snap.device,kind,0,data)));await new Promise(r=>setTimeout(r,500));return readCurrentInner(read)})
  },
  /** The whole draft (both engines, algorithms, routing, name) as one Preset Data into the edit buffer (P0): a single
   * draft goes to engine 1, a combined draft to the combined edit buffer. Volatile; the unit is read back after. */
  sendDraft(write:MidiAuthorization,read:MidiAuthorization){const {kind,data}=encodeDraft(host.getM3000());return api.loadEditBuffer(write,read,kind,data)},
  /** Recall with the live grants (auto-apply on): a stored single into one engine, then the unit is read back. */
  recallLive(kind:PresetKind,preset:number){if(!liveGrant||!liveQuery)return Promise.reject(Error('Envoi automatique inactif'));return api.recall(liveGrant,liveQuery,kind,preset)},
  /** sendDraft with the live grants (auto-apply on). */
  async pushDraft(){if(!liveGrant||!liveQuery)throw Error('Envoi automatique inactif')
   // An opening can come while the start-up read is still running: the draft is encoded now, then sent once that read
   // is over (bounded wait) instead of being refused; the read-back after the send shows what the unit then plays.
   const {kind,data}=encodeDraft(host.getM3000()),write=liveGrant,read=liveQuery
   for(const t=Date.now();snap.busy&&Date.now()-t<8000;)await new Promise(r=>setTimeout(r,50))
   return api.loadEditBuffer(write,read,kind,data)},
  cancel(){cancelled=true;link.cancel()},
  /** Live mode: each accepted engine edit is sent as one Parameter Data value (coalesced per parameter, 25 ms). */
  setLive(grant:MidiAuthorization|null,query:MidiAuthorization|null=null){
   if(grant&&grant.operation!=='edit-buffer')throw Error('Envoi en direct : autorisation « edit-buffer » requise')
   if(query&&query.operation!=='query')throw Error('Lecture : autorisation « query » requise')
   if(grant&&!snap.identity)throw Error('Identifiez d’abord l’appareil')
   liveGrant=grant;liveQuery=grant?query:null;pending.clear();set({live:!!grant})
  },
  /** Algorithm change on the unit: recall the factory single preset of that algorithm into the engine, then either read
   * the unit back (the editor shows that preset's values) or push the editor's values over it. */
  applyEngine(engine:0|1,algorithm:number,mode:'read'|'push',values?:Record<string,number>){
   if(!liveGrant)return Promise.reject(Error('Envoi automatique inactif'))
   const preset=FACTORY_PRESET_BY_ALGORITHM[algorithm]
   // No factory preset uses it (Limiter, Expert variants): the whole draft (already holding that algorithm) goes to P0. A
   // single draft lands in engine 1 only, so engine 2 of two independent singles cannot be served this way.
   if(!preset){
    if(engine===1&&host.getM3000().type!=='dual')return Promise.reject(Error(`Algorithme « ${algorithmById(algorithm)?.name??algorithm} » : aucun preset d’usine ne l’utilise ; sur le moteur 2 il se charge dans un preset combiné`))
    return api.pushDraft().then(()=>{set({lastReport:`Moteur ${engine+1} : algorithme « ${algorithmById(algorithm)?.name} » chargé par l’envoi du brouillon entier (aucun preset d’usine ne l’utilise).`})})
   }
   const write=liveGrant,read=liveQuery
   return task('changement d’algorithme',async()=>{
    link.send(write,Array.from(recallRequest(snap.device,engine,preset)));await new Promise(r=>setTimeout(r,350))
    if(mode==='push'&&values){for(const [id,v] of Object.entries(values)){sendValue(write,engine,Number(id),v);await new Promise(r=>setTimeout(r,4))}
     set({lastReport:`Moteur ${engine+1} : algorithme « ${algorithmById(algorithm)?.name} » chargé (preset d’usine ${preset}) puis valeurs de l’éditeur envoyées.`});return}
    if(read)await readCurrentInner(read,false)
    set({lastReport:`Moteur ${engine+1} : algorithme « ${algorithmById(algorithm)?.name} » chargé depuis le preset d’usine ${preset}, valeurs relues sur l’appareil.`})
   })
  },
  /** Routing of the running preset (system parameter 34). */
  setRouting(value:number){if(!liveGrant)return;sendValue(liveGrant,2,34,value)},
  /** Dynamic Morphing of the running combined preset: system 19 (mode), 20 (speed), 21 (threshold). */
  setMorph(id:19|20|21,value:number){if(!liveGrant)return;sendValue(liveGrant,2,id,value)},
  /** Called after a committed local engine edit. Nothing is sent unless live mode is on. */
  edited(engine:0|1,id:number,value:number){
   if(!liveGrant)return
   pending.set(`${engine}:${id}`,[engine,id,value])
   flushTimer??=setTimeout(()=>{flushTimer=undefined;const items=[...pending.values()];pending.clear()
    for(const [e,i,v] of items)try{sendValue(liveGrant!,e as 0|1,i,v)}catch(err){set({live:false,lastReport:`Envoi en direct arrêté : ${err instanceof Error?err.message:String(err)}`});liveGrant=null;break}},25)
  },
  isLive:()=>!!liveGrant,
  reset(){liveGrant=null;liveQuery=null;pending.clear();set({identity:null,status:null,running:null,live:false,lastReport:null,empties:[]})},
  dispose(){if(flushTimer!==undefined)clearTimeout(flushTimer);liveGrant=null;link.dispose()},
 }
 return api
}
export type M3000Hardware=ReturnType<typeof createHardware>

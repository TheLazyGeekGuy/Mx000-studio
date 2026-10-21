import type {EditorModule,EditorSession,EditorSnapshot} from '../../editor-host/contracts'
import type {MidiAuthorization} from '../../editor-host/midi-broker'
import type {InstrumentDefinition} from '../../instrument-sdk/contracts'
import {acceptsQuery,acceptsEditBuffer,acceptsPresetStore,decodePresetHeader,parseMessage,type PresetKind} from './protocol'
import {decodeEngine,stateFromPreset} from './preset-codec'
import {validateState as validateM3000State,setParameter,setAlgorithm,importSysex,paramsFor,type EngineIndex,type ImportReport} from './model'
import {m2000ParamsFor,setM2000Algorithm,setM2000Parameter,validateM2000State} from './m2000-model'
import {DEVICES,defaultWorkspace,replaceIn,validateWorkspace,type DeviceId,type TcWorkspace} from './workspace'
import {createHardware,type HardwareSnapshot,type M3000Hardware} from './hardware'

/** M3000: identification, reads, recall, live parameter sending and whole-preset sends to the edit buffer (P0) on
 * explicit request (validated on the owner's unit, SW 2.04, 2026-10-20); STORE only to a user slot, after a
 * confirmation, with backup and read-back. M2000: no SysEx is published; offline only. */
export const m3000HardwarePolicy=Object.freeze({enabled:true,reason:'M3000 : lecture, rappel, envoi en direct et envoi du preset entier dans le buffer d’édition sur demande ; mémorisation seulement en mémoire utilisateur, après confirmation. M2000 : édition hors ligne (aucun SysEx publié).'})

export type M3000Selection={device:'m3000';engine:EngineIndex;id:number}|{device:'m2000';engine:EngineIndex;key:string}
export interface M3000Session extends EditorSession {
 getSnapshot():EditorSnapshot<TcWorkspace,M3000Selection>&{hardware:HardwareSnapshot}
 readonly hardware:M3000Hardware
 setLiveQuery(grant:MidiAuthorization|null):void
 readonly lastImport:ImportReport|null
 /** Last stored preset opened as the draft, with what could not be carried exactly. */
 readonly lastOpen:OpenReport|null
 readonly disposed:boolean
}
export interface OpenReport {kind:PresetKind;preset:number;name:string;notes:string[]}
const isEngine=(v:unknown):v is EngineIndex=>v===0||v===1

const MANUAL='https://cdn-downloads.tcelectronic.com/media/217610/tc_electronic_m3000_manual_english.pdf'
const SYSEX='https://cdn-downloads.tcelectronic.com/media/217652/tc_electronic_m3000_midi_sysex_specifications.pdf'
export const m3000Instrument:InstrumentDefinition={
 version:1,modelId:'tc-electronic-m3000',manufacturer:'TC Electronic',model:'M3000',
 dataTypes:[
  {id:'m3000-single-preset',name:'Preset Data simple (80 octets)',schemaVersion:1,maxBytes:172},
  {id:'m3000-dual-preset',name:'Preset Data double (144 octets ; 142 selon la spécification)',schemaVersion:1,maxBytes:300},
  {id:'m3000-parameter-set',name:'Paramètres du buffer d’édition',schemaVersion:1,maxBytes:65536},
 ],
 sources:[
  {id:'m3k-syx',kind:'manufacturer-midi',url:SYSEX,edition:'M3000 MIDI specification V1.01 (1999/08/10, SW 2.03)',locator:'pp.1–11; copy retrieved from the Internet Archive, SHA-256 2122a1b1…'},
  {id:'m3k-en',kind:'manufacturer-manual',url:MANUAL,edition:'M3000 Users Manual Rev 3, SW 2.04',locator:'MIDI pp.20–21, chart p.59 (printed = PDF − 2); SHA-256 49e8465d…'},
 ],
 // Evidence: hardware session of 2026-10-20 on the owner's M3000 (identity version 2.04), read-only requests first,
 // then volatile writes with read-back and restore (output/research/tc-m3000-hw/, outside Git).
 operations:[
  {id:'receive-preset-dump',dataType:'m3000-single-preset',effect:'receive',evidence:'hardware-read',sourceIds:['m3k-syx'],sideEffects:[],requiresDestination:false,requiresBackup:false},
  {id:'request-preset',dataType:'m3000-dual-preset',effect:'request',evidence:'hardware-read',sourceIds:['m3k-syx'],sideEffects:[],requiresDestination:false,requiresBackup:false},
  {id:'request-edit-buffer-parameters',dataType:'m3000-parameter-set',effect:'request',evidence:'hardware-read',sourceIds:['m3k-syx'],sideEffects:[],requiresDestination:false,requiresBackup:false},
  {id:'write-edit-buffer-parameter',dataType:'m3000-parameter-set',effect:'edit-buffer',evidence:'hardware-volatile-write',sourceIds:['m3k-syx'],sideEffects:[],requiresDestination:false,requiresBackup:false},
  {id:'recall-preset',dataType:'m3000-dual-preset',effect:'edit-buffer',evidence:'hardware-volatile-write',sourceIds:['m3k-syx'],sideEffects:['select-program','alter-routing'],requiresDestination:false,requiresBackup:false},
  // Engine blocks decoded on the unit (docs/instruments/tc-m3000/ENGINE-LAYOUT.json); 48 presets built by the codec sent
  // to P0 and read back (session 2026-10-20T20-44-46).
  {id:'upload-edit-buffer',dataType:'m3000-dual-preset',effect:'edit-buffer',evidence:'hardware-volatile-write',sourceIds:['m3k-syx'],sideEffects:['alter-routing'],requiresDestination:false,requiresBackup:false},
  // STORE: first real store 2026-10-20 after a full backup (user combined 178 and user single 762 through the editor UI,
  // read back and recalled identical; session …T21-27-05-483Z-browser-store).
  {id:'store-preset',dataType:'m3000-dual-preset',effect:'persistent-store',evidence:'hardware-persistent-verified',sourceIds:['m3k-syx'],sideEffects:['overwrite-memory'],requiresDestination:true,requiresBackup:true},
 ],
}

/** Registration/import allocates no ports, DOM, storage or timers. One editor, two devices (M3000, M2000) selected
 * in the view; each keeps its own sub-workspace. Hardware descriptors (instrument, validators) are the M3000's: the
 * M2000 publishes no SysEx and exchanges with both are disabled. */
export const m3000Module:EditorModule={
 instrument:m3000Instrument,
 manifest:{id:'tc-electronic-m3000-editor',modelId:'tc-electronic-m3000',name:'M3000 / M2000 Editor',version:'0.2.0',sdkVersion:1,stateSchemaVersion:2,
  capabilities:['parameter-sysex','offline-editing','sysex-file-import','sysex-file-export','device-selector','cc-file-export']},
 validateState:validateWorkspace,
 validateQuery:acceptsQuery,
 validateEditBufferWrite:acceptsEditBuffer,
 validatePresetStoreWrite:acceptsPresetStore,
 create(context,restored):M3000Session{
  let liveQuery:MidiAuthorization|null=null
  let state=restored===undefined?defaultWorkspace():validateWorkspace(restored),locked=false,disposed=false,selection:M3000Selection|null=null,error:string|null=null,lastImport:ImportReport|null=null,lastOpen:OpenReport|null=null
  const past:TcWorkspace[]=[],future:TcWorkspace[]=[],listeners=new Set<()=>void>()
  // Hardware is created lazily-safe: no packet, port or timer until the view calls one of its operations.
  const hardware=createHardware(context.midi,{getM3000:()=>state.m3000,commitM3000:(next,baseline)=>{commit({...state,device:'m3000',m3000:next},false);if(baseline){past.length=future.length=0;notify()}},changed:()=>notify()})
  const make=()=>Object.freeze({state:structuredClone(state),selection,locked,sending:hardware.isLive(),history:Object.freeze({undo:past.length,redo:future.length}),lastError:error,hardware:Object.freeze({...hardware.getSnapshot()})})
  let snapshot=make()
  const ensure=()=>{if(disposed)throw Error('Session M3000 fermée')}
  const notify=()=>{if(disposed)return;snapshot=make();for(const fn of listeners)try{fn()}catch{/* observer isolation */}}
  // In live mode, engine values that change locally (edit, undo, import) are mirrored to the unit when the algorithm is
  // the same; a different algorithm cannot be sent (no documented message) and is reported instead.
  const mirror=(before:TcWorkspace,after:TcWorkspace)=>{
   if(!hardware.isLive())return
   // A combined draft whose algorithm changes goes to P0 whole: a factory recall into one engine would leave the
   // combined preset on the unit.
   if(after.m3000.type==='dual'&&[0,1].some(e=>before.m3000.engines[e].algorithm!==after.m3000.engines[e].algorithm)){
    hardware.pushDraft().catch(err=>{error=err instanceof Error?err.message:String(err);notify()});return}
   // Algorithm loads are one unit operation each: chained, never concurrent (the second would be refused as busy).
   let chain:Promise<unknown>=Promise.resolve()
   for(const e of [0,1] as const){const a=before.m3000.engines[e],b=after.m3000.engines[e]
    if(e===1&&after.m3000.routing===4)continue // Linked: the unit derives engine 2 from engine 1
    // A different algorithm (undo, import, copy, variation): load it on the unit, then push this engine's values.
    if(a.algorithm!==b.algorithm){chain=chain.then(()=>hardware.applyEngine(e,b.algorithm,'push',b.values)).catch(err=>{error=err instanceof Error?err.message:String(err);notify()});continue}
    for(const [id,v] of Object.entries(b.values))if(a.values[id]!==v)hardware.edited(e,Number(id),v)}
   if(before.m3000.routing!==after.m3000.routing)hardware.setRouting(after.m3000.routing)
   const ma=before.m3000.morph,mb=after.m3000.morph
   if(ma.mode!==mb.mode)hardware.setMorph(19,mb.mode);if(ma.speed!==mb.speed)hardware.setMorph(20,mb.speed);if(ma.threshold!==mb.threshold)hardware.setMorph(21,mb.threshold)
  }
  const commit=(next:TcWorkspace,send=true)=>{if(JSON.stringify(next)===JSON.stringify(state))return;const before=state;past.push(state);if(past.length>100)past.shift();future.length=0;state=next;error=null;if(send)mirror(before,next);notify()}
  const session:M3000Session={
   get disposed(){return disposed},get lastImport(){return lastImport},get lastOpen(){return lastOpen},hardware,
   getSnapshot:()=>snapshot,
   subscribe(fn){ensure();listeners.add(fn);return()=>{listeners.delete(fn)}},
   serialize(){ensure();return structuredClone(state)},
   setLocked(value){ensure();if(typeof value!=='boolean')throw Error('Verrou invalide');locked=value;if(value){hardware.reset();context.midi.release()}notify()},
   /** Live sending needs an 'edit-buffer' grant from the host and an identified M3000. */
   setSending(enabled,grant){ensure();if(enabled&&!grant)throw Error('Autorisation de l’hôte requise');hardware.setLive(enabled?grant!:null,enabled?liveQuery:null);notify()},
   /** Optional read grant used by live operations that read the unit back (algorithm change). */
   setLiveQuery(grant:MidiAuthorization|null){liveQuery=grant},
   dispatch(raw){
    ensure();if(!raw||typeof raw!=='object')throw Error('Action M3000 invalide')
    const a=raw as Record<string,unknown>
    if(a.type==='focus'){
     if(!isEngine(a.engine))throw Error('Paramètre inconnu')
     if(a.device==='m2000'){
      if(typeof a.key!=='string'||!m2000ParamsFor(state.m2000.engines[a.engine].algorithm).some(p=>p.key===a.key))throw Error('Paramètre inconnu')
      selection={device:'m2000',engine:a.engine,key:a.key};notify();return
     }
     if(!Number.isInteger(a.id)||!paramsFor(state.m3000.engines[a.engine].algorithm).some(p=>p.id===a.id))throw Error('Paramètre inconnu')
     selection={device:'m3000',engine:a.engine,id:a.id as number};notify();return
    }
    if(locked)throw Error('Édition verrouillée')
    const m3000=(next:TcWorkspace['m3000'])=>commit({...state,m3000:next}),m2000=(next:TcWorkspace['m2000'])=>commit({...state,m2000:next})
    try{
     switch(a.type){
      case 'replace':return commit(replaceIn(state,a.state))
      case 'set-device':{
       if(!DEVICES.includes(a.device as DeviceId))throw Error('Appareil inconnu')
       if(a.device!==state.device)selection=null
       return commit({...state,device:a.device as DeviceId})
      }
      // M3000 actions (unprefixed, unchanged since 0.1.0).
      case 'set-parameter':{
       if(!isEngine(a.engine))throw Error('Moteur invalide')
       const linked=state.m3000.routing===4
       if(linked&&a.engine===1)throw Error('Routage Linked : le moteur 2 suit le moteur 1 ; éditez le moteur 1.')
       const next=setParameter(state.m3000,a.engine,a.id as number,a.value as number)
       return m3000(linked&&state.m3000.engines[1].algorithm===next.engines[0].algorithm?{...next,engines:[next.engines[0],structuredClone(next.engines[0])]}:next)
      }
      case 'set-algorithm':{
       if(!isEngine(a.engine))throw Error('Moteur invalide')
       if(state.m3000.routing===4&&a.engine===1&&hardware.isLive())throw Error('Routage Linked : le moteur 2 suit le moteur 1 ; changez l’algorithme du moteur 1.')
       const engine=a.engine,algorithm=a.algorithm as number,next=setAlgorithm(state.m3000,engine,algorithm)
       if(!hardware.isLive())return m3000(next)
       // Live: recall a factory preset of that algorithm on the unit and show what it then plays.
       commit({...state,m3000:next},false)
       hardware.applyEngine(engine,algorithm,'read').catch(err=>{error=err instanceof Error?err.message:String(err);notify()});return
      }
      case 'set-type':if(hardware.isLive()&&a.value!==state.m3000.type)throw Error('Appareil connecté : passer en preset combiné ou simple se fait en rappelant un preset (page Appareil, bibliothèque).');return m3000(validateM3000State({...state.m3000,type:a.value}))
      case 'set-routing':return m3000(validateM3000State({...state.m3000,routing:a.value}))
      case 'set-name':return m3000(validateM3000State({...state.m3000,name:a.value}))
      case 'set-morph':{const k=a.field;if(k!=='mode'&&k!=='speed'&&k!=='threshold')throw Error('Réglage de morphing inconnu');return m3000(validateM3000State({...state.m3000,morph:{...state.m3000.morph,[k]:a.value}}))}
      case 'import-sysex':{
       if(!Array.isArray(a.bytes)&&!(a.bytes instanceof Uint8Array))throw Error('Octets .syx requis')
       const result=importSysex(state.m3000,a.bytes as ArrayLike<number>);lastImport=result.report;m3000(result.state);notify();return
      }
      // Opens a kept Preset Data dump as the draft (engine blocks decoded). Live: the whole draft is sent to P0.
      case 'open-original':{
       const index=a.index as number;if(!Number.isInteger(index)||index<0||index>=state.m3000.originals.length)throw Error('Original inconnu')
       const o=state.m3000.originals[index],msg=parseMessage(o.bytes);if(msg?.type!=='preset-data')throw Error('Original illisible')
       const opened=stateFromPreset(state.m3000,msg.kind,msg.data);lastOpen={kind:msg.kind,preset:msg.preset,name:opened.state.name,notes:opened.notes}
       if(!hardware.isLive())return m3000(opened.state)
       commit({...state,m3000:opened.state},false)
       hardware.pushDraft().catch(err=>{error=err instanceof Error?err.message:String(err);notify()});return
      }
      // Opens one Preset Data frame from the librarian (a library file entry or a device read) as the draft.
      case 'open-frame':{
       if(!Array.isArray(a.bytes)||a.bytes.length>400)throw Error('Preset Data requis')
       const msg=parseMessage(a.bytes as number[]);if(msg?.type!=='preset-data'||!msg.checksum.decodedSumMatches)throw Error('Preset Data M3000 invalide')
       const opened=stateFromPreset(state.m3000,msg.kind,msg.data);lastOpen={kind:msg.kind,preset:msg.preset,name:opened.state.name,notes:opened.notes}
       if(!hardware.isLive())return m3000(opened.state)
       commit({...state,m3000:opened.state},false)
       hardware.pushDraft().catch(err=>{error=err instanceof Error?err.message:String(err);notify()});return
      }
      // A stored single preset into ONE engine, the other engine and the preset type kept (the unit allows recalling an
      // engine preset while in a combined preset). Live: a combined draft goes to P0 whole (it stays combined); with two
      // independent singles the stored location is recalled into that engine.
      case 'load-engine-frame':{
       if(!isEngine(a.engine))throw Error('Moteur invalide')
       if(!Array.isArray(a.bytes)||a.bytes.length>400)throw Error('Preset Data requis')
       const msg=parseMessage(a.bytes as number[]);if(msg?.type!=='preset-data'||msg.kind===2||!msg.checksum.decodedSumMatches)throw Error('Preset simple M3000 requis')
       const decoded=decodeEngine(0,msg.data,0);if(!decoded)throw Error('Algorithme de ce preset sans disposition décodée')
       const engine=a.engine,engines=[...state.m3000.engines] as typeof state.m3000.engines;engines[engine]=decoded.engine
       if(state.m3000.routing===4&&engine===1)throw Error('Routage Linked : le moteur 2 suit le moteur 1 ; chargez le preset dans le moteur 1.')
       if(state.m3000.routing===4)engines[1]=structuredClone(decoded.engine)
       const sources:[number|null,number|null]=[...(state.m3000.engineSources??[null,null])] as [number|null,number|null];sources[engine]=msg.preset>0?msg.preset:null
       const next={...state.m3000,engines,engineSources:sources,...(state.m3000.type==='single'&&engine===0?{name:decodePresetHeader(0,msg.data).name.slice(0,40)||state.m3000.name}:{})}
       lastOpen={kind:0,preset:msg.preset,name:decodePresetHeader(0,msg.data).name,notes:decoded.clamped.map(c=>`moteur ${engine+1} · ${c.name} = ${c.stored} enregistré, hors de la plage acceptée : ramené à ${c.value}`)}
       if(!hardware.isLive())return m3000(next)
       commit({...state,m3000:next},false)
       // As the unit's ENGINE n RECALL (checked 2026-10-21): recalling a stored single into one engine while a combined
       // preset plays gives that engine the single (its number on the display), the other engine keeps what it plays and
       // the unit leaves the combined number (status 2/−9/0). Only a preset with no stored location goes to P0.
       const live=msg.preset>0?hardware.recallLive(engine,msg.preset):state.m3000.type==='dual'||engine===0?hardware.pushDraft()
        :Promise.reject(Error('Moteur 2 hors combiné : un preset sans emplacement mémorisé ne peut pas lui être envoyé (P0 simple = moteur 1). Chargé dans l’éditeur seulement.'))
       live.catch(err=>{error=err instanceof Error?err.message:String(err);notify()});return
      }
      case 'remove-original':{
       const index=a.index as number;if(!Number.isInteger(index)||index<0||index>=state.m3000.originals.length)throw Error('Original inconnu')
       return m3000({...state.m3000,originals:state.m3000.originals.filter((_,i)=>i!==index)})
      }
      // M2000 actions.
      case 'm2000-set-parameter':if(!isEngine(a.engine))throw Error('Moteur invalide');return m2000(setM2000Parameter(state.m2000,a.engine,a.key as string,a.value as number))
      case 'm2000-set-algorithm':if(!isEngine(a.engine))throw Error('Moteur invalide');return m2000(setM2000Algorithm(state.m2000,a.engine,a.algorithm as string))
      case 'm2000-set-type':return m2000(validateM2000State({...state.m2000,type:a.value}))
      case 'm2000-set-routing':return m2000(validateM2000State({...state.m2000,routing:a.value}))
      case 'm2000-set-name':return m2000(validateM2000State({...state.m2000,name:a.value}))
      case 'undo':case 'redo':{
       const from=a.type==='undo'?past:future,to=a.type==='undo'?future:past,previous=from.pop()
       if(previous){const before=state;to.push(state);state=previous;mirror(before,state);notify()}return
      }
     }
    }catch(e){error=e instanceof Error?e.message:String(e);notify();throw e}
    throw Error('Action M3000 non prise en charge')
   },
   dispose(){if(disposed)return;disposed=true;listeners.clear();past.length=future.length=0;hardware.dispose();context.midi.release()},
  }
  return session
 },
}

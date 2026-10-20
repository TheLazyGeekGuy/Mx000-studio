import type {EditorModule,EditorSession,EditorSnapshot} from '../../editor-host/contracts'
import type {InstrumentDefinition} from '../../instrument-sdk/contracts'
import {acceptsQuery,acceptsEditBuffer} from './protocol'
import {validateState as validateM3000State,setParameter,setAlgorithm,importSysex,paramsFor,type EngineIndex,type ImportReport} from './model'
import {m2000ParamsFor,setM2000Algorithm,setM2000Parameter,validateM2000State} from './m2000-model'
import {DEVICES,defaultWorkspace,replaceIn,validateWorkspace,type DeviceId,type TcWorkspace} from './workspace'

/** Hardware exchanges are disabled in this release: offline editor, not validated on hardware (no message is sent). */
export const m3000HardwarePolicy=Object.freeze({enabled:false,reason:'Échanges MIDI avec le M3000 et le M2000 désactivés dans cette version : édition hors ligne.'})

export type M3000Selection={device:'m3000';engine:EngineIndex;id:number}|{device:'m2000';engine:EngineIndex;key:string}
export interface M3000Session extends EditorSession {
 getSnapshot():EditorSnapshot<TcWorkspace,M3000Selection>
 readonly lastImport:ImportReport|null
 readonly disposed:boolean
}
const isEngine=(v:unknown):v is EngineIndex=>v===0||v===1

const MANUAL='https://cdn-downloads.tcelectronic.com/media/217610/tc_electronic_m3000_manual_english.pdf'
const SYSEX='https://cdn-downloads.tcelectronic.com/media/217652/tc_electronic_m3000_midi_sysex_specifications.pdf'
export const m3000Instrument:InstrumentDefinition={
 version:1,modelId:'tc-electronic-m3000',manufacturer:'TC Electronic',model:'M3000',
 dataTypes:[
  {id:'m3000-single-preset',name:'Preset Data simple (80 octets)',schemaVersion:1,maxBytes:172},
  {id:'m3000-dual-preset',name:'Preset Data double (142 octets)',schemaVersion:1,maxBytes:296},
  {id:'m3000-parameter-set',name:'Paramètres du buffer d’édition',schemaVersion:1,maxBytes:65536},
 ],
 sources:[
  {id:'m3k-syx',kind:'manufacturer-midi',url:SYSEX,edition:'M3000 MIDI specification V1.01 (1999/08/10, SW 2.03)',locator:'pp.1–11; copy retrieved from the Internet Archive, SHA-256 2122a1b1…'},
  {id:'m3k-en',kind:'manufacturer-manual',url:MANUAL,edition:'M3000 Users Manual Rev 3, SW 2.04',locator:'MIDI pp.20–21, chart p.59 (printed = PDF − 2); SHA-256 49e8465d…'},
 ],
 operations:[
  {id:'receive-preset-dump',dataType:'m3000-single-preset',effect:'receive',evidence:'declared',sourceIds:['m3k-syx'],sideEffects:[],requiresDestination:false,requiresBackup:false},
  {id:'request-edit-buffer-parameters',dataType:'m3000-parameter-set',effect:'request',evidence:'declared',sourceIds:['m3k-syx'],sideEffects:[],requiresDestination:false,requiresBackup:false},
  {id:'write-edit-buffer-parameter',dataType:'m3000-parameter-set',effect:'edit-buffer',evidence:'declared',sourceIds:['m3k-syx'],sideEffects:[],requiresDestination:false,requiresBackup:false},
 ],
}

/** Registration/import allocates no ports, DOM, storage or timers. One editor, two devices (M3000, M2000) selected
 * in the view; each keeps its own sub-workspace. Hardware descriptors (instrument, validators) are the M3000's: the
 * M2000 publishes no SysEx and exchanges with both are disabled. */
export const m3000Module:EditorModule={
 instrument:m3000Instrument,
 manifest:{id:'tc-electronic-m3000-editor',modelId:'tc-electronic-m3000',name:'TC Electronic M3000 / M2000',version:'0.2.0',sdkVersion:1,stateSchemaVersion:2,
  capabilities:['parameter-sysex','offline-editing','sysex-file-import','sysex-file-export','device-selector','cc-file-export']},
 validateState:validateWorkspace,
 validateQuery:acceptsQuery,
 validateEditBufferWrite:acceptsEditBuffer,
 create(context,restored):M3000Session{
  let state=restored===undefined?defaultWorkspace():validateWorkspace(restored),locked=false,disposed=false,selection:M3000Selection|null=null,error:string|null=null,lastImport:ImportReport|null=null
  const past:TcWorkspace[]=[],future:TcWorkspace[]=[],listeners=new Set<()=>void>()
  const make=():EditorSnapshot<TcWorkspace,M3000Selection>=>Object.freeze({state:structuredClone(state),selection,locked,sending:false,history:Object.freeze({undo:past.length,redo:future.length}),lastError:error})
  let snapshot=make()
  const ensure=()=>{if(disposed)throw Error('Session M3000 fermée')}
  const notify=()=>{if(disposed)return;snapshot=make();for(const fn of listeners)try{fn()}catch{/* observer isolation */}}
  const commit=(next:TcWorkspace)=>{if(JSON.stringify(next)===JSON.stringify(state))return;past.push(state);if(past.length>100)past.shift();future.length=0;state=next;error=null;notify()}
  const session:M3000Session={
   get disposed(){return disposed},get lastImport(){return lastImport},
   getSnapshot:()=>snapshot,
   subscribe(fn){ensure();listeners.add(fn);return()=>{listeners.delete(fn)}},
   serialize(){ensure();return structuredClone(state)},
   setLocked(value){ensure();if(typeof value!=='boolean')throw Error('Verrou invalide');locked=value;if(value)context.midi.release();notify()},
   setSending(enabled){ensure();if(enabled)throw Error(m3000HardwarePolicy.reason)},
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
      case 'set-parameter':if(!isEngine(a.engine))throw Error('Moteur invalide');return m3000(setParameter(state.m3000,a.engine,a.id as number,a.value as number))
      case 'set-algorithm':if(!isEngine(a.engine))throw Error('Moteur invalide');return m3000(setAlgorithm(state.m3000,a.engine,a.algorithm as number))
      case 'set-type':return m3000(validateM3000State({...state.m3000,type:a.value}))
      case 'set-routing':return m3000(validateM3000State({...state.m3000,routing:a.value}))
      case 'set-name':return m3000(validateM3000State({...state.m3000,name:a.value}))
      case 'import-sysex':{
       if(!Array.isArray(a.bytes)&&!(a.bytes instanceof Uint8Array))throw Error('Octets .syx requis')
       const result=importSysex(state.m3000,a.bytes as ArrayLike<number>);lastImport=result.report;m3000(result.state);notify();return
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
       if(previous){to.push(state);state=previous;notify()}return
      }
     }
    }catch(e){error=e instanceof Error?e.message:String(e);notify();throw e}
    throw Error('Action M3000 non prise en charge')
   },
   dispose(){if(disposed)return;disposed=true;listeners.clear();past.length=future.length=0;context.midi.release()},
  }
  return session
 },
}

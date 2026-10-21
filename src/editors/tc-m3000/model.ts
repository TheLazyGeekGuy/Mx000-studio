// TC Electronic M3000 — pure state, validation and file conversions. No browser, ports or storage.
// The documented editing path is per-parameter (M3000 MIDI specification V1.01 p.3, Parameter Data on the
// edit buffer). Preset Data dumps (p.3) are kept byte for byte; their engine blocks are decoded by preset-codec.ts
// (layout decoded on the owner's unit, not published by TC).
import {m3000Map,type M3000Param,type M3000Table} from './parameter-map'
import {UNIT_RANGES} from './unit-ranges'
import {DUAL_DATA_BYTES,SINGLE_DATA_BYTES,parseMessage,parameterData,type PresetKind,type PresetData} from './protocol'

export type EngineIndex=0|1
export interface EngineState {algorithm:number;values:Record<string,number>}
export interface OpaqueDump {kind:PresetKind;preset:number;bytes:number[];checksumDecoded:boolean}
export interface M3000State {
 format:'tc-m3000-workspace';version:1
 name:string
 type:'single'|'dual'
 /** System ROUTING (identifier 34, range 0–5, p.4). Local value; its labels come from the manual display map. */
 routing:number
 engines:[EngineState,EngineState]
 /** Dynamic Morphing of a combined preset (system parameters 19–21; combined Preset Data bytes 32, 33, 35, decoded on
  * the unit 2026-10-20). Manual p.25: OFF / 1-2 / 2-1, SLOW / MED / FAST, threshold; only with Parallel routing. */
 morph:Morph
 /** Stored single preset each engine was last loaded from (« Preset du moteur », the unit's engine numbers after a read);
  * the number stays while the engine is edited, as on the unit's display. Optional. */
 engineSources?:[number|null,number|null]
 /** Preset Data frames imported or received, preserved byte for byte. */
 originals:OpaqueDump[]
 /** Decoded Preset Data the draft was opened from or last read from the unit (optional). The preset codec keeps the
  * bytes the editor does not model from it when the draft is sent or exported whole. */
 base?:PresetBase|null
}
export interface PresetBase {kind:PresetKind;data:number[]}
export interface Morph {mode:number;speed:number;threshold:number}
export const MORPH_RANGES={mode:[0,2],speed:[0,2],threshold:[-40,-6]} as const
/** The most common factory setting (Morphing off, threshold −6). */
export const defaultMorph=():Morph=>({mode:0,speed:0,threshold:-6})
export function validateMorph(value:unknown):Morph{
 if(value===undefined)return defaultMorph()
 if(!isRecord(value))throw Error('Morphing invalide')
 const out={} as Morph
 for(const k of ['mode','speed','threshold'] as const){const v=value[k],[min,max]=MORPH_RANGES[k];if(!Number.isInteger(v)||(v as number)<min||(v as number)>max)throw Error(`Morphing hors domaine : ${k}`);out[k]=v as number}
 return out
}
/** Every addressable Single (1–1024) and Dual (1–512) location plus the edit buffers: a full backup fits. */
export const MAX_ORIGINALS=1600
const ROUTING=m3000Map.system.find(p=>p.name==='MIDI_ROUTING')!

export const algorithmById=(id:number)=>m3000Map.algorithms.find(a=>a.id===id)
/** The manufacturer's table (published ranges). */
export function specTableFor(algorithm:number):M3000Table{
 const a=algorithmById(algorithm);if(!a)throw Error('Algorithme inconnu')
 return m3000Map.tables.find(t=>t.key===a.table)!
}
const unitTables=new Map<number,M3000Table>()
/** The table the editor works with: published ranges narrowed to what the unit accepts where they differ (measured on the
 * owner's M3000, unit-ranges.ts: Reverb 3 Hi Decay 1–200, VSS Surround Reverb Balance −125…0). */
export function tableFor(algorithm:number):M3000Table{
 const spec=specTableFor(algorithm),limits=UNIT_RANGES[algorithm];if(!limits)return spec
 let t=unitTables.get(algorithm)
 if(!t){t=Object.freeze({...spec,params:Object.freeze(spec.params.map(p=>limits[p.id]?Object.freeze({...p,min:limits[p.id][0],max:limits[p.id][1]}):p))});unitTables.set(algorithm,t)}
 return t
}
export const paramsFor=(algorithm:number):readonly M3000Param[]=>tableFor(algorithm).params
/** Local starting value: 0 clamped into the documented range. Not a factory default (none is published). */
export const initialValue=(p:{min:number;max:number})=>Math.min(p.max,Math.max(p.min,0))
export function initialValues(algorithm:number){return Object.fromEntries(paramsFor(algorithm).map(p=>[String(p.id),initialValue(p)]))}

export function defaultState():M3000State{
 return {format:'tc-m3000-workspace',version:1,name:'Brouillon local',type:'single',routing:initialValue({min:ROUTING.min!,max:ROUTING.max!}),
  engines:[{algorithm:15,values:initialValues(15)},{algorithm:18,values:initialValues(18)}],morph:defaultMorph(),originals:[]}
}

const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)
function validateEngine(value:unknown):EngineState{
 if(!isRecord(value)||!Number.isInteger(value.algorithm)||!isRecord(value.values))throw Error('Moteur invalide')
 const algorithm=value.algorithm as number,params=paramsFor(algorithm),values:Record<string,number>={}
 const keys=Object.keys(value.values)
 if(keys.length!==params.length||keys.some(k=>!params.some(p=>String(p.id)===k)))throw Error('Paramètres du moteur incohérents avec son algorithme')
 // Published range for validity; a value inside it but outside what the unit accepts is brought into the unit's range
 // (workspaces saved before the unit ranges were measured stay readable).
 const spec=specTableFor(algorithm).params
 for(const p of params){const v=(value.values as Record<string,unknown>)[String(p.id)],sp=spec.find(x=>x.id===p.id)!;if(!Number.isInteger(v)||(v as number)<sp.min||(v as number)>sp.max)throw Error(`Valeur hors domaine : ${p.name}`);values[String(p.id)]=Math.min(p.max,Math.max(p.min,v as number))}
 return {algorithm,values}
}
function validateDump(value:unknown):OpaqueDump{
 if(!isRecord(value)||!Array.isArray(value.bytes))throw Error('Dump invalide')
 const parsed=parseMessage(value.bytes as number[])
 if(!parsed||parsed.type!=='preset-data')throw Error('Dump Preset Data M3000 invalide')
 return {kind:parsed.kind,preset:parsed.preset,bytes:Array.from(parsed.raw),checksumDecoded:parsed.checksum.decodedSumMatches}
}
function validateBase(value:unknown):PresetBase|null{
 if(value===undefined||value===null)return null
 if(!isRecord(value)||![0,2].includes(value.kind as number)||!Array.isArray(value.data))throw Error('Preset de base invalide')
 const data=value.data as unknown[];if(data.length!==(value.kind===2?DUAL_DATA_BYTES:SINGLE_DATA_BYTES)||data.some(v=>!Number.isInteger(v)||(v as number)<0||(v as number)>255))throw Error('Preset de base invalide')
 return {kind:value.kind as PresetKind,data:data as number[]}
}
function validateSources(value:unknown):[number|null,number|null]{
 if(!Array.isArray(value)||value.length!==2||value.some(v=>v!==null&&(!Number.isInteger(v)||(v as number)<1||(v as number)>768)))throw Error('Presets des moteurs invalides')
 return [value[0] as number|null,value[1] as number|null]
}
export function validateState(value:unknown):M3000State{
 if(!isRecord(value)||value.format!=='tc-m3000-workspace')throw Error('Espace M3000 invalide')
 if(value.version!==1)throw Error('Version d’espace M3000 non prise en charge')
 if(JSON.stringify(value).length>2*1024*1024)throw Error('Espace M3000 trop volumineux')
 if(typeof value.name!=='string'||value.name.length>40||/[\x00-\x1f\x7f]/.test(value.name))throw Error('Nom invalide')
 if(value.type!=='single'&&value.type!=='dual')throw Error('Type de preset invalide')
 if(!Number.isInteger(value.routing)||(value.routing as number)<ROUTING.min!||(value.routing as number)>ROUTING.max!)throw Error('Routage hors domaine')
 if(!Array.isArray(value.engines)||value.engines.length!==2)throw Error('Deux moteurs requis')
 if(!Array.isArray(value.originals)||value.originals.length>MAX_ORIGINALS)throw Error('Originaux invalides')
 return {format:'tc-m3000-workspace',version:1,name:value.name,type:value.type,routing:value.routing as number,
  engines:[validateEngine(value.engines[0]),validateEngine(value.engines[1])],morph:validateMorph(value.morph),originals:value.originals.map(validateDump),...(value.engineSources!==undefined?{engineSources:validateSources(value.engineSources)}:{}),...(value.base?{base:validateBase(value.base)}:{})}
}

export function setParameter(state:M3000State,engine:EngineIndex,id:number,value:number):M3000State{
 const p=paramsFor(state.engines[engine].algorithm).find(p=>p.id===id)
 if(!p)throw Error('Paramètre absent de cet algorithme')
 if(!Number.isInteger(value)||value<p.min||value>p.max){const sp=specTableFor(state.engines[engine].algorithm).params.find(x=>x.id===id)!
  throw Error(Number.isInteger(value)&&value>=sp.min&&value<=sp.max?`Valeur refusée par l’appareil : ${p.name} accepte ${p.min}…${p.max} (la spécification annonce ${sp.min}…${sp.max})`:'Valeur hors du domaine du paramètre')}
 const engines=[...state.engines] as M3000State['engines'];engines[engine]={...engines[engine],values:{...engines[engine].values,[String(id)]:value}}
 return {...state,engines}
}
/** Selecting another algorithm starts from local initial values: identifiers are reused with other meanings. */
export function setAlgorithm(state:M3000State,engine:EngineIndex,algorithm:number):M3000State{
 if(!algorithmById(algorithm))throw Error('Algorithme inconnu')
 const engines=[...state.engines] as M3000State['engines'];engines[engine]={algorithm,values:initialValues(algorithm)}
 return {...state,engines}
}

/** Edit-buffer parameter file: one single-value Parameter Data message per engine parameter (p.3).
 * It cannot select an algorithm: no documented message does (system ids 38–39 have no published range). */
export function exportParameterSysex(state:M3000State,device:number):Uint8Array{
 const engines=state.type==='dual'?[0,1] as const:[0] as const,frames:number[]=[]
 for(const e of engines)for(const p of paramsFor(state.engines[e].algorithm))frames.push(...parameterData(device,e,p.id,[state.engines[e].values[String(p.id)]]))
 return Uint8Array.from(frames)
}

/** Splits a .syx file into complete F0…F7 frames; anything outside a frame is reported, never executed. */
export function splitSysex(bytes:ArrayLike<number>):{frames:Uint8Array[];stray:number}{
 const frames:Uint8Array[]=[];let start=-1,stray=0
 for(let i=0;i<bytes.length;i++){const b=bytes[i]
  if(b===0xf0){if(start>=0)stray+=i-start;start=i}
  else if(b===0xf7&&start>=0){frames.push(Uint8Array.from(Array.prototype.slice.call(bytes,start,i+1)));start=-1}
  else if(start<0)stray++}
 if(start>=0)stray+=bytes.length-start
 return {frames,stray}
}
export interface ImportReport {presetDumps:number;appliedValues:number;ignoredValues:number;foreignFrames:number;stray:number;checksumUnconfirmed:number}
/** Applies Parameter Data values that fit the current algorithm; keeps Preset Data dumps as opaque originals. */
export function importSysex(state:M3000State,bytes:ArrayLike<number>):{state:M3000State;report:ImportReport}{
 if(bytes.length>4*1024*1024)throw Error('Fichier .syx trop volumineux')
 const {frames,stray}=splitSysex(bytes),report:ImportReport={presetDumps:0,appliedValues:0,ignoredValues:0,foreignFrames:0,stray,checksumUnconfirmed:0}
 let next=state
 const originals=[...state.originals],seen=new Set(originals.map(o=>o.bytes.join(',')))
 for(const frame of frames){
  const m=parseMessage(frame)
  if(!m){report.foreignFrames++;continue}
  if(m.type==='preset-data'){
   report.presetDumps++;if(!m.checksum.decodedSumMatches)report.checksumUnconfirmed++
   const key=Array.prototype.join.call(m.raw,',');if(seen.has(key))continue
   if(originals.length>=MAX_ORIGINALS)throw Error(`Import refusé : plus de ${MAX_ORIGINALS} dumps dans cet espace de travail. Retirez des originaux ou importez dans un autre espace.`)
   originals.push(dumpOf(m));seen.add(key);continue
  }
  if(m.type==='parameter-data'&&m.target!==2){
   m.values.forEach((value,i)=>{try{next=setParameter(next,m.target as EngineIndex,m.baseId+i,value);report.appliedValues++}catch{report.ignoredValues++}})
   continue
  }
  report.foreignFrames++
 }
 return {state:originals.length===state.originals.length?next:{...next,originals},report}
}
const dumpOf=(m:PresetData):OpaqueDump=>({kind:m.kind,preset:m.preset,bytes:Array.from(m.raw),checksumDecoded:m.checksum.decodedSumMatches})

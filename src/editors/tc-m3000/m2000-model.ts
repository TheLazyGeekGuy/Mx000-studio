// TC Electronic M2000 — pure state, validation and CC file export. No browser, ports or storage.
// The M2000 publishes no SysEx (M2K-CC is its only MIDI document): engine parameters are addressed by controller
// numbers on each engine's channel (10 Mix, 11 Out Level, 12 + position on the EDIT page) and "MIDI CC values are
// scaled to parameter values". Data: docs/instruments/tc-m2000/M2000-PARAMETERS.json via m2000-map.ts.
import {m2000Map,type M2000Algorithm,type M2000Param} from './m2000-map'

export type EngineIndex=0|1
export interface M2000Engine {algorithm:string;values:Record<string,number>}
export interface M2000State {
 format:'tc-m2000-workspace';version:1
 name:string
 type:'single'|'dual'
 /** Index into the printed ROUTING list (local value; CC 35 is a global setting and is never exported). */
 routing:number
 engines:[M2000Engine,M2000Engine]
}

export const m2000AlgorithmByKey=(key:string)=>m2000Map.algorithms.find(a=>a.key===key)
export function m2000Algorithm(key:string):M2000Algorithm{const a=m2000AlgorithmByKey(key);if(!a)throw Error('Algorithme M2000 inconnu');return a}
export const m2000ParamsFor=(key:string):readonly M2000Param[]=>m2000Algorithm(key).params

/** Number of local steps of a parameter: list entries, printed steps, or the 128 CC values when no step is printed. */
export const lastStep=(p:M2000Param)=>p.domain.max
/** Display value of a step when the manual prints min/step (confirmed); null otherwise. */
export function displayValue(p:M2000Param,step:number):number|null{
 if(p.domain.kind!=='steps')return null
 const f=10**p.domain.decimals;return Math.round((p.domain.min+step*p.domain.step)*f)/f
}
/** Value in manual units: exact on a printed grid or at a printed end (CC 0 / 127, "scaled to parameter values");
 * approximate in between for a linearly read unit (hypothesis); null when nothing is printed. */
export function shownValue(p:M2000Param,step:number):{value:number;exact:boolean}|null{
 const d=p.domain
 if(d.kind==='steps')return {value:displayValue(p,step)!,exact:true}
 if(d.kind!=='cc'||!d.printed)return null
 const {min,max,interpolate}=d.printed
 if(step===0&&min!==null)return {value:min,exact:true}
 if(step===127&&max!==null)return {value:max,exact:true}
 if(!interpolate||min===null||max===null)return null
 const f=10**d.printed.decimals;return {value:Math.round((min+step*(max-min)/127)*f)/f,exact:false}
}
/** Controller value nearest to a value in manual units on a linearly read range (inverse of shownValue). */
export function nearestCc(p:M2000Param,value:number):number|null{
 const d=p.domain;if(d.kind!=='cc'||!d.printed||d.printed.min===null||d.printed.max===null)return null
 const {min,max}=d.printed;if(value===min)return 0;if(value===max)return 127
 return d.printed.interpolate?Math.round((value-min)/(max-min)*127):null
}
/** Local starting value: the step nearest to 0 in display units (0 for lists and raw CC values). Not a factory default. */
export function initialStep(p:M2000Param){
 if(p.domain.kind==='steps')return Math.max(0,Math.min(p.domain.max,Math.round((0-p.domain.min)/p.domain.step)))
 const near=p.domain.kind==='cc'?nearestCc(p,0):null
 return near===null||near<0||near>127?0:near
}
export const initialM2000Values=(key:string)=>Object.fromEntries(m2000ParamsFor(key).map(p=>[p.key,initialStep(p)]))
const firstOf=(category:string)=>m2000Map.algorithms.find(a=>a.category===category)??m2000Map.algorithms[0]

export function defaultM2000State():M2000State{
 const e1=firstOf('reverb').key,e2=(m2000Map.algorithms.find(a=>a.category==='delay')??m2000Map.algorithms[Math.min(1,m2000Map.algorithms.length-1)]).key
 return {format:'tc-m2000-workspace',version:1,name:'Brouillon local',type:'single',routing:0,
  engines:[{algorithm:e1,values:initialM2000Values(e1)},{algorithm:e2,values:initialM2000Values(e2)}]}
}

const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)
function validateEngine(value:unknown):M2000Engine{
 if(!isRecord(value)||typeof value.algorithm!=='string'||!isRecord(value.values))throw Error('Moteur M2000 invalide')
 const params=m2000ParamsFor(value.algorithm),keys=Object.keys(value.values),values:Record<string,number>={}
 if(keys.length!==params.length||keys.some(k=>!params.some(p=>p.key===k)))throw Error('Paramètres du moteur M2000 incohérents avec son algorithme')
 for(const p of params){const v=(value.values as Record<string,unknown>)[p.key];if(!Number.isInteger(v)||(v as number)<0||(v as number)>lastStep(p))throw Error(`Valeur hors domaine : ${p.label}`);values[p.key]=v as number}
 return {algorithm:value.algorithm,values}
}
export function validateM2000State(value:unknown):M2000State{
 if(!isRecord(value)||value.format!=='tc-m2000-workspace')throw Error('Espace M2000 invalide')
 if(value.version!==1)throw Error('Version d’espace M2000 non prise en charge')
 if(typeof value.name!=='string'||value.name.length>40||/[\x00-\x1f\x7f]/.test(value.name))throw Error('Nom invalide')
 if(value.type!=='single'&&value.type!=='dual')throw Error('Type de preset invalide')
 if(!Number.isInteger(value.routing)||(value.routing as number)<0||(value.routing as number)>=Math.max(1,m2000Map.routings.length))throw Error('Routage hors domaine')
 if(!Array.isArray(value.engines)||value.engines.length!==2)throw Error('Deux moteurs requis')
 return {format:'tc-m2000-workspace',version:1,name:value.name,type:value.type,routing:value.routing as number,engines:[validateEngine(value.engines[0]),validateEngine(value.engines[1])]}
}

export function setM2000Parameter(state:M2000State,engine:EngineIndex,key:string,value:number):M2000State{
 const p=m2000ParamsFor(state.engines[engine].algorithm).find(p=>p.key===key)
 if(!p)throw Error('Paramètre absent de cet algorithme')
 if(!Number.isInteger(value)||value<0||value>lastStep(p))throw Error('Valeur hors du domaine du paramètre')
 const engines=[...state.engines] as M2000State['engines'];engines[engine]={...engines[engine],values:{...engines[engine].values,[key]:value}}
 return {...state,engines}
}
export function setM2000Algorithm(state:M2000State,engine:EngineIndex,key:string):M2000State{
 m2000Algorithm(key)
 const engines=[...state.engines] as M2000State['engines'];engines[engine]={algorithm:key,values:initialM2000Values(key)}
 return {...state,engines}
}

/** CC value sent for a local step. Linear spread of the steps over 0–127 is a hypothesis: M2K-CC only says
 * "MIDI CC values are scaled to parameter values". Lists and steps use their endpoints exactly. */
export function ccValue(p:M2000Param,step:number){
 if(p.domain.kind==='cc')return step
 const n=lastStep(p);return n===0?0:Math.round(step*127/n)
}
/** True when 128 CC values cannot represent every step (more steps than values): export is approximate. */
export const ccApproximate=(p:M2000Param)=>p.domain.kind!=='cc'&&lastStep(p)>127

export interface CcExport {bytes:Uint8Array;events:number;approximate:number;unaddressable:number}
const vlq=(n:number)=>{const out=[n&0x7f];while((n>>=7)>0)out.unshift((n&0x7f)|0x80);return out}
const u32=(n:number)=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255]
/** Standard MIDI File (format 0, 96 ticks per quarter at 120 BPM) carrying one Control Change per addressable
 * parameter of the exported engines, 2 ticks (≈10 ms) apart. It never selects an algorithm or a preset (no
 * documented message does) and never touches global/system controllers. Channels are 1-based. */
export function exportCcMidiFile(state:M2000State,channels:readonly [number,number]):CcExport{
 for(const c of channels)if(!Number.isInteger(c)||c<1||c>16)throw Error('Canal MIDI 1–16 requis')
 const engines=state.type==='dual'?[0,1] as const:[0] as const,track:number[]=[],name=Array.from(new TextEncoder().encode(`M2000 ${state.name}`.slice(0,60)))
 track.push(0,0xff,0x03,...vlq(name.length),...name,0,0xff,0x51,0x03,0x07,0xa1,0x20)
 let events=0,approximate=0,unaddressable=0
 for(const e of engines)for(const p of m2000ParamsFor(state.engines[e].algorithm)){
  if(p.cc===null){unaddressable++;continue}
  track.push(events?2:0,0xb0|(channels[e]-1),p.cc,ccValue(p,state.engines[e].values[p.key]));events++
  if(ccApproximate(p))approximate++
 }
 track.push(0,0xff,0x2f,0x00)
 return {bytes:Uint8Array.from([0x4d,0x54,0x68,0x64,...u32(6),0,0,0,1,0,96,0x4d,0x54,0x72,0x6b,...u32(track.length),...track]),events,approximate,unaddressable}
}

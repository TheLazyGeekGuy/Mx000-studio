// TC Electronic M3000 SysEx — pure codecs and exact packet validators. No ports, DOM, storage or timers.
// Authority: TC Electronic M3000 MIDI specification V1.01 (1999/08/10, SW 2.03), pp.1–3. See
// docs/instruments/TC-ELECTRONIC-M3000.md §4–6. Inferences are marked as such and kept testable.
import {m3000Map,type M3000Param} from './parameter-map'

export const TC_ID=[0x00,0x20,0x1f] as const
export const M3000_MODEL=0x42
export const MessageType={bankRequest:0x40,presetRecall:0x44,presetRequest:0x45,presetData:0x20,parameterRequest:0x47,parameterData:0x22} as const
/** Single/Dual field (p.1): preset messages 0/1 = single (engine 1/2 for the edit buffer), 2 = dual. */
export type PresetKind=0|1|2
/** Parameter messages (p.1, p.3): 0 = engine 1, 1 = engine 2, 2 = preset system parameter. */
export type ParameterTarget=0|1|2
export const SINGLE_DATA_BYTES=80,DUAL_DATA_BYTES=142

const byte=(v:number,what:string,max=127)=>{if(!Number.isInteger(v)||v<0||v>max)throw Error(`${what} hors limites`);return v}
const header=(device:number)=>[0xf0,...TC_ID,byte(device,'Device ID'),M3000_MODEL]
const u14=(n:number)=>[(n>>7)&0x7f,n&0x7f]
const presetRange=(kind:PresetKind)=>kind===2?512:1024

export function presetAddress(kind:PresetKind,preset:number){
 if(![0,1,2].includes(kind))throw Error('Type de preset invalide')
 if(!Number.isInteger(preset)||preset<0||preset>presetRange(kind))throw Error('Numéro de preset hors des plages documentées')
 return preset
}
/** Bank and slot of a SysEx preset number (p.1). The populated count per bank comes from the manual, not from here. */
export function describePreset(kind:PresetKind,preset:number):{bank:'edit'|'factory'|'user'|'card'|'snapshot';slot:number}{
 presetAddress(kind,preset)
 if(preset===0)return {bank:'edit',slot:0}
 const ranges=kind===2?[['factory',1,128],['user',129,256],['snapshot',257,384],['card',385,512]]:[['factory',1,512],['user',513,768],['card',769,1024]]
 const r=ranges.find(([,a,b])=>preset>=(a as number)&&preset<=(b as number))!
 return {bank:r[0] as 'factory',slot:preset-(r[1] as number)+1}
}

// Requests (read-only per the specification; confirm absence of side effects on hardware before use).
export function presetRequest(device:number,kind:PresetKind,preset:number){return Uint8Array.from([...header(device),MessageType.presetRequest,kind,...u14(presetAddress(kind,preset)),0xf7])}
export function parameterRequest(device:number,target:ParameterTarget,baseId:number,count:number){
 if(![0,1,2].includes(target))throw Error('Cible de paramètre invalide')
 byte(baseId,'Identifiant de paramètre');if(!Number.isInteger(count)||count<1||count>64||baseId+count-1>127)throw Error('Nombre de paramètres invalide')
 return Uint8Array.from([...header(device),MessageType.parameterRequest,target,baseId,count,0xf7])
}

/** Signed 14-bit values, MSB first (p.3). Two's complement over 14 bits is an inference (dossier §4): verify on hardware. */
export function encodeSigned14(value:number){
 if(!Number.isInteger(value)||value<-8192||value>8191)throw Error('Valeur hors du format 14 bits signé')
 return u14(value<0?value+0x4000:value)
}
export function decodeSigned14(msb:number,lsb:number){byte(msb,'Octet');byte(lsb,'Octet');const u=(msb<<7)|lsb;return u>=0x2000?u-0x4000:u}

/** Parameter Data always acts on the edit buffer (p.3). No acknowledgment is documented. */
export function parameterData(device:number,target:ParameterTarget,baseId:number,values:readonly number[]){
 if(![0,1,2].includes(target))throw Error('Cible de paramètre invalide')
 byte(baseId,'Identifiant de paramètre');if(!values.length||values.length>64||baseId+values.length-1>127)throw Error('Nombre de valeurs invalide')
 return Uint8Array.from([...header(device),MessageType.parameterData,target,baseId,...values.flatMap(encodeSigned14),0xf7])
}

export interface PresetData {type:'preset-data';device:number;kind:PresetKind;preset:number;data:Uint8Array;checksum:{byte:number;decodedSumMatches:boolean;nibbleSumMatches:boolean};raw:Uint8Array}
export interface ParameterDataMessage {type:'parameter-data';device:number;target:ParameterTarget;baseId:number;values:number[];raw:Uint8Array}
export interface RequestMessage {type:'preset-request'|'parameter-request'|'bank-request'|'preset-recall';device:number;raw:Uint8Array}
export type M3000Message=PresetData|ParameterDataMessage|RequestMessage

const isM3000=(b:ArrayLike<number>)=>b.length>=8&&b[0]===0xf0&&b[1]===0&&b[2]===0x20&&b[3]===0x1f&&b[5]===M3000_MODEL&&b[b.length-1]===0xf7&&Array.from(b).slice(1,-1).every(v=>Number.isInteger(v)&&v>=0&&v<=127)

/** Classifies one complete SysEx frame. Returns null for anything that is not an exact M3000 message. */
export function parseMessage(input:ArrayLike<number>):M3000Message|null{
 const b=Uint8Array.from(input as ArrayLike<number>)
 if(!isM3000(b))return null
 const device=b[4],type=b[6]
 if(type===MessageType.presetData){
  if(b.length<12||![0,1,2].includes(b[7]))return null
  const kind=b[7] as PresetKind,size=kind===2?DUAL_DATA_BYTES:SINGLE_DATA_BYTES
  if(b.length!==10+2*size+2)return null
  const preset=(b[8]<<7)|b[9];if(preset>presetRange(kind))return null
  const data=new Uint8Array(size);let decoded=0,nibbles=0
  for(let i=0;i<size;i++){const hi=b[10+2*i],lo=b[11+2*i];if(hi>15||lo>15)return null;data[i]=(hi<<4)|lo;decoded+=data[i];nibbles+=hi+lo}
  const ck=b[10+2*size]
  // p.1 wording "negative sum of all bytes in the dump": decoded-sum reading is the likely one (dossier §9 C17).
  return {type:'preset-data',device,kind,preset,data,checksum:{byte:ck,decodedSumMatches:((-decoded)&0x7f)===ck,nibbleSumMatches:((-nibbles)&0x7f)===ck},raw:b}
 }
 if(type===MessageType.parameterData){
  if(b.length<12||(b.length-10)%2!==0||![0,1,2].includes(b[7]))return null
  const values:number[]=[];for(let i=9;i<b.length-1;i+=2)values.push(decodeSigned14(b[i],b[i+1]))
  if(b[8]+values.length-1>127)return null
  return {type:'parameter-data',device,target:b[7] as ParameterTarget,baseId:b[8],values,raw:b}
 }
 if(type===MessageType.presetRequest&&b.length===11&&[0,1,2].includes(b[7])&&((b[8]<<7)|b[9])<=presetRange(b[7] as PresetKind))return {type:'preset-request',device,raw:b}
 if(type===MessageType.presetRecall&&b.length===11&&[0,1,2].includes(b[7]))return {type:'preset-recall',device,raw:b}
 if(type===MessageType.parameterRequest&&b.length===11&&[0,1,2].includes(b[7])&&b[9]>=1&&b[8]+b[9]-1<=127)return {type:'parameter-request',device,raw:b}
 if(type===MessageType.bankRequest&&b.length===9&&[0,1,2].includes(b[7]))return {type:'bank-request',device,raw:b}
 return null
}

/** Engine parameters known for an identifier, across every algorithm table (the validator is stateless). */
const engineRows=(id:number):M3000Param[]=>m3000Map.tables.flatMap(t=>t.params.filter(p=>p.id===id))

// ---- Broker validators. Hardware use stays disabled by module policy in this release. ----
/** Documented reads only: Preset Request (45) and Parameter Request (47). Bank Request is excluded (no end marker). */
export function acceptsQuery(bytes:readonly number[]):boolean{
 const m=parseMessage(bytes);return !!m&&(m.type==='preset-request'||m.type==='parameter-request')
}
/** One engine Parameter Data value within the documented range of a known engine parameter. No system, dump or recall. */
export function acceptsEditBuffer(bytes:readonly number[]):boolean{
 const m=parseMessage(bytes)
 if(!m||m.type!=='parameter-data'||m.target===2||m.values.length!==1)return false
 return engineRows(m.baseId).some(p=>m.values[0]>=p.min&&m.values[0]<=p.max)
}

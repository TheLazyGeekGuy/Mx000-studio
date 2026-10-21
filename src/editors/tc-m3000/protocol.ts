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
/** Data bytes per Preset Data: single 80 (p.3, confirmed on hardware). Dual: the specification prints 142, the unit
 * (identity version 2.04) sends 144 — both are accepted; 144 is what is built. Hardware session 2026-10-20. */
export const SINGLE_DATA_BYTES=80,DUAL_DATA_BYTES=144,DUAL_DATA_BYTES_SPEC=142

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

/** Signed 14-bit values, MSB first (p.3); two's complement over 14 bits, confirmed on hardware (−3 → 7F 7D read back). */
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
  const kind=b[7] as PresetKind,size=(b.length-12)/2
  if(!(kind===2?[DUAL_DATA_BYTES,DUAL_DATA_BYTES_SPEC]:[SINGLE_DATA_BYTES]).includes(size))return null
  const preset=(b[8]<<7)|b[9];if(preset>presetRange(kind))return null
  const data=new Uint8Array(size);let decoded=0,nibbles=0
  for(let i=0;i<size;i++){const hi=b[10+2*i],lo=b[11+2*i];if(hi>15||lo>15)return null;data[i]=(hi<<4)|lo;decoded+=data[i];nibbles+=hi+lo}
  const ck=b[10+2*size]
  // p.1 "negative sum of all bytes in the dump": the decoded-byte sum, confirmed on 1 100+ frames from the unit (C17).
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

// ---- Identity (universal Non-Realtime Identity Request; answered by the unit, not in the TC specification) ----
export const IDENTITY_REQUEST=Object.freeze([0xf0,0x7e,0x7f,0x06,0x01,0xf7])
export interface Identity {device:number;manufacturer:'tc-electronic'|'other';manufacturerId:number[];family:number;model:number;version:string;raw:number[]}
/** Identity Reply F0 7E dd 06 02 <manufacturer> <family LSB MSB> <model LSB MSB> <version ×4> F7. Observed from the
 * M3000: family 0x0042 (= its SysEx model byte), model 0, version 00 00 02 04 = software 2.04. */
export function parseIdentity(input:ArrayLike<number>):Identity|null{
 const b=Array.from(input)
 if(b.length<15||b[0]!==0xf0||b[1]!==0x7e||b[3]!==0x06||b[4]!==0x02||b[b.length-1]!==0xf7||b.slice(1,-1).some(v=>!Number.isInteger(v)||v<0||v>127))return null
 const wide=b[5]===0,manufacturerId=wide?b.slice(5,8):[b[5]],at=5+manufacturerId.length
 if(b.length!==at+4+4+1)return null
 const v=b.slice(at+4,at+8),version=v[0]||v[1]?v.join('.'):`${v[2]}.${String(v[3]).padStart(2,'0')}`
 return {device:b[2],manufacturer:manufacturerId.join(' ')==='0 32 31'?'tc-electronic':'other',manufacturerId,family:b[at]|(b[at+1]<<7),model:b[at+2]|(b[at+3]<<7),version,raw:b}
}
export const isM3000Identity=(id:Identity|null)=>!!id&&id.manufacturer==='tc-electronic'&&id.family===M3000_MODEL
export const TC_FAMILY_NAMES:Readonly<Record<number,string>>={0x40:'FireworX',0x42:'M3000',0x44:'M-One',0x45:'D-Two'}

export function recallRequest(device:number,kind:PresetKind,preset:number){
 if(presetAddress(kind,preset)===0)throw Error('Le buffer d’édition ne se rappelle pas')
 return Uint8Array.from([...header(device),MessageType.presetRecall,kind,...u14(preset),0xf7])
}
export function bankRequest(device:number,kind:PresetKind){if(![0,1,2].includes(kind))throw Error('Banque invalide');return Uint8Array.from([...header(device),MessageType.bankRequest,kind,0xf7])}

// ---- Preset Data header (layout not published; observed on the unit, 2026-10-20, 1 104 frames) ----
const s16=(d:Uint8Array,i:number)=>{const v=(d[i]<<8)|d[i+1];return v&0x8000?v-0x10000:v}
// Names are space- or NUL-padded (both seen on factory presets): the name ends at the first NUL.
const text=(d:Uint8Array,from:number,to:number)=>{const raw=Array.from(d.slice(from,to)),end=raw.indexOf(0);return String.fromCharCode(...(end<0?raw:raw.slice(0,end)).map(v=>v>=32&&v<127?v:63)).trimEnd()}
export interface PresetHeader {index:number;name:string;algorithms:number[];sources:(number|null)[];routing:number|null}
/** Single: [0:2] own index (0-based; −10 when loaded from a combined preset), [2:22] name, [22:24] algorithm.
 * Dual: [0:2] index, [2:22] name, [22:26] algorithms 1 and 2, [26:30] source single presets of engines 1 and 2
 * (0-based; negative = none), [30] routing (0 Serial … 5 Pre-glide). Engine blocks follow; not decoded. */
export function decodePresetHeader(kind:PresetKind,data:Uint8Array):PresetHeader{
 if(kind===2){const src=(v:number)=>v>=0?v+1:null
  return {index:s16(data,0),name:text(data,2,22),algorithms:[s16(data,22),s16(data,24)],sources:[src(s16(data,26)),src(s16(data,28))],routing:data[30]<=5?data[30]:null}}
 return {index:s16(data,0),name:text(data,2,22),algorithms:[s16(data,22)],sources:[],routing:null}
}

// ---- Preset Data upload (edit buffer or user memory) ----
/** User memory of the unit (manual: up to 250 RAM singles, 50 RAM combined). Card and snapshot slots are not written. */
export const USER_SINGLES={first:513,last:762} as const,USER_COMBINED={first:129,last:178} as const
export const isUserSlot=(kind:PresetKind,n:number)=>kind===2?n>=USER_COMBINED.first&&n<=USER_COMBINED.last:n>=USER_SINGLES.first&&n<=USER_SINGLES.last
/** Builds a Preset Data frame (p.3): data bytes as nibbles, high first, checksum (−Σ data) & 0x7F (confirmed). */
export function presetDataFrame(device:number,kind:PresetKind,preset:number,data:ArrayLike<number>){
 const size=data.length;if(!(kind===2?[DUAL_DATA_BYTES,DUAL_DATA_BYTES_SPEC]:[SINGLE_DATA_BYTES]).includes(size))throw Error('Taille de Preset Data invalide')
 presetAddress(kind,preset);let sum=0;const wire:number[]=[]
 for(let i=0;i<size;i++){const v=data[i];if(!Number.isInteger(v)||v<0||v>255)throw Error('Octet de preset invalide');wire.push(v>>4,v&15);sum+=v}
 return Uint8Array.from([...header(device),MessageType.presetData,kind,...u14(preset),...wire,(-sum)&0x7f,0xf7])
}
/** Returns a copy of decoded preset data with a new name (20 characters, space padded, printable ASCII). */
export function withName(data:Uint8Array,name:string){
 const out=Uint8Array.from(data),text=name.normalize('NFKD').replace(/[^\x20-\x7e]/g,'').slice(0,20).padEnd(20,' ')
 for(let i=0;i<20;i++)out[2+i]=text.charCodeAt(i);return out
}
const exactPresetData=(bytes:readonly number[])=>{const m=parseMessage(bytes);return m?.type==='preset-data'&&m.checksum.decodedSumMatches?m:null}

// ---- Broker validators ----
/** Reads: Identity Request, Preset Request (45), Parameter Request (47) and Bank Request (40, burst of stored presets). */
export function acceptsQuery(bytes:readonly number[]):boolean{
 if(bytes.length===6&&bytes.every((v,i)=>v===IDENTITY_REQUEST[i]))return true
 const m=parseMessage(bytes);return !!m&&(m.type==='preset-request'||m.type==='parameter-request'||m.type==='bank-request')
}
/** Volatile edit-buffer writes: one engine Parameter Data value within the range of a known engine parameter, or a
 * Preset Recall of a documented preset number (replaces the running preset; never stores). No system, no dump. */
export function acceptsEditBuffer(bytes:readonly number[]):boolean{
 const m=parseMessage(bytes)
 // Whole preset into an edit buffer (preset 0): volatile, like a recall.
 const upload=exactPresetData(bytes);if(upload)return upload.preset===0
 if(m?.type==='preset-recall'){const b=m.raw,kind=b[7] as PresetKind,n=(b[8]<<7)|b[9];return n>=1&&n<=presetRange(kind)}
 // The routing system parameter (34, 0–5) is admitted: it is part of the running preset (verified with read-back).
 // So are Dynamic Morphing mode, speed and threshold (19–21): stored in the combined preset (bytes 32, 33, 35, decoded on
 // the unit). Nothing else of the system page (I/O, clock, MIDI, levels, bypass, tap) is ever admitted.
 if(m?.type==='parameter-data'&&m.target===2){const r=({34:[0,5],19:[0,2],20:[0,2],21:[-40,-6]} as Record<number,[number,number]>)[m.baseId]
  return !!r&&m.values.length===1&&m.values[0]>=r[0]&&m.values[0]<=r[1]}
 if(!m||m.type!=='parameter-data'||m.values.length!==1)return false
 return engineRows(m.baseId).some(p=>m.values[0]>=p.min&&m.values[0]<=p.max)
}
/** Persistent write: a checksum-valid Preset Data frame addressed to a user memory slot only (never ROM, card or
 * snapshot, never the edit buffer). The session reads the destination before and the slot back after. */
export function acceptsPresetStore(bytes:readonly number[]):boolean{const m=exactPresetData(bytes);return !!m&&isUserSlot(m.kind,m.preset)}

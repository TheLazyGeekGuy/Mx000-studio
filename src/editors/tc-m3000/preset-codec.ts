// M3000 Preset Data engine blocks ⇄ editor engine state. Pure; no ports, DOM or storage.
// The layout is not published: it was decoded on the owner's unit (SW 2.04, 2026-10-20) and is generated into
// engine-layout.ts (evidence: docs/instruments/tc-m3000/ENGINE-LAYOUT.json). Single Preset Data: header [0:26], engine
// block at offsets 26–79. Combined Preset Data: header [0:36], engine 1 block at single offset + 10 (36–89), engine 2
// block at single offset + 64 (90–143) — checked on 15 combined presets, 666 values, no mismatch.
// Bytes no parameter owns are kept from the base preset; only an algorithm change refills them from a template.
import {ENGINE_LAYOUT,ENGINE_TEMPLATE,type EngineField} from './engine-layout'
import {DUAL_DATA_BYTES,DUAL_DATA_BYTES_SPEC,SINGLE_DATA_BYTES,decodePresetHeader,withName,type PresetKind} from './protocol'
import {MORPH_RANGES,algorithmById,paramsFor,type EngineIndex,type EngineState,type M3000State,type Morph} from './model'

const BLOCK_FIRST=26,BLOCK_LAST=79
const shiftOf=(kind:PresetKind,engine:EngineIndex)=>kind===2?(engine===0?10:64):0
export const hasLayout=(algorithm:number)=>!!ENGINE_LAYOUT[algorithm]&&!!algorithmById(algorithm)

const read=(d:ArrayLike<number>,f:EngineField,shift:number)=>{const i=f.offset+shift
 switch(f.encoding){case 'u8':return d[i];case 's8':return d[i]&0x80?d[i]-256:d[i];case 'u16':return (d[i]<<8)|d[i+1];default:{const v=(d[i]<<8)|d[i+1];return v&0x8000?v-0x10000:v}}}
const write=(d:Uint8Array,f:EngineField,shift:number,v:number)=>{const i=f.offset+shift
 if(f.encoding==='u8'||f.encoding==='s8')d[i]=v&0xff;else{d[i]=(v>>8)&0xff;d[i+1]=v&0xff}}
const u16=(d:ArrayLike<number>,i:number)=>(d[i]<<8)|d[i+1]
const checkSize=(kind:PresetKind,data:ArrayLike<number>)=>{if(!(kind===2?[DUAL_DATA_BYTES,DUAL_DATA_BYTES_SPEC]:[SINGLE_DATA_BYTES]).includes(data.length))throw Error('Taille de Preset Data invalide')}

export interface Clamp {id:number;name:string;stored:number;value:number}
export interface DecodedEngine {engine:EngineState;clamped:Clamp[]}
/** Algorithm stored for an engine (single: [22:24]; combined: [22:24] engine 1, [24:26] engine 2). */
export const storedAlgorithm=(kind:PresetKind,data:ArrayLike<number>,engine:EngineIndex)=>u16(data,kind===2?22+2*engine:22)

/** Engine values of a stored preset. Factory presets hold a few values outside the published ranges (e.g. Hi Cross
 * 129 for a range starting at 136): they are brought into range and reported. Null when the layout is unknown. */
export function decodeEngine(kind:PresetKind,data:ArrayLike<number>,engine:EngineIndex):DecodedEngine|null{
 checkSize(kind,data);if(kind!==2&&engine===1)throw Error('Un preset simple n’a qu’un moteur')
 const algorithm=storedAlgorithm(kind,data,engine);if(!hasLayout(algorithm))return null
 const shift=shiftOf(kind,engine),fields=new Map(ENGINE_LAYOUT[algorithm].map(f=>[f.id,f])),values:Record<string,number>={},clamped:Clamp[]=[]
 for(const p of paramsFor(algorithm)){const f=fields.get(p.id)!,stored=read(data,f,shift),value=Math.min(p.max,Math.max(p.min,stored))
  if(value!==stored)clamped.push({id:p.id,name:p.name,stored,value});values[String(p.id)]=value}
 return {engine:{algorithm,values},clamped}
}

export interface DecodedPreset {name:string;type:'single'|'dual';routing:number|null;morph:Morph|null;engines:[DecodedEngine|null,DecodedEngine|null];algorithms:number[]}
/** Combined header (decoded on the unit by writing system parameters 19–21, 2026-10-20; 20 presets checked): byte 32 =
 * Dynamic Morphing mode, 33 = speed, 35 = threshold (signed). Bytes 31 and 34 hold 0 and 1 on every factory preset. Glide
 * and tap parameters (22–25) are not stored in the preset. Out-of-range bytes give null (the draft keeps its own). */
const MORPH_AT={mode:32,speed:33,threshold:35} as const
export function decodeMorph(data:ArrayLike<number>):Morph|null{
 const m={} as Morph
 for(const k of ['mode','speed','threshold'] as const){const b=data[MORPH_AT[k]],v=k==='threshold'&&b&0x80?b-256:b,[min,max]=MORPH_RANGES[k];if(v<min||v>max)return null;m[k]=v}
 return m
}
export function decodePreset(kind:PresetKind,data:Uint8Array):DecodedPreset{
 checkSize(kind,data);const h=decodePresetHeader(kind,data)
 return {name:h.name,type:kind===2?'dual':'single',routing:h.routing,morph:kind===2?decodeMorph(data):null,algorithms:h.algorithms,engines:[decodeEngine(kind,data,0),kind===2?decodeEngine(kind,data,1):null]}
}

/** Writes an engine into a copy of the data: algorithm word, then every parameter. A block that held another algorithm
 * is first refilled from that algorithm's template (bytes of the old algorithm would otherwise remain). */
export function encodeEngine(kind:PresetKind,base:Uint8Array,engine:EngineIndex,state:EngineState):Uint8Array{
 checkSize(kind,base);if(kind!==2&&engine===1)throw Error('Un preset simple n’a qu’un moteur')
 if(!hasLayout(state.algorithm))throw Error(`Algorithme « ${algorithmById(state.algorithm)?.name??state.algorithm} » : disposition du preset inconnue`)
 const d=Uint8Array.from(base),shift=shiftOf(kind,engine),at=kind===2?22+2*engine:22
 if(u16(d,at)!==state.algorithm){const t=ENGINE_TEMPLATE[state.algorithm];for(let i=BLOCK_FIRST;i<=BLOCK_LAST;i++)d[i+shift]=t[i-BLOCK_FIRST]}
 d[at]=(state.algorithm>>8)&0xff;d[at+1]=state.algorithm&0xff
 const fields=new Map(ENGINE_LAYOUT[state.algorithm].map(f=>[f.id,f]))
 for(const p of paramsFor(state.algorithm)){const v=state.values[String(p.id)];if(!Number.isInteger(v)||v<p.min||v>p.max)throw Error(`Valeur hors domaine : ${p.name}`);write(d,fields.get(p.id)!,shift,v)}
 return d
}

/** A fresh preset of the requested kind: single header bytes 24–25 = 0, 1 (all 500 factory singles); combined: no source
 * single (−10, what the unit writes back after a P0 upload), header bytes 31–35 as the most common factory values
 * (0, 0, 0, 1, −6). */
export function blankPreset(kind:PresetKind):Uint8Array{
 if(kind!==2){const d=new Uint8Array(SINGLE_DATA_BYTES);d[25]=1;return d}
 const d=new Uint8Array(DUAL_DATA_BYTES);d[26]=d[28]=0xff;d[27]=d[29]=0xf6;d[34]=1;d[35]=250;return d
}

/** The whole editor draft as Preset Data for the edit buffer (P0). A single draft uses engine 1; a combined draft both
 * engines and the routing. `base` (decoded data of the same kind) keeps the bytes the editor does not model. */
export function encodeDraft(state:M3000State,base?:Uint8Array|null):{kind:PresetKind;data:Uint8Array}{
 const kind:PresetKind=state.type==='dual'?2:0,kept=base??(state.base?.kind===kind?Uint8Array.from(state.base.data):null)
 let d=kept?Uint8Array.from(kept):blankPreset(kind);checkSize(kind,d)
 d=withName(d,state.name.slice(0,20))
 d=encodeEngine(kind,d,0,state.engines[0])
 if(kind===2){d=encodeEngine(kind,d,1,state.engines[1]);d[30]=state.routing;d[MORPH_AT.mode]=state.morph.mode;d[MORPH_AT.speed]=state.morph.speed;d[MORPH_AT.threshold]=state.morph.threshold&0xff}
 return {kind,data:d}
}

/** Opens stored Preset Data as the M3000 draft: name, single/combined, routing (combined) and every engine whose
 * layout is known; an engine with an unknown algorithm keeps the current draft's engine and is reported. */
/** Own stored number of a preset (header word + 1), null for an edit buffer copy. */
const ownNumber=(kind:PresetKind,data:Uint8Array)=>{const i=decodePresetHeader(kind,data).index;return i>=0&&i<768?i+1:null}
export function stateFromPreset(current:M3000State,kind:PresetKind,data:Uint8Array):{state:M3000State;notes:string[]}{
 const p=decodePreset(kind,data),notes:string[]=[],engines=[...current.engines] as M3000State['engines']
 p.engines.forEach((e,i)=>{if(kind!==2&&i===1)return
  if(!e){notes.push(`moteur ${i+1} : algorithme ${p.algorithms[i]} sans disposition connue, moteur du brouillon conservé`);return}
  engines[i]=e.engine;for(const c of e.clamped)notes.push(`moteur ${i+1} · ${c.name} = ${c.stored} enregistré, hors de la plage acceptée : ramené à ${c.value}`)})
 const name=p.name.slice(0,40)||current.name
 return {state:{...current,name,type:p.type,routing:kind===2&&p.routing!==null?p.routing:current.routing,morph:p.morph??current.morph,engines,engineSources:kind===2?undefined:[ownNumber(kind,data),null],base:{kind:kind===2?2:0,data:Array.from(data)}},notes}
}

// Single presets offered on each engine page (« Preset du moteur »): the unit's reads kept in the workspace, completed by
// the local library's copies (e.g. a full backup). One entry per stored address; a read from the unit wins over a copy.
import {useEffect,useMemo,useState} from 'react'
import {openLibraryStorage} from '../../library/storage'
import {libraryEntries,describeFrame,algorithmNames,type LibraryEntry} from './librarian-model'
import type {M3000State} from './model'
import {parseMessage,presetDataFrame} from './protocol'
import {decodeEngine} from './preset-codec'

export interface EnginePreset {number:number;label:string;name:string;frame:number[];origin:'device'|'library'}
const bankLabel=(n:number)=>n>=513?`Util. ${n-512}`:`Usine ${n}`
export function singlePresetOptions(state:M3000State,library:readonly LibraryEntry[]):EnginePreset[]{
 const byNumber=new Map<number,EnginePreset>()
 const add=(frame:number[],origin:EnginePreset['origin'])=>{const d=describeFrame(frame);if(!d||d.kind===2||d.number<1||d.number>768||(origin==='library'&&byNumber.has(d.number)))return
  byNumber.set(d.number,{number:d.number,name:d.name,frame,origin,label:`${bankLabel(d.number)} · ${d.name} (${algorithmNames(d.algorithms)})${origin==='library'?' · copie locale':''}`})}
 for(const o of state.originals)if(o.kind!==2)add(o.bytes,'device')
 for(const e of library)add(e.frame,'library')
 return [...byNumber.values()].sort((a,b)=>a.number-b.number)
}
/** Stored combined presets by number (unit reads first, then library copies): their header names the source singles. */
export function combinedFrames(state:M3000State,library:readonly LibraryEntry[]){
 const m=new Map<number,number[]>()
 for(const o of state.originals)if(o.kind===2&&o.preset>0)m.set(o.preset,o.bytes)
 for(const e of library){const d=describeFrame(e.frame);if(d?.kind===2&&d.number>0&&!m.has(d.number))m.set(d.number,e.frame)}
 return m
}
/** Reloads the library copies when `revision` changes (the librarian was closed). */
export function useSinglePresets(state:M3000State,revision:number){
 const [library,setLibrary]=useState<LibraryEntry[]>([])
 useEffect(()=>{let cancelled=false,close=()=>{}
  openLibraryStorage().then(storage=>{close=()=>storage.close();return storage.list()}).then(list=>{if(!cancelled)setLibrary(libraryEntries(list))}).catch(()=>{/* no local library: unit reads only */}).finally(()=>{if(cancelled)close()})
  return()=>{cancelled=true;close()}},[revision])
 return useMemo(()=>({singles:singlePresetOptions(state,library),combined:combinedFrames(state,library)}),[state.originals,library])
}

/** Where an engine of a combined preset comes from: the stored combined preset's header names a source single per
 * engine (the edit buffer itself carries −10 there); its values are compared with the draft's engine. */
export interface EngineOrigin {combined:number;source:number|null;preset:EnginePreset|null;changed:number|null;sameAlgorithm:boolean}
export function engineOrigin(state:M3000State,runningCombined:number|null,combined:ReadonlyMap<number,number[]>,singles:readonly EnginePreset[],engine:0|1):EngineOrigin|null{
 if(state.type!=='dual')return null
 const own=state.base?.kind===2?(((state.base.data[0]<<8)|state.base.data[1])<<16>>16)+1:0
 const number=runningCombined??(own>0?own:null);if(!number)return null
 const frame=combined.get(number)??(own===number&&state.base?Array.from(presetDataBytes(state.base.data)):null)
 const header=frame?describeFrame(frame):null,source=header?.sources[engine]??null
 const preset=source?singles.find(p=>p.number===source)??null:null
 let changed:number|null=null,sameAlgorithm=false
 if(preset){const m=parseMessage(preset.frame);if(m?.type==='preset-data'){const d=decodeEngine(0,m.data,0);if(d){sameAlgorithm=d.engine.algorithm===state.engines[engine].algorithm
  if(sameAlgorithm)changed=Object.entries(d.engine.values).filter(([id,v])=>state.engines[engine].values[id]!==v).length}}}
 return {combined:number,source,preset,changed,sameAlgorithm}
}
// A combined base kept as decoded data → a Preset Data frame, so its header can be read like a stored one.
const presetDataBytes=(data:readonly number[])=>presetDataFrame(0,2,1,Uint8Array.from(data))

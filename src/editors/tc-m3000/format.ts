// Display formatting from the manual-based display map (docs/instruments/tc-m3000/DISPLAY-MAP.json, merged into
// parameter-map.ts). Only 'confirmed' linear and list mappings are applied; anything else shows the raw SysEx value,
// labelled raw. Endpoint-only tables (exact:false) show their printed anchors, never an interpolated value.
import type {M3000Display} from './parameter-map'

export interface Formattable {name:string;min:number|null;max:number|null;display:M3000Display|null}
type Scale=Record<string,unknown>
const shortName=(p:Formattable)=>p.name.replace(/^MIDI_/,'').replace(/_/g,' ').toLowerCase().replace(/(^|\s)\S/g,c=>c.toUpperCase())
export const parameterLabel=(p:Formattable,language='fr')=>(language==='fr'?p.display?.labelFr:null)??p.display?.label??shortName(p)
const confirmed=(p:Formattable):Scale|null=>p.display?.status==='confirmed'?p.display.scale as Scale:null
const listOf=(s:Scale,language:string)=>(language==='fr'&&Array.isArray(s.labels_fr)?s.labels_fr:s.labels) as unknown[]
const listBase=(p:Formattable,s:Scale)=>Number.isInteger(s.rawStart)?s.rawStart as number:Number.isInteger(s.first)?s.first as number:(p.min??0)
/** True when every raw value of the parameter has a confirmed human rendering. */
export const hasConfirmedDisplay=(p:Formattable)=>{const s=confirmed(p);return s?.kind==='linear'||(s?.kind==='list'&&Array.isArray(s.labels))}
/** Labels printed by the manual whose value order is not printed (range slot, offset inferred): shown, flagged as presumed. */
export const orderPresumed=(p:Formattable)=>{const s=confirmed(p);return s?.kind==='list'&&/range slot|inferen|presum/i.test(String(s.indexOrder??''))}
/** Printed endpoints of a confirmed endpoint-only table, e.g. "0 = 20 Hz … 192 = 5 kHz". */
export function anchorHint(p:Formattable):string|null{
 const s=confirmed(p);if(s?.kind!=='table'||!Array.isArray(s.anchors))return null
 return (s.anchors as [number,string][]).map(([raw,label])=>`${raw} = ${label}`).join(' … ')
}

function round(value:number,decimals:number){const f=10**decimals;return Math.round(value*f)/f}
// Units as the map records them (manual wording) → as shown. Ratios print as a multiplier prefix (×0,50).
const RATIO=/^x\b/i,UNIT:Record<string,string>={degree:'°',octave:'oct'}
const shownUnit=(unit:string|null|undefined)=>!unit||RATIO.test(unit)?null:UNIT[unit]??unit
const withUnit=(number:string,unit:string|null|undefined)=>RATIO.test(unit??'')?`×${number}`:shownUnit(unit)===null?number:shownUnit(unit)==='°'?`${number}°`:`${number} ${shownUnit(unit)}`
/** Human value for the raw SysEx value, or the raw value when the manual mapping is not confirmed. */
export function formatValue(p:Formattable,raw:number,language='fr'):string{
 const s=confirmed(p);if(!s)return `${raw}`
 const unit=shownUnit(p.display?.unit)?` ${shownUnit(p.display?.unit)}`:''
 if(s.kind==='list'&&Array.isArray(s.labels)){const label=listOf(s,language)[raw-listBase(p,s)];return typeof label==='string'?label:`${raw}`}
 if(s.kind==='table'&&Array.isArray(s.anchors)){const hit=(s.anchors as [number,string][]).find(([at])=>at===raw);return hit?hit[1]:`${raw}`}
 if(s.kind==='linear'){
  const factor=typeof s.factor==='number'?s.factor:1,offset=typeof s.offset==='number'?s.offset:0,decimals=typeof s.decimals==='number'?s.decimals:Math.max(0,-Math.floor(Math.log10(Math.abs(factor)||1)))
  const value=round(raw*factor+offset,decimals)
  return withUnit(language==='fr'?value.toLocaleString('fr-FR',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):value.toFixed(decimals),p.display?.unit)
 }
 return `${raw}`
}
/** Inverse of a confirmed linear or list mapping for typed entry; other kinds accept raw integers only. */
export function parseEntry(p:Formattable,text:string):number{
 const t=text.trim().replace(',','.'),s=confirmed(p)
 let raw:number
 if(s?.kind==='list'&&Array.isArray(s.labels)){
  const wanted=t.toLowerCase(),match=(l:unknown[])=>l.findIndex(v=>typeof v==='string'&&v.toLowerCase()===wanted)
  const i=[listOf(s,'fr'),s.labels as unknown[]].map(match).find(n=>n>=0)
  raw=i===undefined?Number(t):listBase(p,s)+i
 }else if(s?.kind==='linear'){
  const unit=p.display?.unit,ratio=RATIO.test(unit??''),number=ratio?t.replace(/^[×x]\s*/i,''):t
  const m=/^([+-]?\d+(?:\.\d+)?)\s*([^\d\s].*)?$/.exec(number);if(!m)throw Error('Valeur numérique attendue')
  const typed=m[2]?.trim().toLowerCase(),accepted=[unit,shownUnit(unit)].filter(Boolean).map(u=>u!.toLowerCase())
  if(typed&&(ratio||!accepted.includes(typed)))throw Error(ratio?'Multiplicateur attendu (ex. ×0,5)':`Unité attendue : ${shownUnit(unit)??'aucune'}`)
  const factor=typeof s.factor==='number'?s.factor:1,offset=typeof s.offset==='number'?s.offset:0;raw=Math.round((Number(m[1])-offset)/factor)
 }else raw=Number(t)
 if(!Number.isInteger(raw)||p.min===null||p.max===null||raw<p.min||raw>p.max)throw Error('Valeur hors du domaine du paramètre')
 return raw
}

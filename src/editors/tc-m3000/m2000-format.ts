// M2000 display: list labels and printed step grids come from the manuals; a parameter without a printed grid is
// edited as its raw 0–127 controller value. Printed ends are shown at CC 0 and 127; in between, a value in manual
// units is shown only for a linearly read unit, prefixed "≈" (scaling hypothesis); everything else stays raw.
import type {M2000Param} from './m2000-map'
import {nearestCc,shownValue} from './m2000-model'

const UNIT:Readonly<Record<string,string>>={deg:'°',degree:'°',octave:'oct'}
const rawUnit=(p:M2000Param)=>p.domain.kind==='steps'?p.domain.unit:p.domain.kind==='cc'?p.domain.printed?.unit??null:null
const unitOf=(p:M2000Param)=>{const u=rawUnit(p);return u?UNIT[u]??u:null}
export const m2000Label=(p:M2000Param,language='fr')=>(language==='fr'?p.labelFr:null)||p.label
/** Raw controller value everywhere except possibly at its printed ends. */
export const isRawCc=(p:M2000Param)=>p.domain.kind==='cc'&&!p.domain.printed?.interpolate
/** Shown in manual units through the linear scaling hypothesis. */
export const isAssumedScale=(p:M2000Param)=>p.domain.kind==='cc'&&!!p.domain.printed?.interpolate
const withUnit=(text:string,unit:string|null)=>unit===null?text:unit==='°'?`${text}°`:`${text} ${unit}`
const number=(v:number,decimals:number,language:string)=>language==='fr'?v.toLocaleString('fr-FR',{minimumFractionDigits:decimals,maximumFractionDigits:decimals}):v.toFixed(decimals)
/** Labels shown but their order (value ↔ label) is not printed as an ordered list or not confirmed. */
export const m2000OrderPresumed=(p:M2000Param)=>p.domain.kind==='list'&&p.status!=='confirmed'

export function formatM2000(p:M2000Param,step:number,language='fr'):string{
 const d=p.domain
 if(d.kind==='list')return (language==='fr'&&d.labelsFr?d.labelsFr:d.labels)[step]??`${step}`
 if(d.kind==='steps')return withUnit(number(shownValue(p,step)!.value,d.decimals,language),unitOf(p))
 const printed=d.printed
 if(printed&&step===0&&printed.minLabel)return printed.minLabel
 if(printed&&step===127&&printed.maxLabel)return printed.maxLabel
 const shown=shownValue(p,step);if(!shown)return `${step}`
 return `${shown.exact?'':'≈ '}${withUnit(number(shown.value,shown.exact&&Number.isInteger(shown.value)?0:printed!.decimals,language),unitOf(p))}`
}

export function parseM2000Entry(p:M2000Param,text:string):number{
 const t=text.trim().replace(',','.'),d=p.domain
 let step:number
 if(d.kind==='list'){
  const wanted=t.toLowerCase(),find=(l:readonly string[]|null)=>l?l.findIndex(v=>v.toLowerCase()===wanted):-1
  const i=[find(d.labelsFr),find(d.labels)].find(n=>n>=0);step=i===undefined?Number(t):i
 }else if(d.kind==='steps'){
  const m=/^([+-]?\d+(?:\.\d+)?)\s*([^\d\s].*)?$/.exec(t);if(!m)throw Error('Valeur numérique attendue')
  const unit=unitOf(p),typed=m[2]?.trim().toLowerCase()
  if(typed&&![unit,d.unit].filter(Boolean).map(u=>u!.toLowerCase()).includes(typed))throw Error(`Unité attendue : ${unit??'aucune'}`)
  const exact=(Number(m[1])-d.min)/d.step;step=Math.round(exact)
  if(Math.abs(exact-step)>1e-6)throw Error(`Pas de ${d.step.toLocaleString('fr-FR')}${unit?` ${unit}`:''} imprimé par le manuel`)
 }else{
  const printed=d.printed,typed=t.replace(/^[≈~]\s*/,'').toLowerCase(),end=(cc:0|127)=>[formatM2000(p,cc),formatM2000(p,cc,'en')].map(x=>x.toLowerCase().replace(',','.'))
  if(printed&&end(0).includes(typed))step=0
  else if(printed&&end(127).includes(typed))step=127
  else if(printed?.interpolate){
   // Shown in manual units: a typed number is read in those units, "cc 64" addresses the raw value.
   const cc=/^cc\s*(\d+)$/.exec(typed);if(cc)step=Number(cc[1])
   else{const m=/^([+-]?\d+(?:\.\d+)?)\s*([^\d\s].*)?$/.exec(typed);if(!m)throw Error('Valeur numérique attendue')
    if(m[2]&&![unitOf(p),rawUnit(p)].filter(Boolean).map(u=>u!.toLowerCase()).includes(m[2].trim()))throw Error(`Unité attendue : ${unitOf(p)}`)
    const v=Number(m[1]);if(v<printed.min!||v>printed.max!)throw Error('Valeur hors du domaine du paramètre');step=nearestCc(p,v)!}
  }else step=Number(typed.replace(/^cc\s*/,''))
 }
 if(!Number.isInteger(step)||step<0||step>d.max)throw Error('Valeur hors du domaine du paramètre')
 return step
}

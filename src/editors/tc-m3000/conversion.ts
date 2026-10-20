// Explicit M2000 ⇄ M3000 engine conversion through the documented correspondences
// (docs/instruments/tc-m2000/MAPPING-M2000-M3000.json). TC states that M2000 presets cannot be loaded into the
// M3000: this converts displayed values of algorithms judged comparable, parameter by parameter, and reports
// everything it could not carry. Values travel in display units (manual units); nothing is guessed.
import {m2000Map,type M2000MappingPair,type M2000MappingParam,type M2000Param} from './m2000-map'
import {m2000Algorithm,initialM2000Values,nearestCc,shownValue,type M2000Engine} from './m2000-model'
import {algorithmById,initialValues,paramsFor,type EngineState} from './model'
import type {M3000Param} from './parameter-map'

export interface ConversionReport {relation:string;converted:string[];hypotheses:string[];sameRange:string[];notCarried:string[];outOfRange:string[]}
/** Opt-in: a raw M2000 value (no printed scale) is carried at the same relative position of the M3000 range. It is
 * meaningful only if both parameters are the same with the same range, which no source states: reported apart. */
export interface ConversionOptions {assumeSameRange?:boolean}
// Rows naming the same parameter on both sides (confirmed or hypothesis), whatever their documented scale.
const usableForRange=(m:M2000MappingParam)=>m.m3000Id!==null&&m.conversion!=='list'&&(m.status==='confirmed'||m.status==='hypothesis')
/** Every documented M3000 counterpart of an M2000 algorithm, most closely related first (a reverb has several). */
const RANK:Readonly<Record<string,number>>={'documented-same':0,'documented-derived':1,'same-name-only':2,'similar-function':3,none:4}
export const pairsForM2000=(key:string)=>m2000Map.mapping.pairs.filter(p=>p.m2000===key&&p.m3000Algorithm!==null).sort((a,b)=>(RANK[a.relation]??9)-(RANK[b.relation]??9))
export const pairsForM3000=(algorithm:number)=>m2000Map.mapping.pairs.filter(p=>p.m3000Algorithm===algorithm)
const usable=(m:M2000MappingParam)=>m.m3000Id!==null&&m.conversion!=='none'&&(m.status==='confirmed'||m.status==='hypothesis')

// M3000 display ⇄ raw, only through a confirmed linear scale of the M3000 display map.
function m3000Linear(p:M3000Param){const d=p.display,s=d?.scale as Record<string,unknown>|undefined;return d?.status==='confirmed'&&s?.kind==='linear'?{factor:typeof s.factor==='number'?s.factor:1,offset:typeof s.offset==='number'?s.offset:0}:null}
const m3000Raw=(p:M3000Param,display:number)=>{const l=m3000Linear(p);return l?Math.round((display-l.offset)/l.factor):null}
const m3000Display=(p:M3000Param,raw:number)=>{const l=m3000Linear(p);return l?raw*l.factor+l.offset:null}

/** A converted value and whether it went through the M2000 CC scaling hypothesis (then reported as a hypothesis). */
type Converted={value:number;assumed:boolean}|null
function toM3000Value(m:M2000MappingParam,source:M2000Param,step:number,target:M3000Param):Converted{
 if(m.conversion==='list'){const hit=m.listMap?.find(([a])=>a===step);return hit?{value:hit[1],assumed:false}:null}
 const shown=shownValue(source,step);if(shown===null)return null
 const raw=m3000Raw(target,m.conversion==='identity'?shown.value:shown.value*(m.factor??1)+(m.offset??0))
 return raw===null?null:{value:raw,assumed:!shown.exact}
}
function toM2000Step(m:M2000MappingParam,target:M2000Param,raw:number,source:M3000Param):Converted{
 if(m.conversion==='list'){const hit=m.listMap?.find(([,b])=>b===raw);return hit?{value:hit[0],assumed:false}:null}
 const shown=m3000Display(source,raw);if(shown===null)return null
 const value=m.conversion==='identity'?shown:(shown-(m.offset??0))/(m.factor??1),d=target.domain
 // Nearest printed step; the caller rejects anything outside the M2000 range.
 if(d.kind==='steps')return {value:Math.round((value-d.min)/d.step),assumed:false}
 if(d.kind!=='cc'||!d.printed||d.printed.min===null||d.printed.max===null)return null
 if(value<d.printed.min)return {value:-1,assumed:false};if(value>d.printed.max)return {value:128,assumed:false}
 const cc=nearestCc(target,value);return cc===null?null:{value:cc,assumed:value!==d.printed.min&&value!==d.printed.max}
}

/** Converts one M2000 engine into an M3000 engine of the mapped algorithm, starting from M3000 local initial values. */
export function convertToM3000(engine:M2000Engine,m3000Algorithm?:number,options:ConversionOptions={}):{engine:EngineState;report:ConversionReport}{
 const pairs=pairsForM2000(engine.algorithm),pair=m3000Algorithm===undefined?pairs[0]:pairs.find(p=>p.m3000Algorithm===m3000Algorithm)
 if(!pair)throw Error('Aucun algorithme M3000 correspondant n’est documenté pour cet algorithme M2000')
 const algorithm=m2000Algorithm(engine.algorithm),targetParams=paramsFor(pair.m3000Algorithm!),values=initialValues(pair.m3000Algorithm!),report=emptyReport(pair)
 for(const source of algorithm.params){
  const m=pair.params.find(x=>x.m2000===source.key),target=m&&m.m3000Id!==null?targetParams.find(p=>p.id===m.m3000Id):undefined
  if(!m||!target){report.notCarried.push(source.label);continue}
  const converted=usable(m)?toM3000Value(m,source,engine.values[source.key],target):null
  if(converted===null){
   if(options.assumeSameRange&&usableForRange(m)&&source.domain.kind==='cc'){values[String(target.id)]=Math.round(target.min+engine.values[source.key]/127*(target.max-target.min));report.sameRange.push(source.label)}
   else report.notCarried.push(source.label)
   continue}
  if(converted.value<target.min||converted.value>target.max){report.outOfRange.push(source.label);continue}
  values[String(target.id)]=converted.value;(m.status==='confirmed'&&!converted.assumed?report.converted:report.hypotheses).push(source.label)
 }
 return {engine:{algorithm:pair.m3000Algorithm!,values},report}
}

/** Converts one M3000 engine into the M2000 algorithm mapped to it (first documented pair). */
export function convertToM2000(engine:EngineState,options:ConversionOptions={}):{engine:M2000Engine;report:ConversionReport}{
 const pair=pairsForM3000(engine.algorithm)[0];if(!pair)throw Error('Aucun algorithme M2000 correspondant n’est documenté pour cet algorithme M3000')
 const algorithm=m2000Algorithm(pair.m2000),sourceParams=paramsFor(engine.algorithm),values=initialM2000Values(pair.m2000),report=emptyReport(pair)
 for(const target of algorithm.params){
  const m=pair.params.find(x=>x.m2000===target.key),source=m&&m.m3000Id!==null?sourceParams.find(p=>p.id===m.m3000Id):undefined
  if(!m||!source){report.notCarried.push(target.label);continue}
  const converted=usable(m)?toM2000Step(m,target,engine.values[String(source.id)],source):null
  if(converted===null){
   if(options.assumeSameRange&&usableForRange(m)&&target.domain.kind==='cc'&&source.max>source.min){values[target.key]=Math.round((engine.values[String(source.id)]-source.min)/(source.max-source.min)*127);report.sameRange.push(target.label)}
   else report.notCarried.push(target.label)
   continue}
  if(converted.value<0||converted.value>target.domain.max){report.outOfRange.push(target.label);continue}
  values[target.key]=converted.value;(m.status==='confirmed'&&!converted.assumed?report.converted:report.hypotheses).push(target.label)
 }
 return {engine:{algorithm:pair.m2000,values},report}
}
const emptyReport=(pair:M2000MappingPair):ConversionReport=>({relation:pair.relation,converted:[],hypotheses:[],sameRange:[],notCarried:[],outOfRange:[]})
export const m3000AlgorithmName=(id:number)=>algorithmById(id)?.name??String(id)

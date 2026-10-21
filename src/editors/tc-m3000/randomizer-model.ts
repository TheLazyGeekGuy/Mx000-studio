// M3000 variations (owner request 2026-10-21, after the FireworX « Randomize »): new values for one engine, the other,
// or both engines of a combined preset; optionally a new algorithm. Values come from donors — stored single presets of
// the same algorithm, crossed parameter by parameter — or are drawn inside each parameter's accepted range. Intensity
// blends from the current value toward the drawn one; levels (Mix, Out Level) can stay put. Seeded: reproducible.
// Pure: no DOM, storage or MIDI; the caller commits the result as one undo step.
import {algorithmById,initialValues,paramsFor,type EngineState,type M3000State} from './model'
import {decodeEngine,hasLayout} from './preset-codec'
import {parseMessage} from './protocol'

export type AlgorithmPool='keep'|'family'|'reverbs'|'effects'|'all'
export interface VariationOptions {engines:readonly (0|1)[];pool:AlgorithmPool;source:'donors'|'range';intensity:number;keepLevels:boolean;seed:number}
export interface VariationChange {id:number;name:string;from:number|null;to:number}
export interface VariationReport {engine:0|1;algorithmFrom:number;algorithmTo:number;donors:string[];changes:VariationChange[]}
export interface Donor {name:string;frame:readonly number[]}

const REVERBS=new Set([2,4,10,15,16,19,100,120,122,126])
export const isReverb=(algorithm:number)=>REVERBS.has(algorithm)
const LEVELS=new Set(['MIDI_MIX','MIDI_OUTLEV'])

/** mulberry32: small, fast, seedable. */
export function seeded(seed:number){let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296}}

/** Engines of the donors that decode to `algorithm`. */
function donorsFor(algorithm:number,donors:readonly Donor[]){
 const out:{name:string;engine:EngineState}[]=[]
 for(const d of donors){const m=parseMessage(d.frame);if(m?.type!=='preset-data'||m.kind===2)continue;const e=decodeEngine(0,m.data,0);if(e&&e.engine.algorithm===algorithm)out.push({name:d.name,engine:e.engine})}
 return out
}
function pickAlgorithm(current:number,pool:AlgorithmPool,random:()=>number,donors:readonly Donor[]){
 if(pool==='keep')return current
 const all=[...new Set(donors.map(d=>parseMessage(d.frame)).flatMap(m=>m?.type==='preset-data'&&m.kind!==2?[decodeEngine(0,m.data,0)?.engine.algorithm??-1]:[]))].filter(a=>a>=0&&hasLayout(a)&&!!algorithmById(a))
 const candidates=(all.length?all:[2,3,4,5,6,7,8,9,10,12,13,14,15,16,17,18,19]).filter(a=>pool==='all'||(pool==='reverbs'?isReverb(a):pool==='effects'?!isReverb(a):isReverb(a)===isReverb(current)))
 const others=candidates.filter(a=>a!==current),list=others.length?others:candidates
 return list.length?list[Math.floor(random()*list.length)]:current
}

export function vary(state:M3000State,options:VariationOptions,donors:readonly Donor[]=[]):{state:M3000State;report:VariationReport[]}{
 const random=seeded(options.seed),intensity=Math.max(0,Math.min(100,options.intensity))/100
 const engines=[...state.engines] as M3000State['engines'],report:VariationReport[]=[]
 const linked=state.routing===4,targets=[...new Set(options.engines)].filter(e=>!(linked&&e===1)).sort()
 for(const e of targets){
  const current=engines[e],algorithm=pickAlgorithm(current.algorithm,options.pool,random,donors),changedAlgorithm=algorithm!==current.algorithm
  const pool=options.source==='donors'?donorsFor(algorithm,donors):[]
  // A new algorithm starts from one donor whole (a musical starting point), else from its initial values.
  const start:EngineState=changedAlgorithm?(pool.length?structuredClone(pool[Math.floor(random()*pool.length)].engine):{algorithm,values:initialValues(algorithm)}):current
  const values:Record<string,number>={...start.values},used=new Set<string>()
  for(const p of paramsFor(algorithm)){
   const key=String(p.id),from=values[key]
   if(options.keepLevels&&LEVELS.has(p.name)){if(!changedAlgorithm&&current.values[key]!==undefined)values[key]=current.values[key];continue}
   let target:number
   if(pool.length){const donor=pool[Math.floor(random()*pool.length)];target=donor.engine.values[key]??from;used.add(donor.name)}
   else target=p.min+Math.floor(random()*(p.max-p.min+1))
   const blended=changedAlgorithm?target:Math.round(from+(target-from)*intensity)
   values[key]=Math.max(p.min,Math.min(p.max,blended))
  }
  const next:EngineState={algorithm,values}
  const changes=paramsFor(algorithm).map(p=>({id:p.id,name:p.name,from:changedAlgorithm?null:current.values[String(p.id)]??null,to:values[String(p.id)]})).filter(c=>c.from!==c.to)
  engines[e]=next;report.push({engine:e,algorithmFrom:current.algorithm,algorithmTo:algorithm,donors:[...used].slice(0,8),changes})
 }
 if(linked&&targets.includes(0))engines[1]=structuredClone(engines[0])
 return {state:{...state,engines},report}
}

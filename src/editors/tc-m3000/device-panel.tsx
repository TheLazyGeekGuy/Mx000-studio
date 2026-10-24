import {useEffect,useMemo,useState} from 'react'
import type {EditorViewContext} from '../../editor-host/view-contract'
import type {MidiAuthorization,MidiOperation} from '../../editor-host/midi-broker'
import type {HardwareLink} from './hardware-link'
import type {M3000Session} from './module'
import type {HardwareSnapshot} from './hardware'
import {TC_FAMILY_NAMES,decodePresetHeader,isM3000Identity,parseMessage,type Identity,type PresetKind} from './protocol'
import {algorithmById,type M3000State} from './model'
import {m3000Map} from './parameter-map'
import {formatValue} from './format'

import {portLooksLikeMSeries} from './device-ports'
export {portLooksLikeMSeries} from './device-ports'
const ROUTING=m3000Map.system.find(p=>p.name==='MIDI_ROUTING')!
const routingLabel=(v:number|null)=>v===null?'—':formatValue({name:ROUTING.name,min:ROUTING.min,max:ROUTING.max,display:ROUTING.display},v)
const algorithmName=(id:number)=>algorithmById(id)?.name??`algorithme ${id}`

interface Probe {port:string;result:string}
export function DevicePanel({context,session,state,hardware,locked,revision,link:hw,onError}:{context:EditorViewContext;session:M3000Session;state:M3000State;hardware:HardwareSnapshot;locked:boolean;revision:number;link:HardwareLink;onError:(m:string)=>void}){
 const [link,setLink]=useState(()=>context.lease.getState()),[input,setInput]=useState(''),[output,setOutput]=useState(''),[probes,setProbes]=useState<Probe[]>([]),[requesting,setRequesting]=useState(false),[allPorts,setAllPorts]=useState(false)
 useEffect(()=>context.lease.onState(setLink),[context])
 useEffect(()=>{if(link.binding){setInput(link.binding.inputId);setOutput(link.binding.outputId)}},[link.binding?.inputId,link.binding?.outputId])
 const inputs=useMemo(()=>[...context.access.inputs.values()].filter(p=>p.state!=='disconnected'),[context,revision,link])
 const outputs=useMemo(()=>[...context.access.outputs.values()].filter(p=>p.state!=='disconnected'),[context,revision,link])
 const busy=!!hardware.busy,disabled=locked||busy
 const fail=(e:unknown)=>onError(e instanceof Error?e.message:String(e))
 async function withGrant<T>(operation:MidiOperation,fn:(grant:MidiAuthorization)=>Promise<T>):Promise<T>{const grant=context.broker.authorize(context.id,operation);try{return await fn(grant)}finally{context.broker.revoke(grant)}}
 const bind=(inputId:string,outputId:string)=>{context.lease.bind({inputId,outputId});const name=context.access.inputs.get(inputId)?.name;if(name&&name===context.access.outputs.get(outputId)?.name)hw.rememberPort(name)}
 async function enableMidi(){setRequesting(true);try{await context.request()}catch(e){fail(e)}finally{setRequesting(false)}}

 /** Ordered candidates: same-named input/output pairs whose name looks like an M-series unit, then (on request) every
  * other same-named pair. Each candidate receives one universal Identity Request; the first M3000 answer is kept. */
 async function detect(){
  const pairs=inputs.map(i=>({i,o:outputs.find(o=>o.name&&o.name===i.name)})).filter((p):p is {i:typeof inputs[number];o:typeof outputs[number]}=>!!p.o)
   .filter(p=>context.broker.available('input',p.i.id,context.id)&&context.broker.available('output',p.o.id,context.id))
  const ordered=[...pairs.filter(p=>portLooksLikeMSeries(p.i.name)),...(allPorts?pairs.filter(p=>!portLooksLikeMSeries(p.i.name)):[])]
  if(!ordered.length){onError(allPorts?'Aucune paire de ports MIDI de même nom disponible.':'Aucun port dont le nom évoque un M2000/M3000 : cochez « tous les ports » ou choisissez la paire à la main.');return}
  const log:Probe[]=[];setProbes([]);hw.setDetecting(true)
  try{
  for(const {i,o} of ordered){
   try{
    bind(i.id,o.id)
    const id:Identity|null=await withGrant('query',g=>session.hardware.probeIdentity(g,700))
    const result=!id?'pas de réponse':isM3000Identity(id)?`M3000 · logiciel ${id.version} · SysEx ID ${id.device}`:id.manufacturer==='tc-electronic'?`${TC_FAMILY_NAMES[id.family]??`famille 0x${id.family.toString(16)}`} (non pris en charge ici)`:`autre fabricant (${id.manufacturerId.join(' ')})`
    log.push({port:i.name??i.id,result});setProbes([...log])
    if(isM3000Identity(id)){hw.rememberPort(i.name??'');await withGrant('query',async g=>{await session.hardware.identify(g);hw.markIdentified();await session.hardware.readCurrent(g)});return}
   }catch(e){log.push({port:i.name??i.id,result:`erreur : ${e instanceof Error?e.message:String(e)}`});setProbes([...log])}
  }
  context.lease.release();onError('Aucun M3000 n’a répondu à la demande d’identité.')
  }finally{hw.setDetecting(false)}
 }
 const run=(fn:(grant:MidiAuthorization)=>Promise<unknown>,operation:MidiOperation='query')=>{void withGrant(operation,fn).catch(fail)}
 const recall=(kind:PresetKind,n:number)=>{
  if(!window.confirm(`Rappeler ${kind===2?'le preset combiné':'le preset'} ${n} sur l’appareil ? Le preset en cours est remplacé (les modifications non mémorisées sur l’appareil sont perdues).`))return
  void (async()=>{const w=context.broker.authorize(context.id,'edit-buffer'),q=context.broker.authorize(context.id,'query');try{await session.hardware.recall(w,q,kind,n)}finally{context.broker.revoke(w);context.broker.revoke(q)}})().catch(fail)
 }
 // Library from the dumps kept in the workspace (read from the unit or imported): names, algorithms, sources, routing.
 const library=useMemo(()=>{
  const singles=new Map<number,{name:string;algorithm:number}>(),combined:{n:number;name:string;algorithms:number[];sources:(number|null)[];routing:number|null}[]=[]
  for(const o of state.originals){const m=parseMessage(o.bytes);if(m?.type!=='preset-data'||m.preset===0)continue;const h=decodePresetHeader(m.kind,m.data)
   if(m.kind===2)combined.push({n:m.preset,name:h.name,algorithms:h.algorithms,sources:h.sources,routing:h.routing});else singles.set(m.preset,{name:h.name,algorithm:h.algorithms[0]})}
  return {singles,combined:combined.sort((a,b)=>a.n-b.n)}
 },[state.originals])
 // A source number is shown only when that single uses the engine's algorithm (255 on "Linked" presets points elsewhere).
 const source=(n:number|null,algorithm:number)=>{if(n===null)return '— (réglé dans le combiné)';const s=library.singles.get(n);if(!s)return `${n} (non lu)`;return s.algorithm===algorithm?`${n} « ${s.name} »`:'— (champ non exploitable)'}
 const id=hardware.identity,status=hardware.status,connected=link.connected

 return <section className="m3k-device-page" aria-label="Appareil MIDI">
  <div className="m3k-device-status" role="status">
   {id?<><strong>M3000</strong> · logiciel {id.version} · SysEx ID {id.device}{status&&<> · en cours : {status.combined?`combiné ${status.combined}`:`simple ${status.single1??'—'}`} ({status.algorithms.map(algorithmName).join(' + ')})</>}</>
    :connected?'Port lié, appareil non identifié':'Aucun appareil connecté'}
   {hardware.busy&&<> · <em>{hardware.busy}{hardware.progress?` ${hardware.progress.done}/${hardware.progress.total} (${hardware.progress.found} reçus)`:''}…</em> <button type="button" onClick={()=>session.hardware.cancel()}>Annuler</button></>}
  </div>
  {hardware.lastReport&&<p className="m3k-files-report" role="status">{hardware.lastReport}</p>}
  <div className="m3k-export">
   <button type="button" disabled={requesting} onClick={enableMidi}>{requesting?'Autorisation…':'Activer / rafraîchir le MIDI'}</button>
   <button type="button" disabled={disabled} onClick={()=>void detect().catch(fail)}>Détection automatique</button>
   <label className="m3k-check"><input type="checkbox" checked={allPorts} onChange={e=>setAllPorts(e.currentTarget.checked)}/> tous les ports</label>
  </div>
  <small>La détection envoie une demande d’identité MIDI universelle aux ports dont le nom évoque un M2000/M3000 (puis aux autres si coché). Le nom du port n’identifie pas le modèle : seule la réponse compte (un M3000 répond famille 0x42).</small>
  {probes.length>0&&<ul className="m3k-probes">{probes.map((p,i)=><li key={i}><code>{p.port}</code> : {p.result}</li>)}</ul>}
  <div className="m3k-export">
   <label>Entrée <select value={input} disabled={disabled} onChange={e=>setInput(e.currentTarget.value)}><option value="">—</option>{inputs.map(p=><option key={p.id} value={p.id} disabled={!context.broker.available('input',p.id,context.id)}>{p.name??p.id}</option>)}</select></label>
   <label>Sortie <select value={output} disabled={disabled} onChange={e=>setOutput(e.currentTarget.value)}><option value="">—</option>{outputs.map(p=><option key={p.id} value={p.id} disabled={!context.broker.available('output',p.id,context.id)}>{p.name??p.id}</option>)}</select></label>
   <button type="button" disabled={disabled||!input||!output} onClick={()=>{try{bind(input,output)}catch(e){fail(e)}}}>Lier</button>
   <button type="button" disabled={disabled||!connected} onClick={()=>run(g=>session.hardware.identify(g))}>Identifier</button>
  </div>
  <div className="m3k-export">
   <button type="button" disabled={disabled||!id} onClick={()=>run(g=>session.hardware.readCurrent(g))}>Lire l’état de l’appareil</button>
   <button type="button" disabled={disabled||!id} onClick={()=>run(g=>session.hardware.readMemory(g,'all'))}>Lire toute la mémoire</button>
   <button type="button" disabled={disabled||!id} onClick={()=>run(g=>session.hardware.readMemory(g,'user'))}>Lire les presets utilisateur</button>
   <label className="m3k-check"><input type="checkbox" checked={hw.autoApply} onChange={e=>hw.setAutoApply(e.currentTarget.checked)}/> Appliquer automatiquement les modifications (buffer d’édition){hardware.live?' · actif':id?' · inactif':''}</label>
  </div>
  <small>Lecture : demandes de presets et de paramètres (sans effet sur le son). Rappel et envoi en direct : modifient le son en cours, sans jamais écrire en mémoire. L’algorithme ne se change pas par MIDI : choisissez-le sur l’appareil ou rappelez un preset.</small>
  <h3>Presets combinés ({library.combined.length})</h3>
  {library.combined.length?<table className="m3k-library"><thead><tr><th>N°</th><th>Nom</th><th>Routage</th><th>Moteur 1</th><th>Moteur 2</th><th/></tr></thead><tbody>
   {library.combined.map(c=><tr key={c.n}><td>{c.n}</td><td>{c.name}</td><td>{routingLabel(c.routing)}</td>
    <td>{algorithmName(c.algorithms[0])}<br/><small>source : {source(c.sources[0],c.algorithms[0])}</small></td><td>{algorithmName(c.algorithms[1])}<br/><small>source : {source(c.sources[1],c.algorithms[1])}</small></td>
    <td><button type="button" disabled={disabled||!id} onClick={()=>recall(2,c.n)}>Rappeler</button></td></tr>)}
  </tbody></table>:<p>Aucun preset combiné lu. « Lire toute la mémoire » les récupère depuis l’appareil (environ 2 à 3 minutes).</p>}
  {library.singles.size>0&&<details><summary>Presets simples ({library.singles.size})</summary><table className="m3k-library"><thead><tr><th>N°</th><th>Nom</th><th>Algorithme</th><th/></tr></thead><tbody>
   {[...library.singles.entries()].sort((a,b)=>a[0]-b[0]).map(([n,s])=><tr key={n}><td>{n}</td><td>{s.name}</td><td>{algorithmName(s.algorithm)}</td><td><button type="button" disabled={disabled||!id} onClick={()=>recall(0,n)}>Rappeler (moteur 1)</button></td></tr>)}
  </tbody></table></details>}
 </section>
}

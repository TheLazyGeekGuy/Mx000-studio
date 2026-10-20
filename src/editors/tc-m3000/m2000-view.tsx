import {useEffect,useState,type ChangeEvent} from 'react'
import type {M3000Session,M3000Selection} from './module'
import {m2000Map} from './m2000-map'
import {exportCcMidiFile,m2000Algorithm,m2000AlgorithmByKey,type EngineIndex,type M2000State} from './m2000-model'
import {formatM2000,isAssumedScale,isRawCc,m2000Label,m2000OrderPresumed,parseM2000Entry} from './m2000-format'
import {pairsForM2000,m3000AlgorithmName} from './conversion'
import {Knob} from './knob'
import {ValueEntry,download,safeName} from './value-entry'

type Run=(fn:()=>void)=>void
const runner=(onError:(m:string)=>void):Run=>fn=>{try{fn()}catch(e){onError(e instanceof Error?e.message:String(e))}}
export const RELATION:Readonly<Record<string,string>>={'documented-same':'identité affirmée par TC','documented-derived':'origine commune documentée (M5000), pas une identité','same-name-only':'même nom seulement','similar-function':'fonction voisine seulement',none:'aucune'}
const CATEGORY:Readonly<Record<string,string>>={reverb:'Réverbération',delay:'Délai',chorus:'Chorus',flanger:'Flanger',phaser:'Phaser',pitch:'Pitch',eq:'Égaliseur',tremolo:'Trémolo',stereo:'Stéréo',dynamics:'Dynamique',other:'Autres'}

export function M2000EnginePage({session,state,engine,selection,locked,onError,onConvert}:{session:M3000Session;state:M2000State;engine:EngineIndex;selection:M3000Selection|null;locked:boolean;onError:(m:string)=>void;onConvert:(engine:EngineIndex,m3000Algorithm:number)=>void}){
 const current=state.engines[engine],algorithm=m2000Algorithm(current.algorithm),[choice,setChoice]=useState(current.algorithm),run=runner(onError)
 useEffect(()=>setChoice(current.algorithm),[current.algorithm])
 const pairs=pairsForM2000(current.algorithm)
 // CC numbers beyond Mix (10) and Out Level (11) follow the EDIT page order, which the manual does not print.
 const addressable=algorithm.params.filter(p=>p.cc!==null),user=algorithm.params.filter(p=>p.cc===null&&p.layer==='user'),expert=algorithm.params.filter(p=>p.cc===null&&p.layer==='expert')
 const categories=[...new Set(m2000Map.algorithms.map(a=>a.category))]
 return <section className="m3k-engine" aria-label={`Moteur ${engine+1}`}>
  <header className="m3k-engine-head">
   <h2>Moteur {engine+1}{state.type==='single'&&engine===1?' · inactif en preset simple':''}</h2>
   <label>Algorithme <select value={choice} disabled={locked} onChange={e=>setChoice(e.currentTarget.value)}>
    {categories.map(c=><optgroup key={c} label={CATEGORY[c]??c}>{m2000Map.algorithms.filter(a=>a.category===c).map(a=><option key={a.key} value={a.key}>{a.nameFr||a.name}</option>)}</optgroup>)}</select></label>
   <button type="button" disabled={locked||choice===current.algorithm} onClick={()=>run(()=>session.dispatch({type:'m2000-set-algorithm',engine,algorithm:choice}))}>Appliquer l’algorithme</button>
   {pairs.map(pair=><button key={pair.m3000Algorithm} type="button" disabled={locked} onClick={()=>onConvert(engine,pair.m3000Algorithm!)} title={`Lien : ${RELATION[pair.relation]??pair.relation}. Copie les valeurs dont la correspondance est documentée ; le rapport liste ce qui n’est pas repris.`}>Copier vers le M3000 : {m3000AlgorithmName(pair.m3000Algorithm!)}</button>)}
   <small>Changer d’algorithme repart des valeurs initiales locales. Les numéros de contrôleur suivent l’ordre de la page EDIT (CC 12 = 1ᵉʳ paramètre) ; en mode Expert l’ordre diffère{algorithm.expertModeDiffers===false?' pas pour cet algorithme':''} et n’est pas géré.{algorithm.manualPages.length?` Manuel : ${algorithm.manualPages.join(', ')}.`:''}</small>
  </header>
  {[['Adressables par contrôleur MIDI',addressable],['Page utilisateur · contrôleur inconnu (ordre de la page EDIT non publié)',user],['Page Expert · contrôleur inconnu',expert]].filter(([,list])=>(list as typeof addressable).length).map(([name,list])=>
   <fieldset key={name as string} className="m3k-group"><legend>{name as string}</legend><div className="m3k-params">
    {(list as typeof addressable).map(p=>{const v=current.values[p.key],label=m2000Label(p),selected=selection?.device==='m2000'&&selection.engine===engine&&selection.key===p.key
     return <div key={p.key} className={`m3k-param${selected?' m3k-selected':''}`}>
      <span className="m3k-param-label">{label}</span>
      <Knob id={`m2k-${engine}-${p.key}`} label={label} value={v} min={0} max={p.domain.max} valueText={formatM2000(p,v)} disabled={locked}
       onFocus={()=>run(()=>session.dispatch({type:'focus',device:'m2000',engine,key:p.key}))} onChange={next=>run(()=>session.dispatch({type:'m2000-set-parameter',engine,key:p.key,value:next}))}/>
      <ValueEntry label={label} value={v} disabled={locked} format={x=>formatM2000(p,x)} parse={t=>parseM2000Entry(p,t)} onError={onError} onCommit={next=>run(()=>session.dispatch({type:'m2000-set-parameter',engine,key:p.key,value:next}))}/>
      <small className="m3k-meta" title={[p.cc===null?'Aucun contrôleur MIDI':`CC ${p.cc}`,p.printed.min!==null&&p.printed.max!==null?`plage imprimée ${p.printed.min}…${p.printed.max}${p.printed.unit?` ${p.printed.unit}`:''}`:'plage non imprimée',`statut ${p.status}`,...p.cite.slice(0,2),p.note??''].filter(Boolean).join(' · ')}>
       {isAssumedScale(p)?'échelle supposée · ':isRawCc(p)?(p.domain.kind==='cc'&&p.domain.printed?'bornes imprimées · ':'valeur MIDI brute · '):m2000OrderPresumed(p)?'ordre présumé · ':''}{p.cc===null?'CC inconnu':`CC ${p.cc}`}</small>
     </div>})}
   </div></fieldset>)}
 </section>
}

export function M2000PresetPage({session,state,locked,onError}:{session:M3000Session;state:M2000State;locked:boolean;onError:(m:string)=>void}){
 const [name,setName]=useState(state.name),[routing,setRouting]=useState(state.routing),run=runner(onError)
 useEffect(()=>setName(state.name),[state.name]);useEffect(()=>setRouting(state.routing),[state.routing])
 return <section className="m3k-preset" aria-label="Preset et routage M2000">
  <label>Nom local <input value={name} maxLength={40} disabled={locked} onChange={e=>setName(e.currentTarget.value)} onBlur={()=>run(()=>session.dispatch({type:'m2000-set-name',value:name}))} onKeyDown={e=>{if(e.key==='Enter')run(()=>session.dispatch({type:'m2000-set-name',value:name}))}}/></label>
  <small>Aucun format de preset M2000 n’est publié : ce nom reste local à l’éditeur.</small>
  <div role="group" aria-label="Type de preset" className="m3k-segmented">
   {(['single','dual'] as const).map(t=><button key={t} type="button" aria-pressed={state.type===t} disabled={locked} onClick={()=>run(()=>session.dispatch({type:'m2000-set-type',value:t}))}>{t==='single'?'Simple (un moteur)':'Combiné 1+2 (deux moteurs)'}</button>)}
  </div>
  {m2000Map.routings.length?<>
   <label>Routage <select value={routing} disabled={locked} onChange={e=>setRouting(Number(e.currentTarget.value))}>
    {m2000Map.routings.map((r,i)=><option key={i} value={i}>{r.labelFr||r.label}</option>)}</select></label>
   <button type="button" disabled={locked||routing===state.routing} onClick={()=>run(()=>session.dispatch({type:'m2000-set-routing',value:routing}))}>Appliquer le routage</button>
   <small>Libellés du manuel ({m2000Map.routingOrderEvidence}). Le routage est un réglage global (CC 35 sur le canal Combined) : il n’est jamais exporté.</small>
  </>:<p>Routages non documentés dans les données M2000.</p>}
 </section>
}

export function M2000FilesPage({session,state,locked,onError}:{session:M3000Session;state:M2000State;locked:boolean;onError:(m:string)=>void}){
 const defaults=m2000Map.cc.defaultChannels,[channels,setChannels]=useState<[number,number]>([defaults.engine1??1,defaults.engine2??2]),[report,setReport]=useState('')
 const channel=(i:0|1)=><input type="number" min={1} max={16} value={channels[i]} aria-label={`Canal MIDI du moteur ${i+1}`} onChange={e=>{const v=Math.max(1,Math.min(16,Math.trunc(Number(e.currentTarget.value)||1)));setChannels(c=>i===0?[v,c[1]]:[c[0],v])}}/>
 async function importFile(e:ChangeEvent<HTMLInputElement>){
  const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(!file)return
  try{
   if(file.size>4*1024*1024)throw Error('Fichier trop volumineux')
   if(!/\.json$/i.test(file.name))throw Error('Le M2000 ne publie aucun format SysEx : seuls les espaces .json de l’éditeur s’importent')
   session.dispatch({type:'replace',state:JSON.parse(await file.text())});setReport(`Espace « ${file.name} » ouvert. Annuler revient à l’état précédent.`)
  }catch(err){onError(err instanceof Error?err.message:String(err))}
 }
 function exportMid(){
  try{const r=exportCcMidiFile(state,channels);download(`${safeName(state.name,'M2000')}-cc.mid`,r.bytes,'audio/midi')
   setReport(`Fichier MIDI : ${r.events} Control Change${r.approximate?`, dont ${r.approximate} approché(s) (plus de pas que les 128 valeurs MIDI)`:''}${r.unaddressable?`, ${r.unaddressable} paramètre(s) non exporté(s) faute de numéro de contrôleur publié`:''}.`)}
  catch(e){onError(e instanceof Error?e.message:String(e))}
 }
 return <section className="m3k-files" aria-label="Fichiers M2000">
  <label className="m3k-file">Importer un espace .json <input type="file" accept=".json" disabled={locked} onChange={importFile}/></label>
  {report&&<p role="status">{report}</p>}
  <div className="m3k-export">
   <label>Canal moteur 1 {channel(0)}</label><label>Canal moteur 2 {channel(1)}</label>
   <button type="button" onClick={exportMid}>Exporter les contrôleurs (.mid)</button>
   <button type="button" onClick={()=>download(`${safeName(state.name,'M2000')}.m2000.json`,JSON.stringify(session.serialize(),null,1),'application/json')}>Exporter l’espace (.json)</button>
  </div>
  <small>Le M2000 ne publie que des contrôleurs (guide MIDI CC) : le .mid contient un Control Change par paramètre de la page EDIT{state.type==='dual'?' des deux moteurs':' du moteur 1'}, à jouer depuis un séquenceur. Il ne choisit ni l’algorithme ni le preset : sélectionnez d’abord « {m2000AlgorithmByKey(state.engines[0].algorithm)?.name} » sur l’appareil. Mise à l’échelle 0–127 linéaire : hypothèse, le guide dit seulement « {m2000Map.cc.scaling} ». Les réglages globaux (routage, entrées, horloge) ne sont jamais exportés.</small>
 </section>
}

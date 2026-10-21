// M3000 « Variations » window (after the FireworX Randomize dialog): options, seeded preview (before → after per
// parameter), then one undo step. Live, the auto-apply sends the result (a combined draft goes to P0 whole).
import {useEffect,useMemo,useRef,useState} from 'react'
import type {M3000Session} from './module'
import type {TcWorkspace} from './workspace'
import {algorithmById,paramsFor,type M3000State} from './model'
import {formatValue,parameterLabel} from './format'
import {vary,type AlgorithmPool,type Donor,type VariationOptions} from './randomizer-model'

const newSeed=()=>Math.floor(Math.random()*0x7fffffff)
export function M3000Variations({session,state,donors,open,locked,onClose}:{session:M3000Session;state:M3000State;donors:readonly Donor[];open:boolean;locked:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null)
 const [target,setTarget]=useState<'0'|'1'|'both'>(state.type==='dual'?'both':'0'),[pool,setPool]=useState<AlgorithmPool>('keep'),[source,setSource]=useState<'donors'|'range'>('donors')
 const [intensity,setIntensity]=useState(50),[keepLevels,setKeepLevels]=useState(true),[seed,setSeed]=useState(newSeed),[status,setStatus]=useState('')
 useEffect(()=>{const d=dialog.current;if(!d)return;if(open&&!d.open){try{d.showModal()}catch{d.setAttribute('open','')}}else if(!open&&d.open)d.close()},[open])
 useEffect(()=>{if(open){setTarget(state.type==='dual'?'both':'0');setStatus('')}},[open])
 const options:VariationOptions={engines:target==='both'?[0,1]:[Number(target) as 0|1],pool,source,intensity,keepLevels,seed}
 const result=useMemo(()=>open?vary(state,options,donors):null,[open,state,target,pool,source,intensity,keepLevels,seed,donors])
 const apply=()=>{if(!result)return;try{session.dispatch({type:'replace',state:{...(session.serialize() as TcWorkspace),m3000:result.state}});setStatus('Variation appliquée (une étape d’annulation).');onClose()}catch(e){setStatus(e instanceof Error?e.message:String(e))}}
 const label=(a:number)=>algorithmById(a)?.name??String(a)
 return <dialog ref={dialog} className="m3k-var" aria-label="Variations aléatoires" onClose={onClose} onCancel={()=>onClose()}>
  <header><div><p className="m3k-lib-eyebrow">M3000 · VARIATIONS</p><h2>Variations aléatoires</h2></div><button type="button" onClick={onClose}>Fermer ×</button></header>
  <div className="m3k-var-body">
   <section className="m3k-var-options" aria-label="Options">
    <label>Cible<select value={target} onChange={e=>setTarget(e.currentTarget.value as typeof target)}><option value="0">Moteur 1</option><option value="1" disabled={state.routing===4}>Moteur 2</option><option value="both">Les deux moteurs</option></select></label>
    <label>Algorithme<select value={pool} onChange={e=>setPool(e.currentTarget.value as AlgorithmPool)}><option value="keep">Conserver l’algorithme</option><option value="family">Changer dans la même famille</option><option value="reverbs">Une réverbe au hasard</option><option value="effects">Un effet au hasard</option><option value="all">N’importe quel algorithme</option></select></label>
    <label>Valeurs<select value={source} onChange={e=>setSource(e.currentTarget.value as typeof source)}><option value="donors">Croiser des presets du même algorithme ({donors.length} disponibles)</option><option value="range">Tirer dans la plage de chaque paramètre</option></select></label>
    <label>Intensité · {intensity} %<input type="range" min={0} max={100} value={intensity} onChange={e=>setIntensity(Number(e.currentTarget.value))}/></label>
    <label><input type="checkbox" checked={keepLevels} onChange={e=>setKeepLevels(e.currentTarget.checked)}/> Conserver les niveaux (Mix, Out Level)</label>
    <label>Graine<span className="m3k-var-seed"><input type="number" value={seed} onChange={e=>setSeed(Math.max(0,Math.trunc(Number(e.currentTarget.value))||0))}/><button type="button" onClick={()=>setSeed(newSeed())} title="Nouvelle graine">⚄ Relancer</button></span></label>
    <small>L’intensité rapproche chaque valeur de la valeur tirée (0 % : inchangée, 100 % : tirée). Un nouvel algorithme part d’un preset donneur entier. Rien n’est envoyé avant « Appliquer » ; en direct, l’envoi automatique transmet ensuite le résultat.</small>
   </section>
   <section className="m3k-var-preview" aria-label="Aperçu">
    {result?.report.map(r=><div key={r.engine} className="m3k-var-engine"><h3>Moteur {r.engine+1} · {r.algorithmFrom===r.algorithmTo?label(r.algorithmTo):`${label(r.algorithmFrom)} → ${label(r.algorithmTo)}`}</h3>
     {r.donors.length?<p>Donneurs : {r.donors.join(', ')}</p>:null}
     {r.changes.length?<table className="m3k-lib-table"><thead><tr><th>Paramètre</th><th>Avant</th><th>Après</th></tr></thead><tbody>{r.changes.map(c=>{const p=paramsFor(r.algorithmTo).find(x=>x.id===c.id)!
      return <tr key={c.id}><td>{parameterLabel(p)}</td><td>{c.from===null?'—':formatValue(p,c.from)}</td><td>{formatValue(p,c.to)}</td></tr>})}</tbody></table>:<p>Aucun changement avec ces réglages.</p>}</div>)}
    {state.routing===4&&<p>Routage Linked : le moteur 2 suit le moteur 1.</p>}
   </section>
  </div>
  <footer><p role="status">{status}</p><button type="button" className="m3k-lib-primary" disabled={locked||!result?.report.some(r=>r.changes.length||r.algorithmFrom!==r.algorithmTo)} onClick={apply}>Appliquer au brouillon</button></footer>
 </dialog>
}

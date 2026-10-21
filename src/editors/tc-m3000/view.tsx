import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react'
import {useLanguage} from '../../i18n'
import {useDomLocale} from './locale'
import type {EditorViewContext,EditorViewProps} from '../../editor-host/view-contract'
import {DevicePanel} from './device-panel'
import {M3000Librarian,type LibrarianStart} from './librarian'
import {M3000Variations} from './randomizer'
import {useHardwareLink} from './hardware-link'
import type {EditorSnapshot} from '../../editor-host/contracts'
import {EditorHistoryTools} from '../../editor-host/EditorHistoryTools'
import {PresentationTools} from '../../editor-host/PresentationTools'
import {m3000Map} from './parameter-map'
import {m3000HardwarePolicy,type M3000Session,type M3000Selection} from './module'
import {algorithmById,paramsFor,tableFor,type EngineIndex,type M3000State} from './model'
import {m2000Algorithm,m2000AlgorithmByKey,m2000ParamsFor,type M2000State} from './m2000-model'
import {formatM2000,m2000Label} from './m2000-format'
import {M2000EnginePage,M2000FilesPage,M2000PresetPage,M2000RoutingPage,RELATION} from './m2000-view'
import {convertToM2000,convertToM3000,pairsForM3000,type ConversionReport} from './conversion'
import {DeviceSlider} from './device-slider'
import type {DeviceId,TcWorkspace} from './workspace'
import {anchorHint,formatValue,orderPresumed,parameterLabel,parseEntry,hasConfirmedDisplay,setDisplayLanguage,type Formattable} from './format'
import {Knob} from './knob'
import {RoutingPicker,routingKind} from './routing-diagram'
import {engineOrigin,useSinglePresets,type EngineOrigin,type EnginePreset} from './engine-presets'
import {ValueEntry as SharedValueEntry} from './value-entry'
import {M3000Panel,type LcdEngineLine} from './panel'
import './m3000.css'

type Page='engine0'|'engine1'|'preset'|'routing'|'files'|'device'
const ROUTING=m3000Map.system.find(p=>p.name==='MIDI_ROUTING')!
function ValueEntry({param,value,disabled,onCommit,onError}:{param:Formattable;value:number;disabled?:boolean;onCommit:(v:number)=>void;onError:(m:string)=>void}){
 return <SharedValueEntry label={parameterLabel(param)} value={value} disabled={disabled} format={v=>formatValue(param,v)} parse={t=>parseEntry(param,t)} onCommit={onCommit} onError={onError}/>
}

function EnginePage({session,state,engine,selection,locked,onError,onConvert,runningLabel,presets=[],runningNumber=null,origin=null,runningName=null}:{session:M3000Session;state:M3000State;engine:EngineIndex;selection:M3000Selection|null;locked:boolean;onError:(m:string)=>void;onConvert:(engine:EngineIndex)=>void;runningLabel?:string|null;presets?:readonly EnginePreset[];runningNumber?:number|null;origin?:EngineOrigin|null;runningName?:string|null}){
 const current=state.engines[engine],table=tableFor(current.algorithm),[choice,setChoice]=useState(current.algorithm)
 useEffect(()=>setChoice(current.algorithm),[current.algorithm])
 const groups=table.groups?.length?table.groups.map(g=>({name:g.name_fr||g.name_en||'Paramètres',params:g.params.map(id=>table.params.find(p=>p.id===id)).filter(Boolean) as typeof table.params[number][]}))
  :[{name:'Paramètres',params:[...table.params]}]
 const grouped=new Set(groups.flatMap(g=>g.params.map(p=>p.id))),rest=table.params.filter(p=>!grouped.has(p.id))
 if(rest.length)groups.push({name:'Autres paramètres',params:[...rest]})
 const run=(fn:()=>void)=>{try{fn()}catch(e){onError(e instanceof Error?e.message:String(e))}}
 return <section className="m3k-engine" aria-label={`Moteur ${engine+1}`}>
  <header className="m3k-engine-head">
   <h2>Moteur {engine+1}{runningLabel?<small className="m3k-running"> · {runningLabel}</small>:null}</h2>
   <label>Algorithme <select className="m3k-algorithm" value={choice} disabled={locked} onChange={e=>setChoice(Number(e.currentTarget.value))}>
    {m3000Map.algorithms.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <button type="button" disabled={locked||choice===current.algorithm} onClick={()=>run(()=>session.dispatch({type:'set-algorithm',engine,algorithm:choice}))}>Appliquer l’algorithme</button>
   {/* As on the unit (ENGINE n RECALL), also inside a combined preset: a stored single preset into this engine only. */}
   {origin&&<p className="m3k-origin" role="note">{origin.preset?<>Combiné {origin.combined} : moteur {engine+1} issu du preset simple {origin.preset.label.split(' (')[0]}{origin.sameAlgorithm?(origin.changed?` · ${origin.changed} paramètre(s) modifié(s) dans le combiné`:' · identique'):' · algorithme changé depuis'}</>
    :origin.source?<>Combiné {origin.combined} : moteur {engine+1} issu du preset simple {origin.source} (non lu ni importé)</>:<>Combiné {origin.combined} : moteur {engine+1} réglé directement dans le combiné (pas de preset simple source)</>}</p>}
   <label>Preset du moteur <select value={(()=>{const n=runningNumber??state.engineSources?.[engine]??origin?.preset?.number??null;return n!==null&&presets.some(p=>p.number===n)?String(n):''})()} disabled={locked||!presets.length}
    title={presets.length?'Charge un preset simple dans ce moteur seulement ; en combiné, le combiné est conservé':'Lisez la mémoire de l’appareil ou importez une sauvegarde dans la bibliothèque'}
    onChange={e=>{const p=presets.find(x=>String(x.number)===e.currentTarget.value);if(p)run(()=>{session.dispatch({type:'load-engine-frame',engine,bytes:p.frame});const r=session.lastOpen;if(r?.notes.length)onError(r.notes.join(' ; '))})}}>
    <option value="">{!presets.length?'— aucun preset lu ni importé —':runningName==='<Combined Preset>'&&runningNumber===null?'— contenu repris du combiné (sans numéro) —':state.type==='dual'?'— combiné : choisir un preset simple —':'— choisir un preset simple —'}</option>
    {presets.map(p=><option key={p.number} value={p.number}>{p.label}</option>)}</select></label>
   {pairsForM3000(current.algorithm).length>0&&<button type="button" disabled={locked} onClick={()=>onConvert(engine)} title="Copie les valeurs dont la correspondance est documentée ; le rapport liste ce qui n’est pas repris">Copier vers le M2000 ({pairsForM3000(current.algorithm).map(p=>m2000AlgorithmByKey(p.m2000)?.name).join(' / ')})</button>}
   {state.routing===4&&engine===1&&<p className="m3k-linked" role="note">Routage Linked : le moteur 2 suit le moteur 1 (copie). Ses valeurs se règlent sur le moteur 1.</p>}
   <small>Changer d’algorithme repart des valeurs initiales locales : les identifiants n’ont pas le même sens d’un algorithme à l’autre. Annuler revient en arrière.</small>
  </header>
  {(()=>{
   const output=new Set(['MIDI_MIX','MIDI_OUTLEV']),renderParam=(p:typeof table.params[number])=>{const v=current.values[String(p.id)],label=parameterLabel(p),selected=selection?.device==='m3000'&&selection.engine===engine&&selection.id===p.id
    return <div key={p.id} className={`m3k-param${selected?' m3k-selected':''}`}>
     <span className="m3k-param-label">{label}</span>
     <Knob id={`m3k-${engine}-${p.id}`} label={label} value={v} min={p.min} max={p.max} valueText={formatValue(p,v)} disabled={locked}
      onFocus={()=>run(()=>session.dispatch({type:'focus',engine,id:p.id}))} onChange={next=>run(()=>session.dispatch({type:'set-parameter',engine,id:p.id,value:next}))}/>
     <ValueEntry param={p} value={v} disabled={locked} onError={onError} onCommit={next=>run(()=>session.dispatch({type:'set-parameter',engine,id:p.id,value:next}))}/>
     <small className="m3k-meta" title={`SysEx ID ${p.id} · CC ${p.cc??'—'} · plage brute ${p.min}…${p.max} · spécification p.${table.page}${anchorHint(p)?` · bornes du manuel : ${anchorHint(p)} (intermédiaires non publiés)`:''}${orderPresumed(p)?' · libellés du manuel, ordre des valeurs présumé':''}`}>{hasConfirmedDisplay(p)?(orderPresumed(p)?'ordre présumé · ':''):'valeur brute · '}ID {p.id}</small>
    </div>}
   const sections=groups.map(g=>({...g,params:g.params.filter(p=>!output.has(p.name))})).filter(g=>g.params.length),levels=table.params.filter(p=>output.has(p.name))
   // FireworX ergonomics: full-width body, numbered sections in raised modules, output levels in their own module.
   return <div className="m3k-engine-body">
    <div className="m3k-sections">{sections.map((g,i)=><fieldset key={g.name} className="m3k-group m3k-module"><legend><span className="m3k-section-number">{String(i+1).padStart(2,'0')}</span>{g.name}</legend><div className="m3k-params">{g.params.map(renderParam)}</div></fieldset>)}</div>
    {levels.length>0&&<aside className="m3k-module m3k-output-module" aria-label="Sortie"><h3>→ Sortie</h3><div className="m3k-params">{levels.map(renderParam)}</div></aside>}
   </div>})()}
 </section>
}

/** ROUTING (setup key): a global setting of the unit, in single and combined use alike. */
function RoutingPage({session,state,locked,onError}:{session:M3000Session;state:M3000State;locked:boolean;onError:(m:string)=>void}){
 const run=(fn:()=>void)=>{try{fn()}catch(e){onError(e instanceof Error?e.message:String(e))}}
 const routingParam:Formattable={name:ROUTING.name,min:ROUTING.min,max:ROUTING.max,display:ROUTING.display}
 const routingChoices=Array.from({length:ROUTING.max!-ROUTING.min!+1},(_,i)=>ROUTING.min!+i).map(v=>{const label=hasConfirmedDisplay(routingParam)?formatValue(routingParam,v):`Routage ${v}`;return {value:v,label,kind:routingKind(String((ROUTING.display?.scale as {labels?:string[]}|undefined)?.labels?.[v]??label))}})
 return <section className="m3k-preset m3k-routing-page" aria-label="Routage">
  {/* The six routings drawn; Linked replaces engine 2, so it asks first. */}
  <div className="m3k-module m3k-routing" id="m3k-routing"><h3>Routage des moteurs (ROUTING)</h3>
   <RoutingPicker value={state.routing} disabled={locked} choices={routingChoices}
    onChange={v=>{if(routingChoices[v]?.kind==='linked'&&!window.confirm('Le routage Linked copie le moteur 1 dans le moteur 2 : le moteur 2 actuel sera remplacé. Continuer ?'))return;run(()=>session.dispatch({type:'set-routing',value:v}))}}
    note={orderPresumed(routingParam)?<small>Ordre de l’écran ROUTING du manuel ; correspondance confirmée sur l’appareil (paramètre système 34).</small>:null}/></div>
 <small>Le routage vaut pour l’appareil entier : avec deux presets simples comme avec un preset combiné (manuel p.18–19).</small>
 </section>
}

function PresetPage({session,state,locked,onError}:{session:M3000Session;state:M3000State;locked:boolean;onError:(m:string)=>void}){
 const [name,setName]=useState(state.name)
 useEffect(()=>setName(state.name),[state.name])
 const run=(fn:()=>void)=>{try{fn()}catch(e){onError(e instanceof Error?e.message:String(e))}}
 const routingParam:Formattable={name:ROUTING.name,min:ROUTING.min,max:ROUTING.max,display:ROUTING.display}
 const routingChoices=Array.from({length:ROUTING.max!-ROUTING.min!+1},(_,i)=>ROUTING.min!+i).map(v=>{const label=hasConfirmedDisplay(routingParam)?formatValue(routingParam,v):`Routage ${v}`;return {value:v,label,kind:routingKind(String((ROUTING.display?.scale as {labels?:string[]}|undefined)?.labels?.[v]??label))}})
 // COMBINED 1+2 EDIT (manual p.24): the relative output levels of the two engines = each engine's Out Level parameter.
 const levels=([0,1] as const).map(e=>({e,p:paramsFor(state.engines[e].algorithm).find(p=>p.name==='MIDI_OUTLEV')})).filter(x=>x.p)
 return <section className="m3k-preset" aria-label="Combiné 1+2">
  <div className="m3k-module m3k-combined-levels"><h3>Niveaux de sortie des moteurs (Combined Edit)</h3><div className="m3k-params">
   {levels.map(({e,p})=>{const v=state.engines[e].values[String(p!.id)],label=`Moteur ${e+1} · ${parameterLabel(p!)}`
    return <div key={e} className="m3k-param"><span className="m3k-param-label">{label}</span>
     <Knob id={`m3k-comb-${e}`} label={label} value={v} min={p!.min} max={p!.max} valueText={formatValue(p!,v)} disabled={locked||(e===1&&state.routing===4)} onChange={next=>run(()=>session.dispatch({type:'set-parameter',engine:e,id:p!.id,value:next}))}/>
     <ValueEntry param={p!} value={v} disabled={locked||(e===1&&state.routing===4)} onError={onError} onCommit={next=>run(()=>session.dispatch({type:'set-parameter',engine:e,id:p!.id,value:next}))}/></div>})}
  </div><small>Identiques au paramètre Out Level de chaque moteur (manuel p.24).</small></div>
  <div className="m3k-module m3k-morph"><h3>Dynamic Morphing</h3><div className="m3k-export">
   <label>Morphing <select value={state.morph.mode} disabled={locked} onChange={e=>run(()=>session.dispatch({type:'set-morph',field:'mode',value:Number(e.currentTarget.value)}))}>{['OFF','1-2','2-1'].map((l,v)=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Vitesse <select value={state.morph.speed} disabled={locked} onChange={e=>run(()=>session.dispatch({type:'set-morph',field:'speed',value:Number(e.currentTarget.value)}))}>{['SLOW','MED','FAST'].map((l,v)=><option key={v} value={v}>{l}</option>)}</select></label>
   <label>Seuil <select value={state.morph.threshold} disabled={locked} onChange={e=>run(()=>session.dispatch({type:'set-morph',field:'threshold',value:Number(e.currentTarget.value)}))}>{Array.from({length:35},(_,i)=>-40+i).map(v=><option key={v} value={v}>{v} dB</option>)}</select></label>
  </div><small>Passage dynamique d’un moteur à l’autre selon le niveau d’entrée ; disponible seulement en routage Parallel et mémorisé avec le preset combiné (manuel p.25). Seuil : valeur brute −40…−6, affichée en dB d’après l’exemple « −20dB » du manuel (échelle présumée).</small></div>
  <label>Nom <input value={name} maxLength={40} disabled={locked} onChange={e=>setName(e.currentTarget.value)} onBlur={()=>run(()=>session.dispatch({type:'set-name',value:name}))} onKeyDown={e=>{if(e.key==='Enter')run(()=>session.dispatch({type:'set-name',value:name}))}}/></label>
  <small>Les 20 premiers caractères (ASCII) sont écrits dans le preset quand il est envoyé, exporté ou mémorisé.</small>
  <div role="group" aria-label="Type de preset" className="m3k-segmented">
   {(['single','dual'] as const).map(t=><button key={t} type="button" aria-pressed={state.type===t} disabled={locked} onClick={()=>run(()=>session.dispatch({type:'set-type',value:t}))}>{t==='single'?'Simple (un moteur)':'Combiné 1+2 (deux moteurs)'}</button>)}
  </div>
 </section>
}

const DEVICE_CHOICES=[{id:'m3000',label:'M3000',detail:'Studio Reverb Processor'},{id:'m2000',label:'M2000',detail:'Studio Effects Processor'}] as const
const conversionText=(from:string,to:string,source:string,target:string,r:ConversionReport)=>[
 `Copie ${from} « ${source} » → ${to} « ${target} » (lien entre les algorithmes : ${RELATION[r.relation]??r.relation}).`,
 `${r.converted.length} valeur(s) reprise(s) avec une correspondance confirmée${r.converted.length?` (${r.converted.join(', ')})`:''}.`,
 r.hypotheses.length?`${r.hypotheses.length} reprise(s) sur hypothèse : ${r.hypotheses.join(', ')}.`:'',
 r.sameRange.length?`${r.sameRange.length} reprise(s) en position relative, en supposant la même plage sur les deux appareils (non documenté) : ${r.sameRange.join(', ')}.`:'',
 r.notCarried.length?`${r.notCarried.length} non reprise(s), laissée(s) aux valeurs initiales locales : ${r.notCarried.join(', ')}.`:'',
 r.outOfRange.length?`${r.outOfRange.length} hors plage de l’appareil cible : ${r.outOfRange.join(', ')}.`:'',
 'TC indique que les presets M2000 ne se chargent pas dans le M3000 : ce résultat est un brouillon à écouter, pas une équivalence. Annuler revient en arrière.'].filter(Boolean).join(' ')

export function M3000View({session,context,revision=0,locked,active,presentation,appearance,onMidiSettingsReady}:EditorViewProps&{session:M3000Session;context?:EditorViewContext;revision?:number;onMidiSettingsReady?:(open:(()=>void)|undefined)=>void}){
 const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot) as ReturnType<M3000Session['getSnapshot']>
 // Host language: parameter labels and values from the manuals' English, the rest of the page translated (locale.ts).
 const language=useLanguage(),rootRef=useRef<HTMLDivElement>(null);setDisplayLanguage(language);useDomLocale(rootRef,language)
 const workspace=snapshot.state,device=workspace.device,state=workspace.m3000,m2000=workspace.m2000
 const [page,setPage]=useState<Page>('engine0'),[library,setLibrary]=useState<LibrarianStart|null>(null),[libraryRevision,setLibraryRevision]=useState(0),[variations,setVariations]=useState(false),[notice,setNotice]=useState(''),[conversion,setConversion]=useState(''),[assumeSameRange,setAssumeSameRange]=useState(false)
 // Host MIDI icon beside the connection status: the « Appareil (MIDI) » page (ports, identification, sending).
 useEffect(()=>{if(!context)return;onMidiSettingsReady?.(()=>setPage('device'));return()=>onMidiSettingsReady?.(undefined)},[onMidiSettingsReady,context])
 const disabled=locked||snapshot.locked,onError=(m:string)=>setNotice(m)
 const link=useHardwareLink(context,session,disabled,revision)
 const enginePresets=useSinglePresets(state,libraryRevision),donors=useMemo(()=>enginePresets.singles.map(p=>({name:p.label.split(' (')[0],frame:p.frame})),[enginePresets.singles])
 // A refusal stays visible until dismissed or until the next accepted change of the workspace.
 useEffect(()=>setNotice(''),[workspace])
 const engineIndex:EngineIndex=page==='engine1'?1:0
 const selected=snapshot.selection?.device===device?snapshot.selection:null
 const selected3=selected?.device==='m3000'?selected:null,selected2=selected?.device==='m2000'?selected:null
 const param3=selected3?paramsFor(state.engines[selected3.engine].algorithm).find(p=>p.id===selected3.id):undefined
 const param2=selected2?m2000ParamsFor(m2000.engines[selected2.engine].algorithm).find(p=>p.key===selected2.key):undefined
 const running=device==='m3000'?snapshot.hardware.running:null
 const runningLabel=(e:0|1)=>!running?null:running.combined!==null?`combiné ${running.combined} « ${running.combinedName??''} »`:running.singles[e]!==null?`preset ${running.singles[e]} « ${running.names[e]} »`:null
 const lcdLines=useMemo(()=>[0,1].map(e=>{
  if(device==='m2000'){const engine=m2000.engines[e],algorithm=m2000Algorithm(engine.algorithm),shown=selected2?.engine===e&&param2?param2:algorithm.params[0]
   return {engine:(e+1) as 1|2,type:algorithm.name.toUpperCase(),parameter:shown?m2000Label(shown).toUpperCase():'',value:shown?formatM2000(shown,engine.values[shown.key]):'',name:e===0||m2000.type==='dual'?m2000.name:'—'} as LcdEngineLine}
  const engine=state.engines[e],algorithm=algorithmById(engine.algorithm)!,first=paramsFor(engine.algorithm)[0],shown=selected3?.engine===e&&param3?param3:first
  return {engine:(e+1) as 1|2,type:algorithm.name.toUpperCase(),parameter:parameterLabel(shown).toUpperCase(),value:formatValue(shown,engine.values[String(shown.id)]),name:running?(running.combined!==null?running.combinedName??'':running.names[e]):e===0||state.type==='dual'?state.name:'—',number:running?(running.combined!==null?String(running.combined):running.singles[e]!==null?String(running.singles[e]):''):undefined} as LcdEngineLine}) as [LcdEngineLine,LcdEngineLine],[device,state,m2000,selected2,selected3,param2,param3,running])
 const actions:Record<string,string>={'engine1.edit':'Éditer le moteur 1','engine2.edit':'Éditer le moteur 2','combined.edit':'Preset combiné et routage','setup.routing':'Routage',
  'engine1.recall':'Rappel : presets du moteur 1','engine2.recall':'Rappel : presets du moteur 2','combined.recall':'Rappel : presets combinés','engine1.store':'Mémoriser le moteur 1','engine2.store':'Mémoriser le moteur 2','combined.store':'Mémoriser le combiné 1+2',
  ...(context&&device==='m3000'?{'snapshot.1':'Rappeler le snapshot 1','snapshot.2':'Rappeler le snapshot 2','snapshot.3':'Rappeler le snapshot 3','snapshot.4':'Rappeler le snapshot 4'}:{}),
  'control.cursor_up':'Paramètre précédent','control.cursor_down':'Paramètre suivant',...(context?{'setup.util_midi':'MIDI : appareil, lecture et envoi'}:{})}
 const lit=new Set<string>(['power',page==='engine0'?'engine1.edit':page==='engine1'?'engine2.edit':page==='preset'?'combined.edit':'',page==='routing'?'setup.routing':'',page==='device'?'setup.util_midi':'',library?`${['engine1','engine2','combined'][library.section]}.${library.store?'store':'recall'}`:''])
 const moveSelection=(delta:number)=>{const e=page==='engine1'?1:0
  if(device==='m2000'){const params=m2000ParamsFor(m2000.engines[e].algorithm),i=selected2?.engine===e?params.findIndex(p=>p.key===selected2.key):-1,next=params[(i+delta+params.length)%params.length]
   session.dispatch({type:'focus',device:'m2000',engine:e,key:next.key});document.getElementById(`m2k-${e}-${next.key}`)?.focus();return}
  const params=paramsFor(state.engines[e].algorithm),i=selected3?.engine===e?params.findIndex(p=>p.id===selected3.id):-1
  const next=params[(i+delta+params.length)%params.length];session.dispatch({type:'focus',device:'m3000',engine:e,id:next.id});document.getElementById(`m3k-${e}-${next.id}`)?.focus()}
 const onKey=(id:string)=>{
  if(id==='engine1.edit')setPage('engine0');else if(id==='engine2.edit')setPage('engine1');else if(id==='combined.edit')setPage('preset');else if(id==='setup.routing')setPage('routing')
  else if(id==='setup.util_midi')setPage('device');else if(/\.(recall|store)$/.test(id)&&device==='m3000'){const section=id.startsWith('engine1')?0:id.startsWith('engine2')?1:2,store=id.endsWith('store')
   // RECALL / STORE keys open the librarian on the bank of that section (user bank and STORE mode for STORE).
   setLibrary({section,store,view:{type:'device',bank:section===2?(store?'user-combined':'factory-combined'):(store?'user-single':'factory-single')}})}
  else if(/^snapshot\.\d$/.test(id)&&context){const n=256+Number(id.slice(-1)),w=context.broker.authorize(context.id,'edit-buffer'),q=context.broker.authorize(context.id,'query');session.hardware.recall(w,q,2,n).catch(e=>onError(e instanceof Error?e.message:String(e))).finally(()=>{context.broker.revoke(w);context.broker.revoke(q)})}else if(id==='control.cursor_up')moveSelection(-1);else if(id==='control.cursor_down')moveSelection(1)}
 const onAdjust=(delta:number)=>{if(disabled)return
  try{
   if(selected2&&param2){const v=m2000.engines[selected2.engine].values[selected2.key];session.dispatch({type:'m2000-set-parameter',engine:selected2.engine,key:selected2.key,value:Math.max(0,Math.min(param2.domain.max,v+delta))});return}
   if(selected3&&param3){const v=state.engines[selected3.engine].values[String(selected3.id)];session.dispatch({type:'set-parameter',engine:selected3.engine,id:selected3.id,value:Math.max(param3.min,Math.min(param3.max,v+delta))})}
  }catch(e){onError(e instanceof Error?e.message:String(e))}}
 const adjustLabel=param2&&selected2?`${m2000Label(param2)} ${formatM2000(param2,m2000.engines[selected2.engine].values[selected2.key])}`:param3&&selected3?`${parameterLabel(param3)} ${formatValue(param3,state.engines[selected3.engine].values[String(selected3.id)])}`:'aucun paramètre sélectionné'
 const activity=param2&&selected2?{controlId:`m2000:${selected2.engine}:${selected2.key}`,label:m2000Label(param2),value:m2000.engines[selected2.engine].values[selected2.key],source:'local' as const}
  :param3&&selected3?{controlId:`${selected3.engine}:${selected3.id}`,label:parameterLabel(param3),value:state.engines[selected3.engine].values[String(selected3.id)],source:'local' as const}:null
 const switchDevice=(next:DeviceId)=>{try{session.dispatch({type:'set-device',device:next});setConversion('')}catch(e){onError(e instanceof Error?e.message:String(e))}}
 // Conversions are computed with the pure functions, then committed in one replace (one undo step, device included).
 const convert=(engine:EngineIndex,m3000Algorithm?:number)=>{try{
  const options={assumeSameRange}
  if(device==='m2000'){const source=m2000.engines[engine],{engine:converted,report}=convertToM3000(source,m3000Algorithm,options),engines=[...state.engines] as M3000State['engines'];engines[engine]=converted
   session.dispatch({type:'replace',state:{...workspace,device:'m3000',m3000:{...state,engines}}});setConversion(conversionText('M2000','M3000',m2000Algorithm(source.algorithm).name,algorithmById(converted.algorithm)!.name,report))}
  else{const source=state.engines[engine],{engine:converted,report}=convertToM2000(source,options),engines=[...m2000.engines] as M2000State['engines'];engines[engine]=converted
   session.dispatch({type:'replace',state:{...workspace,device:'m2000',m2000:{...m2000,engines}}});setConversion(conversionText('M3000','M2000',algorithmById(source.algorithm)!.name,m2000Algorithm(converted.algorithm).name,report))}
 }catch(e){onError(e instanceof Error?e.message:String(e))}}
 const name=device==='m2000'?'M2000':'M3000'
 return <div ref={rootRef} className="m3k-root studio" data-theme={appearance.theme} data-device={device} lang={language==='fr'?'fr':'en'}>
  <p className="m3k-banner" role="note">{device==='m3000'&&snapshot.hardware.identity?<>M3000 connecté · logiciel {snapshot.hardware.identity.version}{snapshot.hardware.live?' · envoi en direct actif':''} · mémorisation seulement en mémoire utilisateur, après confirmation.</>:device==='m3000'?<>M3000 hors ligne · {m3000HardwarePolicy.reason}</>:<>M2000 hors ligne · aucun SysEx publié ; non validé sur matériel.</>}</p>
  <DeviceSlider choices={DEVICE_CHOICES} value={device} disabled={disabled} onChange={switchDevice}/>
  <div className="m3k-panel-wrap"><M3000Panel model={device} litKeys={lit} actions={actions} lcdLines={lcdLines} onKey={onKey} onAdjust={onAdjust} adjustLabel={adjustLabel}/></div>
  <div className="m3k-toolbar">
   <nav className="m3k-tabs" aria-label="Pages de l’éditeur">{([['engine0','Moteur 1'],['engine1','Moteur 2'],['preset','Combiné 1+2'],['routing','Routage'],...(device==='m2000'?[['files','Fichiers']] as const:[]),...(context?[['device','Appareil (MIDI)']] as const:[])] as readonly (readonly [Page,string])[]).map(([id,label])=>
    <button key={id} type="button" aria-pressed={page===id} onClick={()=>setPage(id)}>{label}</button>)}</nav>
   {device==='m3000'&&<button type="button" className="m3k-open-library" aria-haspopup="dialog" aria-expanded={variations} disabled={disabled} onClick={()=>setVariations(true)}>⚄ Variations</button>}
   {device==='m3000'&&<button type="button" className="m3k-open-library" aria-haspopup="dialog" aria-expanded={!!library} onClick={()=>setLibrary({section:2,store:false,view:{type:'device',bank:'factory-combined'}})}>Bibliothèque de presets</button>}
   {context&&<button type="button" className="m3k-link-chip" data-live={snapshot.hardware.live} onClick={()=>setPage('device')} title={link.error||'Connexion MIDI et envoi automatique'}>{snapshot.hardware.live?'● M3000 · envoi automatique':snapshot.hardware.identity?'● M3000 · envoi coupé':snapshot.hardware.busy?'◌ '+snapshot.hardware.busy:'○ Appareil non connecté'}</button>}
   <EditorHistoryTools session={session} snapshot={snapshot} active={active} onError={e=>onError(e instanceof Error?e.message:String(e))}/>
   <PresentationTools preferences={presentation} activity={activity}/>
  </div>
  {notice&&<p className="m3k-notice" role="alert" onClick={()=>setNotice('')}>{notice}</p>}
  {(page==='engine0'||page==='engine1')&&<label className="m3k-assume"><input type="checkbox" checked={assumeSameRange} onChange={e=>setAssumeSameRange(e.currentTarget.checked)}/> Pour « Copier vers… » : reprendre aussi les valeurs sans échelle publiée en supposant la même plage sur les deux appareils (position relative, non documenté)</label>}
  {conversion&&<p className="m3k-conversion" role="status">{conversion}</p>}
  {device==='m3000'&&<M3000Variations session={session} state={state} donors={donors} open={variations} locked={disabled} onClose={()=>setVariations(false)}/>}
  {device==='m3000'&&<M3000Librarian context={context} session={session} state={state} hardware={snapshot.hardware} open={!!library} start={library} locked={disabled} onClose={()=>{setLibrary(null);setLibraryRevision(r=>r+1)}}/>}
  {page==='device'&&context?<DevicePanel context={context} session={session} state={state} hardware={snapshot.hardware} locked={disabled} revision={revision} link={link} onError={onError}/>
   :device==='m2000'
   ?page==='engine0'||page==='engine1'?<M2000EnginePage key={`m2000-${engineIndex}`} session={session} state={m2000} engine={engineIndex} selection={selected} locked={disabled} onError={onError} onConvert={convert}/>
    :page==='preset'?<M2000PresetPage session={session} state={m2000} locked={disabled} onError={onError}/>
    :page==='routing'?<M2000RoutingPage session={session} state={m2000} locked={disabled} onError={onError}/>
    :<M2000FilesPage session={session} state={m2000} locked={disabled} onError={onError}/>
   :page==='engine0'||page==='engine1'?<EnginePage key={`m3000-${engineIndex}`} session={session} state={state} engine={engineIndex} selection={selected} locked={disabled} onError={onError} onConvert={convert} runningLabel={runningLabel(engineIndex)} presets={enginePresets.singles} runningNumber={running&&running.combined===null?running.singles[engineIndex]:null} origin={engineOrigin(state,running?.combined??null,enginePresets.combined,enginePresets.singles,engineIndex)} runningName={running?running.names[engineIndex]:null}/>
    :page==='routing'?<RoutingPage session={session} state={state} locked={disabled} onError={onError}/>
    :<PresetPage session={session} state={state} locked={disabled} onError={onError}/>}
 </div>
}

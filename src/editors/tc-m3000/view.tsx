import {useEffect,useMemo,useState,useSyncExternalStore,type ChangeEvent} from 'react'
import type {EditorViewProps} from '../../editor-host/view-contract'
import type {EditorSnapshot} from '../../editor-host/contracts'
import {EditorHistoryTools} from '../../editor-host/EditorHistoryTools'
import {PresentationTools} from '../../editor-host/PresentationTools'
import {m3000Map} from './parameter-map'
import {m3000HardwarePolicy,type M3000Session,type M3000Selection} from './module'
import {algorithmById,exportParameterSysex,importSysex,paramsFor,tableFor,type EngineIndex,type M3000State} from './model'
import {m2000Algorithm,m2000AlgorithmByKey,m2000ParamsFor,type M2000State} from './m2000-model'
import {formatM2000,m2000Label} from './m2000-format'
import {M2000EnginePage,M2000FilesPage,M2000PresetPage,RELATION} from './m2000-view'
import {convertToM2000,convertToM3000,pairsForM3000,type ConversionReport} from './conversion'
import {DeviceSlider} from './device-slider'
import type {DeviceId,TcWorkspace} from './workspace'
import {describePreset} from './protocol'
import {anchorHint,formatValue,orderPresumed,parameterLabel,parseEntry,hasConfirmedDisplay,type Formattable} from './format'
import {Knob} from './knob'
import {ValueEntry as SharedValueEntry,download,safeName as safeFileName} from './value-entry'
import {M3000Panel,type LcdEngineLine} from './panel'
import './m3000.css'

type Page='engine0'|'engine1'|'preset'|'files'
const ROUTING=m3000Map.system.find(p=>p.name==='MIDI_ROUTING')!
const safeName=(s:string)=>safeFileName(s,'M3000')
function ValueEntry({param,value,disabled,onCommit,onError}:{param:Formattable;value:number;disabled?:boolean;onCommit:(v:number)=>void;onError:(m:string)=>void}){
 return <SharedValueEntry label={parameterLabel(param)} value={value} disabled={disabled} format={v=>formatValue(param,v)} parse={t=>parseEntry(param,t)} onCommit={onCommit} onError={onError}/>
}

function EnginePage({session,state,engine,selection,locked,onError,onConvert}:{session:M3000Session;state:M3000State;engine:EngineIndex;selection:M3000Selection|null;locked:boolean;onError:(m:string)=>void;onConvert:(engine:EngineIndex)=>void}){
 const current=state.engines[engine],table=tableFor(current.algorithm),[choice,setChoice]=useState(current.algorithm)
 useEffect(()=>setChoice(current.algorithm),[current.algorithm])
 const groups=table.groups?.length?table.groups.map(g=>({name:g.name_fr||g.name_en||'Paramètres',params:g.params.map(id=>table.params.find(p=>p.id===id)).filter(Boolean) as typeof table.params[number][]}))
  :[{name:'Paramètres',params:[...table.params]}]
 const grouped=new Set(groups.flatMap(g=>g.params.map(p=>p.id))),rest=table.params.filter(p=>!grouped.has(p.id))
 if(rest.length)groups.push({name:'Autres paramètres',params:[...rest]})
 const run=(fn:()=>void)=>{try{fn()}catch(e){onError(e instanceof Error?e.message:String(e))}}
 return <section className="m3k-engine" aria-label={`Moteur ${engine+1}`}>
  <header className="m3k-engine-head">
   <h2>Moteur {engine+1}{state.type==='single'&&engine===1?' · inactif en preset simple':''}</h2>
   <label>Algorithme <select value={choice} disabled={locked} onChange={e=>setChoice(Number(e.currentTarget.value))}>
    {m3000Map.algorithms.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
   <button type="button" disabled={locked||choice===current.algorithm} onClick={()=>run(()=>session.dispatch({type:'set-algorithm',engine,algorithm:choice}))}>Appliquer l’algorithme</button>
   {pairsForM3000(current.algorithm).length>0&&<button type="button" disabled={locked} onClick={()=>onConvert(engine)} title="Copie les valeurs dont la correspondance est documentée ; le rapport liste ce qui n’est pas repris">Copier vers le M2000 ({pairsForM3000(current.algorithm).map(p=>m2000AlgorithmByKey(p.m2000)?.name).join(' / ')})</button>}
   <small>Changer d’algorithme repart des valeurs initiales locales : les identifiants n’ont pas le même sens d’un algorithme à l’autre. Annuler revient en arrière.</small>
  </header>
  {groups.map(g=><fieldset key={g.name} className="m3k-group"><legend>{g.name}</legend><div className="m3k-params">
   {g.params.map(p=>{const v=current.values[String(p.id)],label=parameterLabel(p),selected=selection?.device==='m3000'&&selection.engine===engine&&selection.id===p.id
    return <div key={p.id} className={`m3k-param${selected?' m3k-selected':''}`}>
     <span className="m3k-param-label">{label}</span>
     <Knob id={`m3k-${engine}-${p.id}`} label={label} value={v} min={p.min} max={p.max} valueText={formatValue(p,v)} disabled={locked}
      onFocus={()=>run(()=>session.dispatch({type:'focus',engine,id:p.id}))} onChange={next=>run(()=>session.dispatch({type:'set-parameter',engine,id:p.id,value:next}))}/>
     <ValueEntry param={p} value={v} disabled={locked} onError={onError} onCommit={next=>run(()=>session.dispatch({type:'set-parameter',engine,id:p.id,value:next}))}/>
     <small className="m3k-meta" title={`SysEx ID ${p.id} · CC ${p.cc??'—'} · plage brute ${p.min}…${p.max} · spécification p.${table.page}${anchorHint(p)?` · bornes du manuel : ${anchorHint(p)} (intermédiaires non publiés)`:''}${orderPresumed(p)?' · libellés du manuel, ordre des valeurs présumé':''}`}>{hasConfirmedDisplay(p)?(orderPresumed(p)?'ordre présumé · ':''):'valeur brute · '}ID {p.id}</small>
    </div>})}
  </div></fieldset>)}
 </section>
}

function PresetPage({session,state,locked,onError}:{session:M3000Session;state:M3000State;locked:boolean;onError:(m:string)=>void}){
 const [name,setName]=useState(state.name),[routing,setRouting]=useState(state.routing)
 useEffect(()=>setName(state.name),[state.name]);useEffect(()=>setRouting(state.routing),[state.routing])
 const run=(fn:()=>void)=>{try{fn()}catch(e){onError(e instanceof Error?e.message:String(e))}}
 const routingParam:Formattable={name:ROUTING.name,min:ROUTING.min,max:ROUTING.max,display:ROUTING.display}
 return <section className="m3k-preset" aria-label="Preset et routage">
  <label>Nom local <input value={name} maxLength={40} disabled={locked} onChange={e=>setName(e.currentTarget.value)} onBlur={()=>run(()=>session.dispatch({type:'set-name',value:name}))} onKeyDown={e=>{if(e.key==='Enter')run(()=>session.dispatch({type:'set-name',value:name}))}}/></label>
  <small>Le codage du nom dans un dump M3000 n’est pas publié : ce nom reste local à l’éditeur.</small>
  <div role="group" aria-label="Type de preset" className="m3k-segmented">
   {(['single','dual'] as const).map(t=><button key={t} type="button" aria-pressed={state.type===t} disabled={locked} onClick={()=>run(()=>session.dispatch({type:'set-type',value:t}))}>{t==='single'?'Simple (un moteur)':'Combiné 1+2 (deux moteurs)'}</button>)}
  </div>
  <label>Routage (paramètre système ID {ROUTING.id}) <select value={routing} disabled={locked} onChange={e=>setRouting(Number(e.currentTarget.value))}>
   {Array.from({length:ROUTING.max!-ROUTING.min!+1},(_,i)=>ROUTING.min!+i).map(v=><option key={v} value={v}>{hasConfirmedDisplay(routingParam)?formatValue(routingParam,v):`Routage ${v} (libellé non confirmé)`}</option>)}</select></label>
  <button type="button" disabled={locked||routing===state.routing} onClick={()=>run(()=>session.dispatch({type:'set-routing',value:routing}))}>Appliquer le routage</button>
  {orderPresumed(routingParam)&&<small>Libellés et ordre de l’écran ROUTING (manuel) ; la correspondance valeur 0 = premier libellé est présumée, à vérifier sur l’appareil.</small>}
 </section>
}

function FilesPage({session,state,locked,onError}:{session:M3000Session;state:M3000State;locked:boolean;onError:(m:string)=>void}){
 const [device,setDevice]=useState(0),[report,setReport]=useState<string>('')
 async function importFile(e:ChangeEvent<HTMLInputElement>){
  const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(!file)return
  try{
   if(file.size>4*1024*1024)throw Error('Fichier trop volumineux')
   const bytes=new Uint8Array(await file.arrayBuffer())
   if(/\.json$/i.test(file.name)){session.dispatch({type:'replace',state:JSON.parse(new TextDecoder().decode(bytes))});setReport(`Espace « ${file.name} » ouvert. Annuler revient à l’état précédent.`);return}
   // The host may hand the view a wrapped session: compute the report with the pure model, then commit through replace.
   const {state:next,report:r}=importSysex(state,bytes);session.dispatch({type:'replace',state:next})
   setReport(`${file.name} : ${r.presetDumps} dump(s) Preset Data conservé(s) tels quels${r.checksumUnconfirmed?` (dont ${r.checksumUnconfirmed} au checksum non confirmé)`:''}, ${r.appliedValues} valeur(s) de paramètres appliquée(s), ${r.ignoredValues} ignorée(s) (hors algorithme ou hors domaine), ${r.foreignFrames} message(s) étranger(s), ${r.stray} octet(s) hors message.`)
  }catch(err){onError(err instanceof Error?err.message:String(err))}
 }
 return <section className="m3k-files" aria-label="Fichiers">
  <label className="m3k-file">Importer un .syx ou un espace .json <input type="file" accept=".syx,.json" disabled={locked} onChange={importFile}/></label>
  {report&&<p role="status">{report}</p>}
  <div className="m3k-export">
   <label>Device ID SysEx <input type="number" min={0} max={127} value={device} onChange={e=>setDevice(Math.max(0,Math.min(127,Math.trunc(Number(e.currentTarget.value)||0))))}/></label>
   <button type="button" onClick={()=>download(`${safeName(state.name)}-parametres.syx`,exportParameterSysex(state,device),'application/octet-stream')}>Exporter les paramètres (.syx)</button>
   <button type="button" onClick={()=>download(`${safeName(state.name)}.m3000.json`,JSON.stringify(session.serialize(),null,1),'application/json')}>Exporter l’espace (.json)</button>
  </div>
  <small>Le .syx exporté contient un message Parameter Data par paramètre (spécification p.3). Il ne change pas l’algorithme de l’appareil, faute de message documenté pour cela : sélectionnez d’abord le même algorithme sur le M3000.</small>
  <h3>Dumps conservés ({state.originals.length})</h3>
  {state.originals.length?<ul className="m3k-originals">{state.originals.map((o,i)=>{const where=describePreset(o.kind,o.preset)
   return <li key={i}><span>{o.kind===2?'Combiné':'Simple'} · {where.bank==='edit'?'buffer d’édition':`${where.bank} ${where.slot}`} · {o.bytes.length} octets{o.checksumDecoded?'':' · checksum non confirmé'}</span>
    <button type="button" onClick={()=>download(`M3000-${o.kind===2?'dual':'single'}-${o.preset}.syx`,Uint8Array.from(o.bytes),'application/octet-stream')}>Télécharger l’original</button>
    <button type="button" disabled={locked} onClick={()=>{try{session.dispatch({type:'remove-original',index:i})}catch(e){onError(e instanceof Error?e.message:String(e))}}}>Retirer</button></li>})}</ul>
   :<p>Aucun. Les dumps Preset Data importés sont gardés octet pour octet : leur structure interne n’est pas publiée par TC, ils ne sont donc pas décodés.</p>}
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

export function M3000View({session,locked,active,presentation,appearance}:EditorViewProps&{session:M3000Session}){
 const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot) as EditorSnapshot<TcWorkspace,M3000Selection>
 const workspace=snapshot.state,device=workspace.device,state=workspace.m3000,m2000=workspace.m2000
 const [page,setPage]=useState<Page>('engine0'),[notice,setNotice]=useState(''),[conversion,setConversion]=useState(''),[assumeSameRange,setAssumeSameRange]=useState(false)
 const disabled=locked||snapshot.locked,onError=(m:string)=>setNotice(m)
 // A refusal stays visible until dismissed or until the next accepted change of the workspace.
 useEffect(()=>setNotice(''),[workspace])
 const engineIndex:EngineIndex=page==='engine1'?1:0
 const selected=snapshot.selection?.device===device?snapshot.selection:null
 const selected3=selected?.device==='m3000'?selected:null,selected2=selected?.device==='m2000'?selected:null
 const param3=selected3?paramsFor(state.engines[selected3.engine].algorithm).find(p=>p.id===selected3.id):undefined
 const param2=selected2?m2000ParamsFor(m2000.engines[selected2.engine].algorithm).find(p=>p.key===selected2.key):undefined
 const lcdLines=useMemo(()=>[0,1].map(e=>{
  if(device==='m2000'){const engine=m2000.engines[e],algorithm=m2000Algorithm(engine.algorithm),shown=selected2?.engine===e&&param2?param2:algorithm.params[0]
   return {engine:(e+1) as 1|2,type:algorithm.name.toUpperCase(),parameter:shown?m2000Label(shown).toUpperCase():'',value:shown?formatM2000(shown,engine.values[shown.key]):'',name:e===0||m2000.type==='dual'?m2000.name:'—',inactive:m2000.type==='single'&&e===1} as LcdEngineLine}
  const engine=state.engines[e],algorithm=algorithmById(engine.algorithm)!,first=paramsFor(engine.algorithm)[0],shown=selected3?.engine===e&&param3?param3:first
  return {engine:(e+1) as 1|2,type:algorithm.name.toUpperCase(),parameter:parameterLabel(shown).toUpperCase(),value:formatValue(shown,engine.values[String(shown.id)]),name:e===0||state.type==='dual'?state.name:'—',inactive:state.type==='single'&&e===1} as LcdEngineLine}) as [LcdEngineLine,LcdEngineLine],[device,state,m2000,selected2,selected3,param2,param3])
 const actions:Record<string,string>={'engine1.edit':'Éditer le moteur 1','engine2.edit':'Éditer le moteur 2','combined.edit':'Preset combiné et routage','setup.routing':'Routage',
  'engine1.recall':'Fichiers : importer','engine2.recall':'Fichiers : importer','combined.recall':'Fichiers : importer','engine1.store':'Fichiers : exporter','engine2.store':'Fichiers : exporter','combined.store':'Fichiers : exporter',
  'control.cursor_up':'Paramètre précédent','control.cursor_down':'Paramètre suivant'}
 const lit=new Set<string>(['power',page==='engine0'?'engine1.edit':page==='engine1'?'engine2.edit':page==='preset'?'combined.edit':'',page==='preset'?'setup.routing':''])
 const moveSelection=(delta:number)=>{const e=page==='engine1'?1:0
  if(device==='m2000'){const params=m2000ParamsFor(m2000.engines[e].algorithm),i=selected2?.engine===e?params.findIndex(p=>p.key===selected2.key):-1,next=params[(i+delta+params.length)%params.length]
   session.dispatch({type:'focus',device:'m2000',engine:e,key:next.key});document.getElementById(`m2k-${e}-${next.key}`)?.focus();return}
  const params=paramsFor(state.engines[e].algorithm),i=selected3?.engine===e?params.findIndex(p=>p.id===selected3.id):-1
  const next=params[(i+delta+params.length)%params.length];session.dispatch({type:'focus',device:'m3000',engine:e,id:next.id});document.getElementById(`m3k-${e}-${next.id}`)?.focus()}
 const onKey=(id:string)=>{
  if(id==='engine1.edit')setPage('engine0');else if(id==='engine2.edit')setPage('engine1');else if(id==='combined.edit'||id==='setup.routing')setPage('preset')
  else if(/\.(recall|store)$/.test(id))setPage('files');else if(id==='control.cursor_up')moveSelection(-1);else if(id==='control.cursor_down')moveSelection(1)}
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
 return <div className="m3k-root studio" data-theme={appearance.theme} data-device={device}>
  <p className="m3k-banner" role="note">Hors ligne · {m3000HardwarePolicy.reason} {name} non validé sur matériel.</p>
  <DeviceSlider choices={DEVICE_CHOICES} value={device} disabled={disabled} onChange={switchDevice}/>
  <div className="m3k-panel-wrap"><M3000Panel model={device} litKeys={lit} actions={actions} lcdLines={lcdLines} onKey={onKey} onAdjust={onAdjust} adjustLabel={adjustLabel}/></div>
  <div className="m3k-toolbar">
   <nav className="m3k-tabs" aria-label="Pages de l’éditeur">{([['engine0','Moteur 1'],['engine1','Moteur 2'],['preset','Preset et routage'],['files','Fichiers']] as const).map(([id,label])=>
    <button key={id} type="button" aria-pressed={page===id} onClick={()=>setPage(id)}>{label}</button>)}</nav>
   <EditorHistoryTools session={session} snapshot={snapshot} active={active} onError={e=>onError(e instanceof Error?e.message:String(e))}/>
   <PresentationTools preferences={presentation} activity={activity}/>
  </div>
  {notice&&<p className="m3k-notice" role="alert" onClick={()=>setNotice('')}>{notice}</p>}
  {(page==='engine0'||page==='engine1')&&<label className="m3k-assume"><input type="checkbox" checked={assumeSameRange} onChange={e=>setAssumeSameRange(e.currentTarget.checked)}/> Pour « Copier vers… » : reprendre aussi les valeurs sans échelle publiée en supposant la même plage sur les deux appareils (position relative, non documenté)</label>}
  {conversion&&<p className="m3k-conversion" role="status">{conversion}</p>}
  {device==='m2000'
   ?page==='engine0'||page==='engine1'?<M2000EnginePage session={session} state={m2000} engine={engineIndex} selection={selected} locked={disabled} onError={onError} onConvert={convert}/>
    :page==='preset'?<M2000PresetPage session={session} state={m2000} locked={disabled} onError={onError}/>
    :<M2000FilesPage session={session} state={m2000} locked={disabled} onError={onError}/>
   :page==='engine0'||page==='engine1'?<EnginePage session={session} state={state} engine={engineIndex} selection={selected} locked={disabled} onError={onError} onConvert={convert}/>
    :page==='preset'?<PresetPage session={session} state={state} locked={disabled} onError={onError}/>
    :<FilesPage session={session} state={state} locked={disabled} onError={onError}/>}
 </div>
}

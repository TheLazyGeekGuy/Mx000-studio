// M3000 librarian window: the FireworX preset manager's layout and behaviour (sources · classification · list ·
// inspector, local banks, favourites, tags, import/export) on the host's shared local library (IndexedDB, originals kept
// byte for byte). Separate from editing: it opens over the editor and closes after loading if asked.
import {useCallback,useEffect,useMemo,useRef,useState,type ChangeEvent,type DragEvent,type KeyboardEvent} from 'react'
import type {EditorViewContext} from '../../editor-host/view-contract'
import type {M3000Session} from './module'
import type {HardwareSnapshot} from './hardware'
import type {TcWorkspace} from './workspace'
import {openLibraryStorage,importLibraryFile,type LibrarySource,type LibraryStorage} from '../../library/storage'
import {annotate,type EntryRef,type LibraryMetadata} from '../../library/metadata'
import {exportLibraryArchive,restoreLibraryArchive} from '../../library/archive'
import {parseMessage,presetDataFrame} from './protocol'
import {exportParameterSysex,importSysex,splitSysex,type M3000State} from './model'
import {encodeDraft,hasLayout} from './preset-codec'
import {download,safeName} from './value-entry'
import {DEVICE_BANKS,PAGE_SIZE,addToBank,algorithmNames,buildRows,captureName,classify,coverage,createBank,deleteBank,deviceBank,describeFrame,displayName,exportFrames,filterRows,libraryEntries,moveInBank,pageCount,pageOf,parseTags,removeFromBank,
 type DeviceBankId,type Duplicates,type LibraryView,type Row,type Sort} from './librarian-model'

export interface LibrarianStart {view:LibraryView;store:boolean;section:0|1|2}
const CLOSE_KEY='midi-studio.tc-m3000.library-close-after-load'
const readFlag=(key:string,fallback:boolean)=>{try{const v=localStorage.getItem(key);return v===null?fallback:v==='true'}catch{return fallback}}
const STATE_LABEL={read:'Lu',unread:'Non lu',empty:'Emplacement vide',file:'Fichier local',copy:'Copie locale · non lu'} as const
const text=(e:unknown)=>e instanceof Error?e.message:String(e)

export function M3000Librarian({context,session,state,hardware,open,start,locked,onClose}:{context?:EditorViewContext;session:M3000Session;state:M3000State;hardware:HardwareSnapshot
 open:boolean;start:LibrarianStart|null;locked:boolean;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),storageRef=useRef<LibraryStorage|null>(null)
 const [sources,setSources]=useState<LibrarySource[]>([]),[metadata,setMetadata]=useState<LibraryMetadata|null>(null),[storageError,setStorageError]=useState('')
 const [view,setView]=useState<LibraryView>({type:'device',bank:'factory-single'}),[store,setStore]=useState(false),[storeSection,setStoreSection]=useState<0|1|2>(0)
 const [selectedKey,setSelectedKey]=useState<string|null>(null),[query,setQuery]=useState(''),[favorites,setFavorites]=useState(false),[algorithm,setAlgorithm]=useState<number|null>(null),[tag,setTag]=useState<string|null>(null)
 const [sort,setSort]=useState<Sort>('original'),[duplicates,setDuplicates]=useState<Duplicates>('all'),[layout,setLayout]=useState<'list'|'grid'>('list'),[page,setPage]=useState(0)
 const [status,setStatus]=useState('Choisissez une banque, une lecture ou un fichier. Toute mémorisation en mémoire utilisateur demande une confirmation.')
 const [closeAfterLoad,setCloseAfterLoad]=useState(()=>readFlag(CLOSE_KEY,true)),[treeFilter,setTreeFilter]=useState(''),[newBank,setNewBank]=useState(''),[newTag,setNewTag]=useState('')
 const [localName,setLocalName]=useState(''),[tags,setTags]=useState(''),[favorite,setFavorite]=useState(false),[bankChoice,setBankChoice]=useState(''),[storeName,setStoreName]=useState(''),[recallEngine,setRecallEngine]=useState<0|1>(0)
 const connected=!!context&&!!hardware.identity,busy=!!hardware.busy

 // Native modal dialog: opened and closed from the editor; Escape closes it.
 useEffect(()=>{const d=dialog.current;if(!d)return;if(open&&!d.open){try{d.showModal()}catch{d.setAttribute('open','')}}else if(!open&&d.open)d.close()},[open])
 useEffect(()=>{if(!open||!start)return;setView(start.view);setStore(start.store);setStoreSection(start.section);setPage(0);setSelectedKey(null)},[open,start])
 const refresh=useCallback(async()=>{const s=storageRef.current;if(!s)return {sources:[] as LibrarySource[],metadata:null}
  const [list,meta]=await Promise.all([s.list(),s.metadata?s.metadata():Promise.resolve(null)]);setSources(list);setMetadata(meta);return {sources:list,metadata:meta}},[])
 useEffect(()=>{if(!open||storageRef.current)return;let cancelled=false
  openLibraryStorage().then(s=>{if(cancelled){s.close();return};storageRef.current=s;return refresh()}).catch(e=>setStorageError(`Bibliothèque locale indisponible : ${text(e)}`))
  return()=>{cancelled=true}},[open,refresh])
 useEffect(()=>()=>{storageRef.current?.close();storageRef.current=null},[])

 const empties=useMemo(()=>new Set(hardware.empties),[hardware.empties])
 const rows=useMemo(()=>buildRows(view,state,sources,metadata,empties),[view,state,sources,metadata,empties])
 const shown=useMemo(()=>filterRows(rows,{query,favorites,algorithm,tag},sort,duplicates),[rows,query,favorites,algorithm,tag,sort,duplicates])
 const classes=useMemo(()=>classify(rows),[rows]),pages=pageCount(shown.length),current=Math.min(page,pages-1),visible=pageOf(shown,current)
 const selected=shown.find(r=>r.key===selectedKey)??rows.find(r=>r.key===selectedKey)??null
 const bank=view.type==='device'?deviceBank(view.bank):null,files=libraryEntries(sources)
 const countBySource=useMemo(()=>{const m=new Map<string,number>();for(const e of files)m.set(e.source.id,(m.get(e.source.id)??0)+1);return m},[files])
 useEffect(()=>{setLocalName(selected?.note?.name??'');setTags((selected?.note?.tags??[]).join(', '));setFavorite(!!selected?.note?.favorite);setStoreName(state.name.slice(0,20))},[selected?.key,selected?.note,state.name])
 useEffect(()=>setPage(0),[view,query,favorites,algorithm,tag,sort,duplicates])
 useEffect(()=>{if(bank?.kind===2)setStoreSection(2);else if(storeSection===2&&bank)setStoreSection(0)},[bank?.id])

 const run=async(label:string,fn:()=>Promise<unknown>)=>{try{await fn()}catch(e){setStatus(`${label} : ${text(e)}`)}}
 const grants=async<T,>(ops:('query'|'edit-buffer'|'preset-store')[],fn:(...g:ReturnType<EditorViewContext['broker']['authorize']>[])=>Promise<T>)=>{
  if(!context)throw Error('Appareil non connecté');const g=ops.map(op=>context.broker.authorize(context.id,op));try{return await fn(...g)}finally{g.forEach(t=>context.broker.revoke(t))}}
 const storage=()=>{const s=storageRef.current;if(!s)throw Error(storageError||'Bibliothèque locale en cours d’ouverture');return s}
 /** A device read gets a library reference by being captured as a local file (bytes unchanged) the first time. */
 const ensureRef=async(row:Row):Promise<{ref:EntryRef;sources:LibrarySource[];metadata:LibraryMetadata}>=>{
  if(row.ref){const s=storage(),meta=s.metadata?await s.metadata():null;if(!meta)throw Error('Métadonnées locales indisponibles');return {ref:row.ref,sources,metadata:meta}}
  if(!row.frame)throw Error('Emplacement non lu : lisez-le d’abord')
  const {source}=await importLibraryFile(storage(),captureName(row),Uint8Array.from(row.frame)),after=await refresh()
  if(!after.metadata)throw Error('Métadonnées locales indisponibles');return {ref:{sourceId:source.id,index:0},sources:after.sources,metadata:after.metadata}}
 const writeMetadata=async(next:LibraryMetadata)=>{const s=storage();if(!s.setMetadata)throw Error('Écriture des métadonnées indisponible');await s.setMetadata(next);await refresh()}

 // ---- Actions ----
 const importFiles=(e:ChangeEvent<HTMLInputElement>)=>{const list=[...(e.currentTarget.files??[])];e.currentTarget.value='';void run('Import',async()=>{
  let added=0,known=0,presets=0,applied=''
  for(const file of list){if(file.size>32*1024*1024)throw Error(`${file.name} : fichier trop volumineux`);const bytes=new Uint8Array(await file.arrayBuffer())
   if(/\.json$/i.test(file.name)){const value=JSON.parse(new TextDecoder().decode(bytes))
    if(value?.format==='midi-studio-library'){added+=await restoreLibraryArchive(storage(),new TextDecoder().decode(bytes));continue}
    session.dispatch({type:'replace',state:value});setStatus(`Espace « ${file.name} » ouvert dans l’éditeur. Annuler revient en arrière.`);continue}
   // Parameter Data (an edit file, e.g. « Exporter les paramètres ») applies to the draft, one undo step; presets go to
   // the library. A file with neither is still kept as a local file (other instruments, archives of captures).
   const {frames}=splitSysex(bytes),params=frames.filter(f=>{const m=parseMessage(f);return m?.type==='parameter-data'&&m.target!==2})
   if(params.length){const {state:next,report}=importSysex(state,Uint8Array.from(params.flatMap(f=>Array.from(f))));session.dispatch({type:'replace',state:{...(session.serialize() as TcWorkspace),m3000:next}})
    applied=`${report.appliedValues} valeur(s) de paramètres appliquée(s) au brouillon, ${report.ignoredValues} ignorée(s)`}
   if(params.length===frames.length&&frames.length)continue
   const r=await importLibraryFile(storage(),file.name,bytes);if(r.inserted)added++;else known++
   presets+=r.source.inventory.entries.filter(x=>describeFrame((x as {message?:number[]}).message??[])).length}
  await refresh();if(added+known)setView({type:'files',sourceId:null})
  setStatus([added+known?`${added} fichier(s) ajouté(s), ${known} déjà présent(s) ; ${presets} preset(s) M3000 reconnu(s). Les originaux sont gardés octet pour octet.`:'',applied].filter(Boolean).join(' · '))})}
 const keepBuffer=()=>void run('Conserver le buffer',async()=>{const {kind,data}=encodeDraft(state),frame=presetDataFrame(hardware.device,kind,0,data)
  await importLibraryFile(storage(),`${safeName(state.name,'brouillon')} (brouillon M3000).syx`,frame);await refresh();setView({type:'files',sourceId:null});setStatus(`Brouillon « ${state.name} » conservé dans les fichiers locaux.`)})
 const openRow=(row:Row)=>{if(!row.frame)return
  try{session.dispatch({type:'open-frame',bytes:row.frame});const r=session.lastOpen
   setStatus(`« ${r?.name??row.name} » ouvert dans l’éditeur${r?.notes.length?' : '+r.notes.join(' ; '):''}.${session.hardware.isLive()?' Envoyé au buffer d’édition de l’appareil.':''}`)
   if(closeAfterLoad)onClose()}catch(e){setStatus(text(e))}}
 const readNumbers=(numbers:number[],label:string)=>{if(!bank)return;void run(label,()=>grants(['query'],q=>session.hardware.readLocations(q,bank.kind,numbers)))}
 const recallRow=(row:Row)=>void run('Rappel',()=>grants(['edit-buffer','query'],(w,q)=>session.hardware.recall(w,q,row.kind===2?2:recallEngine,row.number)).then(()=>setStatus(`${row.location} rappelé sur l’appareil${row.kind===2?'':` (moteur ${recallEngine+1})`}.`)))
 const storeHere=(row:Row)=>{if(!bank?.writable||locked)return;const section=bank.kind===2?2:storeSection===2?0:storeSection,name=(storeName||state.name).slice(0,20)
  const what=section===2?'le combiné en cours':`le moteur ${section+1} en cours`
  if(!window.confirm(`Mémoriser ${what} sous « ${name} » dans ${row.location} ?${row.state==='read'?`\n\nCet emplacement contient « ${row.name} » : il sera remplacé (une copie est gardée).`:row.state==='empty'?'\n\nEmplacement vide.':'\n\nContenu non lu : il sera lu avant l’écriture et gardé.'}`))return
  void run('Mémorisation',()=>grants(['preset-store','query'],(w,q)=>session.hardware.store(w,q,section,row.number,name)).then(()=>setStatus(session.hardware.getSnapshot().lastReport??'Mémorisé.')))}
 const saveNote=(row:Row)=>void run('Informations locales',async()=>{const {ref,sources:list,metadata:meta}=await ensureRef(row)
  await writeMetadata(annotate(meta,list,ref,{name:localName.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,255),tags:parseTags(tags),favorite}));setStatus('Informations locales enregistrées.')})
 const toBank=(row:Row,bankId:string)=>void run('Banque locale',async()=>{const {ref,metadata:meta}=await ensureRef(row);await writeMetadata(addToBank(meta,bankId,ref))
  setStatus(`« ${displayName(row)} » ajouté à la banque « ${meta.banks.find(b=>b.id===bankId)?.name} ».`)})
 const addTag=(row:Row)=>{const t=parseTags(newTag)[0];if(!t)return;void run('Étiquette',async()=>{const {ref,sources:list,metadata:meta}=await ensureRef(row)
  const prev=row.note??{name:'',tags:[],favorite:false};await writeMetadata(annotate(meta,list,ref,{name:prev.name,tags:[...new Set([...prev.tags,t])].slice(0,32),favorite:prev.favorite}));setNewTag('');setStatus(`Étiquette « ${t} » ajoutée.`)})}
 const makeBank=()=>void run('Banque locale',async()=>{if(!metadata)throw Error('Bibliothèque locale non ouverte');const id=`m3k-${Date.now().toString(36)}`
  await writeMetadata(createBank(metadata,newBank,id));setNewBank('');setView({type:'bank',bankId:id});setStatus('Banque locale créée. Glissez des presets dessus ou utilisez « Ajouter à la banque ».')})
 const removeFile=(row:Row)=>{if(!row.ref)return;const source=sources.find(s=>s.id===row.ref!.sourceId);if(!source)return
  if(!window.confirm(`Supprimer le fichier local « ${source.name} » (${countBySource.get(source.id)??0} preset(s) M3000) et ses informations locales ?`))return
  void run('Suppression',async()=>{const s=storage();if(!s.removeSource)throw Error('Suppression indisponible');await s.removeSource(source.id);await refresh();setSelectedKey(null);setStatus(`Fichier « ${source.name} » supprimé.`)})}
 const exportArchive=()=>void run('Archive',async()=>{download(`midi-studio-bibliotheque-${new Date().toISOString().slice(0,10)}.json`,await exportLibraryArchive(storage()),'application/json')})
 const onDrop=(e:DragEvent,bankId:string)=>{e.preventDefault();const key=e.dataTransfer.getData('text/x-m3k-row'),row=rows.find(r=>r.key===key);if(row)toBank(row,bankId)}
 const onListKey=(e:KeyboardEvent)=>{if(!visible.length)return;const i=visible.findIndex(r=>r.key===selectedKey)
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const next=visible[Math.max(0,Math.min(visible.length-1,i+(e.key==='ArrowDown'?1:-1)))];setSelectedKey(next.key);document.getElementById(`m3k-lib-row-${next.key}`)?.focus()}
  else if(e.key==='Enter'&&selected){e.preventDefault();store?storeHere(selected):openRow(selected)}}

 const sourceLabel=view.type==='device'?bank!.label:view.type==='files'?(view.sourceId?sources.find(s=>s.id===view.sourceId)?.name??'Fichier':'Fichiers locaux'):`Banque locale « ${metadata?.banks.find(b=>b.id===view.bankId)?.name??''} »`
 const cov=bank?coverage(rows):null,needle=treeFilter.trim().toLowerCase(),match=(s:string)=>!needle||s.toLowerCase().includes(needle)
 const filterText=[favorites&&'favoris',algorithm!==null&&algorithmNames([algorithm]),tag&&`étiquette « ${tag} »`].filter(Boolean).join(' · ')
 return <dialog ref={dialog} className="m3k-lib" aria-label="Bibliothèques M3000" onClose={onClose} onCancel={()=>onClose()}>
  <header><div><p className="m3k-lib-eyebrow">M3000 · LIBRARIAN</p><h2>Bibliothèques de presets</h2></div><button type="button" onClick={onClose}>Fermer ×</button></header>
  <div className="m3k-lib-current"><span>BUFFER DE L’ÉDITEUR</span><strong>{state.name}</strong><small>{algorithmNames(state.type==='dual'?state.engines.map(e=>e.algorithm):[state.engines[0].algorithm])}</small>
   <button type="button" disabled={!!storageError} onClick={keepBuffer}>Conserver le buffer</button>
   {context&&<button type="button" disabled={!connected||busy||locked} title="Un message Preset Data dans le buffer d’édition (volatil), puis relecture" onClick={()=>void run('Envoi du brouillon',()=>grants(['edit-buffer','query'],(w,q)=>session.hardware.sendDraft(w,q)).then(()=>setStatus(`Brouillon « ${state.name} » envoyé dans le buffer d’édition ${state.type==='dual'?'combiné':'du moteur 1'} puis relu.`)))}>Envoyer le brouillon à l’appareil</button>}
   <span className="m3k-lib-spacer"/>
   <small>{connected?`M3000 connecté${hardware.live?' · envoi automatique':''}`:context?'Appareil non connecté : page « Appareil (MIDI) »':'Hors ligne'}</small></div>
  {store&&<div className="m3k-lib-store-heading"><strong>STORE · choisir un emplacement utilisateur</strong><span>Simple clic : choisir. Double-clic ou Entrée : mémoriser.</span><button type="button" onClick={()=>setStore(false)}>Quitter le mode STORE</button></div>}
  <div className="m3k-lib-body">
   <aside className="m3k-lib-sources" aria-label="Sources">
    <p className="m3k-lib-title">SOURCES</p>
    <nav>{DEVICE_BANKS.map(b=><button key={b.id} type="button" aria-pressed={view.type==='device'&&view.bank===b.id} onClick={()=>setView({type:'device',bank:b.id as DeviceBankId})}>{b.label}</button>)}
     <button type="button" aria-pressed={view.type==='files'&&!view.sourceId} onClick={()=>setView({type:'files',sourceId:null})}>Fichiers locaux <small>{files.length}</small></button></nav>
    <label className="m3k-lib-tree-search">Filtrer les sources<input type="search" value={treeFilter} placeholder="Fichier, banque, étiquette…" onChange={e=>setTreeFilter(e.currentTarget.value)}/></label>
    <details open><summary>Banques locales <small>{metadata?.banks.length??0}</small></summary>
     {(metadata?.banks??[]).filter(b=>match(b.name)).map(b=><button key={b.id} type="button" aria-pressed={view.type==='bank'&&view.bankId===b.id} onClick={()=>setView({type:'bank',bankId:b.id})}
      onDragOver={e=>e.preventDefault()} onDrop={e=>onDrop(e,b.id)} title="Déposez un preset ici pour l’ajouter">{b.name} <small>{b.entries.length}</small></button>)}
     {!metadata?.banks.length&&<p>Créez une banque pour votre sélection.</p>}
     <label>Nouvelle banque locale<input value={newBank} maxLength={80} placeholder="Concert, mixage…" onChange={e=>setNewBank(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&newBank.trim())makeBank()}}/></label>
     <button type="button" disabled={!newBank.trim()||!metadata} onClick={makeBank}>Créer la banque locale</button></details>
    <details open><summary>Fichiers et captures <small>{sources.filter(s=>countBySource.get(s.id)).length}</small></summary>
     {sources.filter(s=>countBySource.get(s.id)&&match(s.name)).map(s=><button key={s.id} type="button" aria-pressed={view.type==='files'&&view.sourceId===s.id} title={s.name} onClick={()=>setView({type:'files',sourceId:s.id})}>{s.name} <small>{countBySource.get(s.id)}</small></button>)}
     <p>Importez un fichier .syx (Preset Data M3000), une archive MIDI Studio ou un espace .json.</p></details>
    <label className="m3k-lib-import">Importer .syx / archive<input type="file" multiple accept=".syx,.json" disabled={locked||!!storageError} onChange={importFiles}/></label>
    <button type="button" disabled={!!storageError} onClick={exportArchive}>Exporter l’archive MIDI Studio</button>
    <details><summary>Brouillon de l’éditeur</summary>
     <button type="button" onClick={()=>{try{const {kind,data}=encodeDraft(state);download(`${safeName(state.name,'M3000')}-${kind===2?'combine':'simple'}.syx`,presetDataFrame(hardware.device,kind,0,data),'application/octet-stream')}catch(e){setStatus(text(e))}}}>Exporter le preset entier (.syx)</button>
     <button type="button" onClick={()=>download(`${safeName(state.name,'M3000')}-parametres.syx`,exportParameterSysex(state,hardware.device),'application/octet-stream')}>Exporter les paramètres (.syx)</button>
     <button type="button" onClick={()=>download(`${safeName(state.name,'M3000')}.m3000.json`,JSON.stringify(session.serialize(),null,1),'application/json')}>Exporter l’espace (.json)</button>
     <p>« Preset entier » : un message Preset Data pour le buffer d’édition. « Paramètres » : un Parameter Data par paramètre, sans changer l’algorithme.</p></details>
    <p>Les lectures ne mémorisent rien. Usine, Utilisateur et Snapshots affichent les copies lues, avec leur état.</p>
   </aside>
   <aside className="m3k-lib-class" aria-label="Classement des presets">
    <p className="m3k-lib-title">CLASSEMENT</p>
    <button type="button" aria-pressed={favorites} onClick={()=>setFavorites(!favorites)}>★ Favoris <small>{classes.favorites}</small></button>
    <details open><summary>Algorithmes</summary>{classes.algorithms.length?classes.algorithms.map(([a,n])=><button key={a} type="button" aria-pressed={algorithm===a} onClick={()=>setAlgorithm(algorithm===a?null:a)}>{algorithmNames([a])} <small>{n}</small></button>)
     :<p>Les algorithmes des presets lus ou importés apparaîtront ici.</p>}</details>
    <details open><summary>Étiquettes</summary>{classes.tags.length?classes.tags.map(([t,n])=><button key={t} type="button" aria-pressed={tag===t} onClick={()=>setTag(tag===t?null:t)}>{t} <small>{n}</small></button>):<p>Aucune étiquette.</p>}</details>
    <label>Nouvelle étiquette<input value={newTag} maxLength={40} placeholder="Ambiances…" onChange={e=>setNewTag(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Enter'&&selected)addTag(selected)}}/></label>
    <button type="button" disabled={!selected?.frame||!newTag.trim()} onClick={()=>selected&&addTag(selected)}>Ajouter au preset</button>
    <p>Glissez un preset sur une banque locale ; étiquettes et favoris se modifient dans la fiche du preset.</p>
   </aside>
   <section className="m3k-lib-browser" aria-label={sourceLabel}>
    <div className="m3k-lib-toolbar">
     <label>Recherche<input type="search" value={query} placeholder="Nom, numéro, algorithme…" onChange={e=>setQuery(e.currentTarget.value)}/></label>
     <label><input type="checkbox" checked={favorites} onChange={e=>setFavorites(e.currentTarget.checked)}/> Favoris</label>
     {bank&&<><button type="button" disabled={!connected||busy} onClick={()=>readNumbers(visible.map(r=>r.number),'Lecture de la page')}>Lire cette page</button>
      <button type="button" disabled={!connected||busy} onClick={()=>readNumbers(rows.map(r=>r.number),'Lecture de la banque')}>Lire la banque</button>
      <button type="button" disabled={!connected||busy||!cov?.unread} onClick={()=>readNumbers(rows.filter(r=>r.state==='unread'||r.state==='copy').map(r=>r.number),'Reprise')}>Reprendre les emplacements non lus</button>
      <button type="button" disabled={!busy} onClick={()=>session.hardware.cancel()}>Arrêter</button></>}
     {view.type==='bank'&&<button type="button" onClick={()=>{if(metadata&&window.confirm('Supprimer cette banque locale ? Les fichiers et presets restent dans la bibliothèque.'))void run('Banque locale',async()=>{await writeMetadata(deleteBank(metadata,view.bankId));setView({type:'files',sourceId:null})})}}>Supprimer la banque</button>}
     <label><input type="checkbox" checked={closeAfterLoad} onChange={e=>{const v=e.currentTarget.checked;setCloseAfterLoad(v);try{localStorage.setItem(CLOSE_KEY,String(v))}catch{/* per-viewer convenience */}}}/> Fermer après chargement</label>
    </div>
    <div className="m3k-lib-view-options">
     <label>Trier<select value={sort} onChange={e=>setSort(e.currentTarget.value as Sort)}><option value="original">Ordre d’origine</option><option value="name">Nom</option><option value="source">Source</option><option value="date">Date récente</option></select></label>
     <label>Doublons<select value={duplicates} onChange={e=>setDuplicates(e.currentTarget.value as Duplicates)}><option value="all">Tout afficher</option><option value="content">Masquer par contenu</option><option value="name">Masquer par nom</option></select></label>
     <span role="group" aria-label="Affichage" className="m3k-lib-layout"><button type="button" aria-pressed={layout==='list'} onClick={()=>setLayout('list')}>Liste</button><button type="button" aria-pressed={layout==='grid'} onClick={()=>setLayout('grid')}>Grille</button></span>
     <button type="button" onClick={()=>{setQuery('');setFavorites(false);setAlgorithm(null);setTag(null);setDuplicates('all');setSort('original')}}>Effacer les filtres</button>
    </div>
    {filterText&&<p className="m3k-lib-active-filter">Filtre : {filterText}</p>}
    <p className="m3k-lib-scope">{storageError||(bank?`${bank.label} : ${bank.last-bank.first+1} emplacements (${bank.first}–${bank.last} en SysEx). ${cov!.read} lu(s) · ${cov!.copy} copie(s) locale(s) · ${cov!.empty} vide(s) confirmé(s) · ${cov!.unread} à lire.${bank.writable?' Mémoire utilisateur : la mémorisation demande une confirmation.':''}`
     :`${sourceLabel} : ${rows.length} preset(s) M3000.`)}</p>
    <div className="m3k-lib-table-scroll" data-layout={layout}><table className="m3k-lib-table" onKeyDown={onListKey}>
     <thead><tr><th>Emplacement</th><th>Preset / copie locale</th><th>État</th></tr></thead>
     <tbody>{visible.map(r=><tr key={r.key} draggable={!!r.frame} onDragStart={e=>{e.dataTransfer.setData('text/x-m3k-row',r.key);e.dataTransfer.effectAllowed='copy'}}
      className={r.origin==='device'&&(r.kind===2?hardware.running?.combined===r.number:!!hardware.running?.singles.includes(r.number))?'m3k-lib-running':undefined}>
      <td>{r.location}</td>
      <td><button id={`m3k-lib-row-${r.key}`} type="button" aria-pressed={selectedKey===r.key} onClick={()=>setSelectedKey(r.key)} onDoubleClick={()=>store?storeHere(r):openRow(r)}>
       {r.frame?<>{r.note?.favorite?'★ ':''}{displayName(r)}{r.note?.name&&r.note.name!==r.name?<small> ({r.name})</small>:null}</>:<em>{r.state==='empty'?'—':'non lu'}</em>}</button>
       {r.frame&&<p className="m3k-lib-row-tags">{algorithmNames(r.algorithms)}{r.note?.tags.length?` · ${r.note.tags.join(', ')}`:''}</p>}</td>
      <td>{STATE_LABEL[r.state]}</td></tr>)}</tbody></table>
     {!visible.length&&<p className="m3k-lib-empty">{rows.length?'Aucun preset ne correspond aux filtres.':view.type==='device'?'Rien n’a encore été lu dans cette banque.':'Aucun preset M3000 ici : importez un fichier .syx.'}</p>}</div>
    <div className="m3k-lib-pagination"><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}>← Page</button><span>{current+1} / {pages} · {shown.length} entrée(s) · {PAGE_SIZE} par page</span>
     <button type="button" disabled={current>=pages-1} onClick={()=>setPage(current+1)}>Page →</button>
     <button type="button" disabled={!shown.some(r=>r.frame)} onClick={()=>download(`M3000-${safeName(sourceLabel,'presets')}.syx`,exportFrames(shown),'application/octet-stream')}>Exporter les copies lues .syx</button></div>
   </section>
   <aside className="m3k-lib-inspector" aria-label="Fiche du preset">
    {selected?<>
     <p className="m3k-lib-eyebrow">{selected.location}</p><h3>{selected.frame?displayName(selected):selected.state==='empty'?'Emplacement vide':'Emplacement non lu'}</h3>
     {selected.frame?<div className="m3k-lib-detail"><p>{algorithmNames(selected.algorithms)}</p>
      <small>{selected.kind===2?'Preset combiné':'Preset simple'} · adresse SysEx {selected.number===0?'buffer d’édition':selected.number}{selected.sourceName?` · ${selected.sourceName}`:''}{(()=>{const d=describeFrame(selected.frame!);return d?.kind===2&&d.sources.some(Boolean)?` · sources : simples ${d.sources.map(s=>s??'—').join(' / ')}`:''})()}</small>
      {!selected.algorithms.some(hasLayout)&&<small>Algorithme sans disposition décodée : ouverture dans l’éditeur impossible.</small>}</div>
      :<p>{selected.state==='empty'?'Cet emplacement n’a pas répondu à la lecture.':'Aucune lecture effectuée pour cet emplacement.'}</p>}
     {store&&bank?.writable?<div className="m3k-lib-store">
       <label>Mémoriser {bank.kind===2?'le combiné en cours':<select value={storeSection} onChange={e=>setStoreSection(Number(e.currentTarget.value) as 0|1)}><option value={0}>le moteur 1 en cours</option><option value={1}>le moteur 2 en cours</option></select>}</label>
       <label>Nom<input value={storeName} maxLength={20} onChange={e=>setStoreName(e.currentTarget.value)}/></label>
       <button type="button" className="m3k-store" disabled={!connected||busy||locked} onClick={()=>storeHere(selected)}>Mémoriser ici</button></div>
      :bank?.writable&&<button type="button" disabled={!connected||busy||locked} onClick={()=>{setStore(true)}}>Mémoriser dans cet emplacement…</button>}
     {selected.frame&&<>
      <label>Nom local<input value={localName} maxLength={255} placeholder={selected.name} onChange={e=>setLocalName(e.currentTarget.value)}/></label>
      <label>Étiquettes (virgules)<input value={tags} onChange={e=>setTags(e.currentTarget.value)}/></label>
      <label><input type="checkbox" checked={favorite} onChange={e=>setFavorite(e.currentTarget.checked)}/> Favori</label>
      <button type="button" disabled={!!storageError} onClick={()=>saveNote(selected)}>Enregistrer les informations locales</button>
      <label>Copier dans une banque locale<select value={bankChoice} onChange={e=>setBankChoice(e.currentTarget.value)}><option value="">—</option>{(metadata?.banks??[]).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      <button type="button" disabled={!bankChoice} onClick={()=>toBank(selected,bankChoice)}>Ajouter cette copie à la banque</button>
      {view.type==='bank'&&selected.ref&&<span className="m3k-lib-bank-order"><button type="button" onClick={()=>metadata&&void run('Banque locale',()=>writeMetadata(moveInBank(metadata,view.bankId,selected.ref!,-1)))}>Monter</button>
       <button type="button" onClick={()=>metadata&&void run('Banque locale',()=>writeMetadata(moveInBank(metadata,view.bankId,selected.ref!,1)))}>Descendre</button>
       <button type="button" onClick={()=>metadata&&void run('Banque locale',()=>writeMetadata(removeFromBank(metadata,view.bankId,selected.ref!)))}>Retirer de la banque</button></span>}</>}
     {selected.origin==='device'&&<>
      <button type="button" disabled={!connected||busy} onClick={()=>readNumbers([selected.number],'Lecture')}>Lire cet emplacement</button>
      {selected.state!=='empty'&&<span className="m3k-lib-recall">{selected.kind!==2&&<select aria-label="Moteur du rappel" value={recallEngine} onChange={e=>setRecallEngine(Number(e.currentTarget.value) as 0|1)}><option value={0}>Moteur 1</option><option value={1}>Moteur 2</option></select>}
       <button type="button" disabled={!connected||busy||locked} onClick={()=>recallRow(selected)}>Rappeler sur l’appareil</button></span>}</>}
     {selected.frame&&<button type="button" className="m3k-lib-primary" disabled={locked||!selected.algorithms.some(hasLayout)} onClick={()=>openRow(selected)}>{session.hardware.isLive()?'Ouvrir et envoyer au buffer d’édition':'Ouvrir dans l’éditeur (hors ligne)'}</button>}
     {selected.frame&&<button type="button" onClick={()=>download(`${captureName(selected).replace(/\.syx$/,'')}.syx`,Uint8Array.from(selected.frame!),'application/octet-stream')}>Exporter l’original .syx</button>}
     {selected.origin==='file'&&<button type="button" onClick={()=>removeFile(selected)}>Supprimer ce fichier local…</button>}
    </>:<p>Sélectionnez un preset : sa fiche, ses informations locales et ses actions apparaissent ici.</p>}
   </aside>
  </div>
  <footer><p role="status">{hardware.busy?`${hardware.busy}…`:status}</p>{hardware.progress&&<progress max={hardware.progress.total} value={hardware.progress.done}/>}</footer>
 </dialog>
}

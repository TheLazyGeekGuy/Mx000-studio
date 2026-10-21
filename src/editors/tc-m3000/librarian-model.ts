// M3000 librarian — pure rows, filters and classification for the preset library window (same layout and services as the
// FireworX librarian: device banks, local files and captures, local banks, favourites, tags). No DOM, storage or MIDI.
import {decodePresetHeader,parseMessage,type PresetKind} from './protocol'
import {algorithmById,type M3000State,type OpaqueDump} from './model'
import type {LibrarySource} from '../../library/storage'
import {entryKey,type Annotation,type EntryRef,type LibraryMetadata} from '../../library/metadata'

export type DeviceBankId='factory-single'|'factory-combined'|'snapshot'|'user-single'|'user-combined'
export interface DeviceBank {id:DeviceBankId;label:string;kind:PresetKind;first:number;last:number;writable:boolean}
/** Populated ranges observed on the unit (SW 2.04, full backup 2026-10-20); user ranges from the manual (250 + 50). */
export const DEVICE_BANKS:readonly DeviceBank[]=Object.freeze([
 {id:'factory-single',label:'Usine · simples',kind:0,first:1,last:500,writable:false},
 {id:'factory-combined',label:'Usine · combinés',kind:2,first:1,last:100,writable:false},
 {id:'snapshot',label:'Snapshots',kind:2,first:257,last:260,writable:false},
 {id:'user-single',label:'Utilisateur · simples',kind:0,first:513,last:762,writable:true},
 {id:'user-combined',label:'Utilisateur · combinés',kind:2,first:129,last:178,writable:true},
])
export const deviceBank=(id:DeviceBankId)=>DEVICE_BANKS.find(b=>b.id===id)!
/** Number shown on the unit for a SysEx address: user banks restart at 1. */
export function displayNumber(bank:DeviceBank,n:number){return bank.id==='user-single'?n-512:bank.id==='user-combined'?n-128:bank.id==='snapshot'?n-256:n}

export type LibraryView={type:'device';bank:DeviceBankId}|{type:'files';sourceId:string|null}|{type:'bank';bankId:string}
export interface Row {
 key:string;origin:'device'|'file'
 kind:PresetKind
 /** SysEx preset address of the frame (0 = an edit buffer), or of the device location. */
 number:number
 location:string
 frame:number[]|null
 name:string
 algorithms:number[]
 state:'read'|'unread'|'empty'|'file'|'copy'
 /** Library entry holding these exact bytes (file row, or a captured copy of a device read). */
 ref:EntryRef|null
 sourceName:string|null
 importedAt:string|null
 note:Annotation|null
 position:number
}

const frameKey=(frame:readonly number[])=>frame.join(',')
/** Same preset whatever its address: decoded data without the own-number word. */
export function contentKey(frame:readonly number[]){const m=parseMessage(frame);return m?.type==='preset-data'?`${m.kind===2?2:0}|${Array.from(m.data.slice(2)).join(',')}`:frameKey(frame)}
export function describeFrame(frame:readonly number[]){
 const m=parseMessage(frame);if(m?.type!=='preset-data')return null
 const h=decodePresetHeader(m.kind,m.data);return {kind:m.kind,number:m.preset,name:h.name,algorithms:h.algorithms,sources:h.sources}
}
export const algorithmNames=(ids:readonly number[])=>ids.map(a=>algorithmById(a)?.name??`algorithme ${a}`).join(' + ')

export interface LibraryEntry {ref:EntryRef;frame:number[];source:LibrarySource;index:number}
/** M3000 Preset Data frames found in the imported files (any other packet, e.g. FireworX, is ignored). */
export function libraryEntries(sources:readonly LibrarySource[]):LibraryEntry[]{
 const out:LibraryEntry[]=[]
 for(const source of sources)for(const entry of source.inventory.entries){
  const message=(entry as {message?:number[]}).message;if(!message||parseMessage(message)?.type!=='preset-data')continue
  out.push({ref:{sourceId:source.id,index:entry.index},frame:[...message],source,index:entry.index})}
 return out
}
const notesOf=(metadata:LibraryMetadata|null)=>new Map((metadata?.annotations??[]).map(a=>[entryKey(a.ref),a.revisions.at(-1)!]))

/** Rows of a view, in the original order (device address, file order, bank order). */
export function buildRows(view:LibraryView,state:M3000State,sources:readonly LibrarySource[],metadata:LibraryMetadata|null,empties:ReadonlySet<string>):Row[]{
 const entries=libraryEntries(sources),notes=notesOf(metadata),byBytes=new Map<string,LibraryEntry>()
 for(const e of entries)if(!byBytes.has(frameKey(e.frame)))byBytes.set(frameKey(e.frame),e)
 const fileRow=(e:LibraryEntry,position:number):Row=>{const d=describeFrame(e.frame)!
  return {key:`lib:${entryKey(e.ref)}`,origin:'file',kind:d.kind,number:d.number,location:`${e.source.name} · ${e.index+1}`,frame:e.frame,name:d.name,algorithms:d.algorithms,state:'file',ref:e.ref,sourceName:e.source.name,importedAt:e.source.importedAt,note:notes.get(entryKey(e.ref))??null,position}}
 if(view.type==='device'){
  const bank=deviceBank(view.bank),read=new Map<number,OpaqueDump>()
  for(const o of state.originals)if((bank.kind===2?o.kind===2:o.kind!==2)&&o.preset>=bank.first&&o.preset<=bank.last)read.set(o.preset,o)
  // A location not read in this workspace shows the local copy of the same address when an imported file has one
  // (a backup of the unit, for instance): the bank can then be browsed offline.
  const copies=new Map<number,LibraryEntry>()
  for(const e of entries){const d=describeFrame(e.frame)!;if((d.kind===2)===(bank.kind===2)&&d.number>=bank.first&&d.number<=bank.last&&!copies.has(d.number))copies.set(d.number,e)}
  const rows:Row[]=[]
  for(let n=bank.first,i=0;n<=bank.last;n++,i++){
   const o=read.get(n),copy=o?null:copies.get(n)??null,frame=o?o.bytes:copy?copy.frame:null,d=frame?describeFrame(frame):null,captured=frame?byBytes.get(frameKey(frame))??null:null
   rows.push({key:`dev:${bank.kind}:${n}`,origin:'device',kind:bank.kind,number:n,location:`${bank.label.split(' · ')[0]} ${displayNumber(bank,n)}`,frame,name:d?.name??'',algorithms:d?.algorithms??[],
    state:o?'read':copy?'copy':empties.has(`${bank.kind}:${n}`)?'empty':'unread',ref:captured?.ref??null,sourceName:copy?copy.source.name:null,importedAt:copy?copy.source.importedAt:null,note:captured?notes.get(entryKey(captured.ref))??null:null,position:i})}
  return rows
 }
 if(view.type==='files')return entries.filter(e=>!view.sourceId||e.source.id===view.sourceId).map(fileRow)
 const bank=metadata?.banks.find(b=>b.id===view.bankId),index=new Map(entries.map(e=>[entryKey(e.ref),e]))
 return (bank?.entries??[]).map(ref=>index.get(entryKey(ref))).filter((e):e is LibraryEntry=>!!e).map(fileRow)
}

export interface RowFilter {query:string;favorites:boolean;algorithm:number|null;tag:string|null}
export type Sort='original'|'name'|'source'|'date'
export type Duplicates='all'|'content'|'name'
const fold=(s:string)=>s.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase()
export const displayName=(row:Row)=>row.note?.name||row.name
export function filterRows(rows:readonly Row[],f:RowFilter,sort:Sort,duplicates:Duplicates):Row[]{
 const needle=fold(f.query.trim())
 let out=rows.filter(r=>(!f.favorites||r.note?.favorite)&&(f.algorithm===null||r.algorithms.includes(f.algorithm))&&(f.tag===null||(r.note?.tags??[]).includes(f.tag))
  &&(!needle||fold(`${displayName(r)} ${r.name} ${r.location} ${r.number} ${algorithmNames(r.algorithms)} ${(r.note?.tags??[]).join(' ')} ${r.sourceName??''}`).includes(needle)))
 if(duplicates!=='all'){const seen=new Set<string>();out=out.filter(r=>{if(!r.frame)return true;const k=duplicates==='content'?contentKey(r.frame):fold(displayName(r));if(seen.has(k))return false;seen.add(k);return true})}
 if(sort!=='original')out=[...out].sort((a,b)=>sort==='name'?displayName(a).localeCompare(displayName(b))||a.position-b.position
  :sort==='source'?(a.sourceName??a.location).localeCompare(b.sourceName??b.location)||a.position-b.position
  :(b.importedAt??'').localeCompare(a.importedAt??'')||a.position-b.position)
 return out
}
/** Classification column: favourites, algorithms and tags of the rows in view (before the classification filters). */
export function classify(rows:readonly Row[]){
 const algorithms=new Map<number,number>(),tags=new Map<string,number>();let favorites=0
 for(const r of rows){if(r.note?.favorite)favorites++;for(const a of new Set(r.algorithms))algorithms.set(a,(algorithms.get(a)??0)+1);for(const t of r.note?.tags??[])tags.set(t,(tags.get(t)??0)+1)}
 return {favorites,algorithms:[...algorithms].sort((a,b)=>algorithmNames([a[0]]).localeCompare(algorithmNames([b[0]]))),tags:[...tags].sort((a,b)=>a[0].localeCompare(b[0]))}
}
export const PAGE_SIZE=25
export const pageOf=<T>(rows:readonly T[],page:number)=>rows.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE)
export const pageCount=(n:number)=>Math.max(1,Math.ceil(n/PAGE_SIZE))
/** Frames of the rows that hold data, concatenated as one .syx file (bytes as read or imported, unchanged). */
export const exportFrames=(rows:readonly Row[])=>Uint8Array.from(rows.flatMap(r=>r.frame??[]))
/** Coverage line of a device bank. */
export function coverage(rows:readonly Row[]){return {read:rows.filter(r=>r.state==='read').length,copy:rows.filter(r=>r.state==='copy').length,empty:rows.filter(r=>r.state==='empty').length,unread:rows.filter(r=>r.state==='unread'||r.state==='copy').length}}
/** Local bank helpers (metadata stays validated by the shared storage). */
export function createBank(metadata:LibraryMetadata,name:string,id:string):LibraryMetadata{
 const clean=name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,80);if(!clean)throw Error('Nom de banque requis')
 return {...structuredClone(metadata),banks:[...metadata.banks.map(b=>structuredClone(b)),{id,name:clean,entries:[]}]}
}
export function addToBank(metadata:LibraryMetadata,bankId:string,ref:EntryRef):LibraryMetadata{
 const next=structuredClone(metadata),bank=next.banks.find(b=>b.id===bankId);if(!bank)throw Error('Banque locale inconnue')
 if(!bank.entries.some(r=>entryKey(r)===entryKey(ref)))bank.entries.push(structuredClone(ref));return next
}
export function removeFromBank(metadata:LibraryMetadata,bankId:string,ref:EntryRef):LibraryMetadata{
 const next=structuredClone(metadata),bank=next.banks.find(b=>b.id===bankId);if(bank)bank.entries=bank.entries.filter(r=>entryKey(r)!==entryKey(ref));return next
}
export function moveInBank(metadata:LibraryMetadata,bankId:string,ref:EntryRef,delta:number):LibraryMetadata{
 const next=structuredClone(metadata),bank=next.banks.find(b=>b.id===bankId);if(!bank)return next
 const i=bank.entries.findIndex(r=>entryKey(r)===entryKey(ref)),j=i+delta;if(i<0||j<0||j>=bank.entries.length)return next
 const [item]=bank.entries.splice(i,1);bank.entries.splice(j,0,item);return next
}
export const deleteBank=(metadata:LibraryMetadata,bankId:string):LibraryMetadata=>({...structuredClone(metadata),banks:metadata.banks.filter(b=>b.id!==bankId).map(b=>structuredClone(b))})
/** Tags typed as "a, b , c": trimmed, deduplicated, at most 32 of 1–40 characters. */
export const parseTags=(text:string)=>[...new Set(text.split(',').map(t=>t.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,40)).filter(Boolean))].slice(0,32)
/** File name of a captured device read or a kept draft. */
export const captureName=(row:{location:string;name:string})=>`M3000 ${row.location} ${row.name}`.replace(/[\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,120)+'.syx'
export type {M3000State}

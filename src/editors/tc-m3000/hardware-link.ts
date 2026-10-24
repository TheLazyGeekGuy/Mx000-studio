// Editor-level hardware link, alive for as long as the editor is open (not just while the "Appareil" page is shown):
// - a bound port pair is identified automatically (universal Identity Request, M3000 family only), then the running
//   state is read so the editor starts from what the unit plays;
// - auto-apply (on by default, remembered per browser) keeps an 'edit-buffer' grant so every edit is sent to the
//   unit's edit buffer as it happens — the equivalent of the FireworX P0 path. Nothing is ever stored on the unit;
// - the last port pair is remembered by name and re-bound when it reappears.
import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import type {EditorViewContext} from '../../editor-host/view-contract'
import type {MidiAuthorization} from '../../editor-host/midi-broker'
import type {M3000Session} from './module'
import {automaticMSeriesPair} from './device-ports'

const AUTO_KEY='midi-studio.tc-m3000.auto-apply',PORT_KEY='midi-studio.tc-m3000.port'
const read=(key:string)=>{try{return localStorage.getItem(key)}catch{return null}}
const write=(key:string,value:string)=>{try{localStorage.setItem(key,value)}catch{/* preference only */}}

export interface HardwareLink {autoApply:boolean;setAutoApply(on:boolean):void;error:string;rememberPort(name:string):void;markIdentified():void;
 /** Automatic identification pauses while the device page probes candidate ports. */
 setDetecting(on:boolean):void}

export function useHardwareLink(context:EditorViewContext|undefined,session:M3000Session,locked:boolean,revision:number):HardwareLink{
 const snapshot=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot)
 const [autoApply,setAuto]=useState(()=>read(AUTO_KEY)!=='off'),[error,setError]=useState(''),[link,setLink]=useState(()=>context?.lease.getState())
 const grant=useRef<{token:MidiAuthorization;query:MidiAuthorization;generation:number}|null>(null),identifying=useRef<number>(-1),identifiedOn=useRef<number>(-1),detecting=useRef(false),requested=useRef(false)
 const hw=snapshot.hardware
 useEffect(()=>context?.lease.onState(setLink),[context])
 // A new binding (other port, reconnection) invalidates the identity learned on the previous one.
 useEffect(()=>{if(link&&hw.identity&&identifiedOn.current!==-1&&identifiedOn.current!==link.generation){identifiedOn.current=-1;session.hardware.reset()}},[link?.generation,hw.identity,session])
 // Restore a remembered pair, or bind one unambiguous M-series candidate on first use.
 useEffect(()=>{
  if(!context||link?.connected||locked)return
  const name=read(PORT_KEY)
  // MIDI access may arrive after the editor opens (permission prompt, ports appearing): retry every 1.5 s until bound.
  const attempt=()=>{
   const pair=automaticMSeriesPair([...context.access.inputs.values()],[...context.access.outputs.values()],(direction,id)=>context.broker.available(direction,id,context.id),name)
   if(pair)try{context.lease.bind({inputId:pair.input.id,outputId:pair.output.id});return true}catch{/* busy elsewhere */}
   return false
  }
  if(attempt())return
  // A port was used before: ask the host for MIDI access once (granted earlier, so normally no prompt), then retry.
  if(!requested.current){requested.current=true;void context.request().catch(()=>{/* the device page offers the manual path */})}
  const timer=setInterval(()=>{if(attempt())clearInterval(timer)},1500)
  return()=>clearInterval(timer)
 },[context,link?.connected,locked,revision])
 // Identify once per binding generation, then read the running state.
 useEffect(()=>{
  if(!context||!link?.connected||locked||hw.identity||hw.busy||detecting.current||identifying.current===link.generation)return
  identifying.current=link.generation
  const q=context.broker.authorize(context.id,'query')
  session.hardware.identify(q).then(()=>{identifiedOn.current=link.generation;const b=context.lease.getState().binding,n=b&&context.access.inputs.get(b.inputId)?.name;if(n&&b&&n===context.access.outputs.get(b.outputId)?.name)write(PORT_KEY,n);return session.hardware.readCurrent(q)}).then(()=>setError('')).catch(e=>setError(e instanceof Error?e.message:String(e))).finally(()=>context.broker.revoke(q))
 },[context,link?.connected,link?.generation,locked,hw.identity,hw.busy,session])
 // Auto-apply: hold an edit-buffer grant while an identified M3000 is bound and the editor is unlocked.
 useEffect(()=>{
  if(!context)return
  const want=autoApply&&!!hw.identity&&!!link?.connected&&!locked,generation=link?.generation??-1
  if(grant.current&&(!want||grant.current.generation!==generation)){try{session.setSending(false);session.setLiveQuery(null)}catch{/* closed */}context.broker.revoke(grant.current.token);context.broker.revoke(grant.current.query);grant.current=null}
  if(want&&!grant.current){const g=context.broker.authorize(context.id,'edit-buffer'),q=context.broker.authorize(context.id,'query');try{session.setLiveQuery(q);session.setSending(true,g);grant.current={token:g,query:q,generation}}catch(e){context.broker.revoke(g);context.broker.revoke(q);setError(e instanceof Error?e.message:String(e))}}
 },[context,autoApply,hw.identity,link?.connected,link?.generation,locked,session])
 useEffect(()=>()=>{if(grant.current&&context){try{session.setSending(false);session.setLiveQuery(null)}catch{/* closed */}context.broker.revoke(grant.current.token);context.broker.revoke(grant.current.query);grant.current=null}},[context,session])
 return {autoApply,error,setAutoApply(on){write(AUTO_KEY,on?'on':'off');setAuto(on)},rememberPort(name){write(PORT_KEY,name)},markIdentified(){const now=context?.lease.getState();if(now){identifiedOn.current=now.generation;identifying.current=now.generation}},setDetecting(on){detecting.current=on}}
}

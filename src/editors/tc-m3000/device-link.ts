// Single-flight exchanges with the bound unit through the host lease. Every packet is still checked by the module's
// broker validators (acceptsQuery / acceptsEditBuffer); this file only sequences requests and collects replies.
// Hardware session of 2026-10-20: ~200 ms per Preset Request round trip, no reply for empty slots.
import type {MidiAuthorization,MidiLease} from '../../editor-host/midi-broker'

export interface DeviceLink {
 /** Sends one request and resolves with the first reply that `decode` accepts; rejects on timeout (no retry). */
 query<T>(grant:MidiAuthorization,bytes:readonly number[],decode:(bytes:readonly number[])=>T|null,timeoutMs?:number):Promise<T>
 /** Like query, but resolves null on timeout (an empty preset slot does not answer). */
 tryQuery<T>(grant:MidiAuthorization,bytes:readonly number[],decode:(bytes:readonly number[])=>T|null,timeoutMs?:number):Promise<T|null>
 /** Sends one request and collects every accepted reply until `quietMs` without one (bank bursts have no end marker). */
 burst<T>(grant:MidiAuthorization,bytes:readonly number[],decode:(bytes:readonly number[])=>T|null,quietMs:number,maxMs:number):Promise<T[]>
 send(grant:MidiAuthorization,bytes:readonly number[]):void
 cancel():void
 dispose():void
}

export function createDeviceLink(lease:MidiLease):DeviceLink{
 let active:{cancel:(reason:string)=>void}|null=null,disposed=false,offState:(()=>void)|null=null
 // Subscribed on first use: creating a session must not touch the lease (no listener, port or timer at construction).
 const watch=()=>{offState??=lease.onState(()=>active?.cancel('Liaison MIDI modifiée'))}
 function run<T>(grant:MidiAuthorization,bytes:readonly number[],onPacket:(bytes:number[],done:(value:T)=>void)=>void,timeoutMs:number,onTimeout:(done:(v:T)=>void,fail:(e:Error)=>void)=>void,quietMs?:number):Promise<T>{
  if(disposed)return Promise.reject(Error('Liaison fermée'))
  watch()
  if(active)return Promise.reject(Error('Un échange est déjà en cours'))
  const link=lease.getState()
  if(!link.connected||!link.binding)return Promise.reject(Error('Aucun port MIDI lié'))
  if(lease.supportsSysex&&!lease.supportsSysex())return Promise.reject(Error('SysEx non autorisé par le navigateur'))
  return new Promise<T>((resolve,reject)=>{
   let finished=false,timer:ReturnType<typeof setTimeout>|undefined,off=()=>{}
   const finish=(error:Error|null,value?:T)=>{if(finished)return;finished=true;if(timer!==undefined)clearTimeout(timer);off();active=null;error?reject(error):resolve(value as T)}
   const arm=(ms:number)=>{if(timer!==undefined)clearTimeout(timer);timer=setTimeout(()=>onTimeout(v=>finish(null,v),e=>finish(e)),ms)}
   active={cancel:reason=>finish(Error(reason))}
   try{off=lease.subscribe(packet=>{
    if(finished||packet.generation!==link.generation||packet.inputId!==link.binding!.inputId)return
    try{onPacket(packet.bytes,v=>finish(null,v));if(quietMs!==undefined&&!finished)arm(quietMs)}catch(e){finish(e instanceof Error?e:Error(String(e)))}
   })}catch(e){finish(e instanceof Error?e:Error(String(e)));return}
   arm(timeoutMs)
   try{lease.send([bytes],grant)}catch(e){finish(e instanceof Error?e:Error(String(e)))}
  })
 }
 return {
  query:(grant,bytes,decode,timeoutMs=1500)=>run(grant,bytes,(b,done)=>{const v=decode(b);if(v!==null)done(v)},timeoutMs,(_,fail)=>fail(Error('Pas de réponse de l’appareil (aucune relance automatique)'))),
  tryQuery:(grant,bytes,decode,timeoutMs=1000)=>run(grant,bytes,(b,done)=>{const v=decode(b);if(v!==null)done(v)},timeoutMs,done=>done(null)),
  burst(grant,bytes,decode,quietMs,maxMs){
   const items:ReturnType<typeof decode>[]=[],started=Date.now()
   return run(grant,bytes,(b)=>{const v=decode(b);if(v!==null)items.push(v);if(Date.now()-started>maxMs)throw Error('Rafale trop longue')},quietMs,done=>done(items.filter(v=>v!==null) as never),quietMs) as never
  },
  send(grant,bytes){if(disposed)throw Error('Liaison fermée');const link=lease.getState();if(!link.connected)throw Error('Aucun port MIDI lié');lease.send([bytes],grant)},
  cancel(){active?.cancel('Échange annulé')},
  dispose(){if(disposed)return;disposed=true;active?.cancel('Liaison fermée');offState?.()},
 }
}

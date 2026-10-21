import type {EditorViewRegistration} from '../../editor-host/view-contract'
import {m3000Module,type M3000Session} from './module'
import {M3000View} from './view'
import {portLooksLikeMSeries} from './device-panel'

const storageKey=(id:string)=>`midi-studio.tc-m3000.state.${id}.v1`
/** Instance-scoped recovery. Invalid stored data is ignored (explicit .json import stays available), never repaired. */
function load(id?:string){if(!id)return;try{const saved=localStorage.getItem(storageKey(id));if(saved)return m3000Module.validateState(JSON.parse(saved))}catch{/* keep the invalid source untouched */}}

export const m3000View:EditorViewRegistration={
 moduleId:m3000Module.manifest.id,viewVersion:1,
 presentation:{manufacturer:'M3000 / M2000',model:'Editor',preview:{src:'/editor-previews/tc-electronic-m3000.svg',width:2048,height:254,kind:'reference-aligned'}},
 // Candidate ports only: a name that looks like an M2000/M3000 (the owner's M3000 answers on "… M2000"). The model is
 // established by the Identity Reply (family 0x42), never by the name.
 matchesPort:port=>portLooksLikeMSeries(port.name),
 loadInitial:load,
 create(context){
  const session=context.session as M3000Session
  let timer:ReturnType<typeof setTimeout>|undefined,disposed=false
  const save=()=>{timer=undefined;if(disposed)return;try{localStorage.setItem(storageKey(context.id),JSON.stringify(session.serialize()))}catch{/* storage unavailable or session closed: workspace export remains */}}
  const off=session.subscribe(()=>{if(timer===undefined)timer=setTimeout(save,400)})
  const dispose=()=>{if(disposed)return;if(timer!==undefined){clearTimeout(timer);save()}disposed=true;off()}
  const offLifecycle=context.lifecycle?.onDispose(dispose)
  // Port topology changes reach the view through refresh(): a revision number re-reads the port lists.
  let revision=0,openMidi:(()=>void)|undefined
  const bindMidiSettings=(open:(()=>void)|undefined)=>{openMidi=open}
  return {render:props=><M3000View {...props} session={session} context={context} revision={revision} onMidiSettingsReady={bindMidiSettings}/>,openMidiSettings:()=>openMidi?.(),refresh(){revision++},dispose(){openMidi=undefined;offLifecycle?.();dispose()}}
 },
}

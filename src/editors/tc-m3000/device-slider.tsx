import {useEffect,useRef,useState} from 'react'
import shadowStylesheet from './device-slider-shadow.css?url'

/** Device selector of the TC M-series editor, built on toolcool-range-slider (MIT, pinned 4.0.28,
 * https://toolcool-range-slider.mzsoft.org/). The library writes an inline <style> into its shadow root, which the
 * shipped CSP (style-src 'self') refuses. A subclass strips that element before parsing and the slider's own
 * `css-links` hook loads an equivalent same-origin stylesheet instead; the library itself is not modified. */
const TAG='m3k-device-slider'
let registration:Promise<void>|null=null
function register():Promise<void>{
 return registration??=import('toolcool-range-slider').then(()=>{
  if(customElements.get(TAG))return
  const Base=customElements.get('toolcool-range-slider')
  if(!Base)throw Error('toolcool-range-slider non enregistré')
  const html=Object.getOwnPropertyDescriptor(ShadowRoot.prototype,'innerHTML')??Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')
  if(!html?.set||!html.get)throw Error('ShadowRoot.innerHTML indisponible')
  const {get,set}=html
  class CspSafeRangeSlider extends Base{
   attachShadow(init:ShadowRootInit){
    const root=super.attachShadow(init)
    Object.defineProperty(root,'innerHTML',{configurable:true,get(){return get.call(root)},set(value:string){set.call(root,String(value).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''))}})
    return root
   }
   /** Plugins would inject inline <style> too; none is loaded, and late CSS is refused rather than silently dropped. */
   addCSS(){throw Error('Feuilles inline refusées sous la CSP')}
  }
  customElements.define(TAG,CspSafeRangeSlider)
 })
}

export interface DeviceChoice<Id extends string> {id:Id;label:string;detail:string}
/** Two-or-more-position slider. The wheel is disabled (a scroll never switches the device); arrows and a click or
 * drag on the track do. Switching device is not destructive: each device keeps its own workspace. */
export function DeviceSlider<Id extends string>({choices,value,disabled,onChange}:{choices:readonly DeviceChoice<Id>[];value:Id;disabled?:boolean;onChange:(id:Id)=>void}){
 const mount=useRef<HTMLDivElement>(null),element=useRef<HTMLElement|null>(null),latest=useRef({value,onChange,choices}),[ready,setReady]=useState(false),[failure,setFailure]=useState('')
 latest.current={value,onChange,choices}
 const data=choices.map(c=>c.label).join(','),labelOf=(id:Id)=>choices.find(c=>c.id===id)?.label??''
 // Created imperatively: the library reads css-links only when the element is connected, so every attribute must
 // exist before insertion; later changes go through the library's own attribute observer.
 useEffect(()=>{let alive=true,el:HTMLElement|null=null
  // The slider's values are the visible labels (also its aria-valuetext); they map back to device ids.
  const change=(e:Event)=>{const label=(e as CustomEvent<{value:unknown}>).detail?.value,l=latest.current,hit=l.choices.find(c=>c.label===label);if(hit&&hit.id!==l.value)l.onChange(hit.id)}
  register().then(()=>{if(!alive||!mount.current)return
   el=document.createElement(TAG)
   for(const [k,v] of [['data',data],['value',labelOf(latest.current.value)],['css-links',shadowStylesheet],['mousewheel-disabled','true'],['aria-label','Appareil édité']])el.setAttribute(k,v)
   el.addEventListener('change',change);mount.current.appendChild(el);element.current=el;setReady(true)
  },e=>{if(alive)setFailure(e instanceof Error?e.message:String(e))})
  return()=>{alive=false;if(el){el.removeEventListener('change',change);el.remove()}element.current=null;setReady(false)}},[data])
 useEffect(()=>{const el=element.current,label=labelOf(value);if(el&&el.getAttribute('value')!==label)el.setAttribute('value',label)},[ready,value])
 useEffect(()=>{const el=element.current;if(!el)return;if(disabled)el.setAttribute('disabled','true');else el.removeAttribute('disabled')},[ready,disabled])
 const index=Math.max(0,choices.findIndex(c=>c.id===value))
 return <div className="m3k-device" role="group" aria-label="Appareil">
  <span className="m3k-device-title">Appareil</span>
  <div className="m3k-device-track">
   {/* React never renders children into the mount: the custom element is the only node it holds. */}
   <div ref={mount} className="m3k-device-mount"/>
   {!ready&&<span className="m3k-device-fallback">{failure?`Sélecteur indisponible (${failure}) : utilisez les boutons.`:'Chargement du sélecteur…'}</span>}
   <div className="m3k-device-stops">{choices.map((c,i)=><button key={c.id} type="button" aria-pressed={i===index} disabled={disabled} onClick={()=>{if(c.id!==value)onChange(c.id)}}>
    <strong>{c.label}</strong><small>{c.detail}</small></button>)}</div>
  </div>
 </div>
}

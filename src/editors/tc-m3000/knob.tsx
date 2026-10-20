import {useEffect,useRef,type KeyboardEvent,type PointerEvent} from 'react'

/** Rotary control. Lessons from the FireworX review (#81, #87): the wheel only acts on the focused control and a
 * plain click never changes the value; only an explicit drag, key or wheel gesture on the focused knob does. */
export function Knob({id,label,value,min,max,valueText,disabled,onChange,onFocus}:{
 id:string;label:string;value:number;min:number;max:number;valueText:string;disabled?:boolean
 onChange:(next:number)=>void;onFocus?:()=>void
}){
 const drag=useRef<{y:number;start:number;moved:boolean}|null>(null),button=useRef<HTMLButtonElement>(null),latest=useRef<{value:number;disabled?:boolean;set:(v:number)=>void;step:(e:{shiftKey:boolean})=>number}>({value,disabled,set:()=>{},step:()=>1})
 const span=max-min,clamp=(v:number)=>Math.max(min,Math.min(max,Math.round(v)))
 const angle=span>0?-135+270*(value-min)/span:0
 const set=(v:number)=>{const next=clamp(v);if(next!==value&&!disabled)onChange(next)}
 const step=(e:{shiftKey:boolean})=>e.shiftKey?Math.max(1,Math.round(span/20)):1
 function keyDown(e:KeyboardEvent<HTMLButtonElement>){
  const s=step(e),map:Record<string,number>={ArrowUp:value+s,ArrowRight:value+s,ArrowDown:value-s,ArrowLeft:value-s,PageUp:value+Math.max(1,Math.round(span/10)),PageDown:value-Math.max(1,Math.round(span/10)),Home:min,End:max}
  if(!(e.key in map))return
  e.preventDefault();set(map[e.key])
 }
 function pointerDown(e:PointerEvent<HTMLButtonElement>){
  if(disabled||e.button!==0)return
  e.currentTarget.setPointerCapture(e.pointerId);drag.current={y:e.clientY,start:value,moved:false}
 }
 function pointerMove(e:PointerEvent<HTMLButtonElement>){
  const d=drag.current;if(!d)return
  const pixels=d.y-e.clientY;if(Math.abs(pixels)<3&&!d.moved)return
  d.moved=true;set(d.start+pixels*Math.max(span,1)/(e.shiftKey?600:150))
 }
 function pointerUp(e:PointerEvent<HTMLButtonElement>){drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}
 latest.current={value,disabled,set,step}
 // React wheel handlers are passive: a native non-passive listener is needed to keep the page from scrolling, and it
 // acts only when this knob already has the focus. Scrolling over an unfocused knob scrolls the page (FireworX #81).
 useEffect(()=>{const el=button.current;if(!el)return
  const wheel=(e:globalThis.WheelEvent)=>{const l=latest.current,root=el.getRootNode() as Document|ShadowRoot;if(l.disabled||root.activeElement!==el)return;e.preventDefault();l.set(l.value+(e.deltaY<0?1:-1)*l.step(e))}
  el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[])
 return <button ref={button} type="button" id={id} className="m3k-knob" role="slider" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={valueText}
  disabled={disabled} onKeyDown={keyDown} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onFocus={onFocus}>
  <svg viewBox="0 0 40 40" aria-hidden="true"><circle className="m3k-knob-ring" cx="20" cy="20" r="17"/><g transform={`rotate(${angle} 20 20)`}><circle className="m3k-knob-cap" cx="20" cy="20" r="13"/><line className="m3k-knob-mark" x1="20" y1="9" x2="20" y2="15"/></g></svg>
 </button>
}

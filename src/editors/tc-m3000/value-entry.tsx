import {useEffect,useRef,useState,type KeyboardEvent} from 'react'

/** Typed value entry shared by both devices: double-click or Enter opens it, Enter commits, Escape cancels, an
 * invalid entry is refused with a message and an invalid blur cancels (FireworX QA observation). */
export function ValueEntry({label,value,disabled,format,parse,onCommit,onError}:{label:string;value:number;disabled?:boolean
 format:(v:number)=>string;parse:(text:string)=>number;onCommit:(v:number)=>void;onError:(m:string)=>void}){
 const [editing,setEditing]=useState(false),[text,setText]=useState(''),input=useRef<HTMLInputElement>(null)
 useEffect(()=>{if(editing)input.current?.select()},[editing])
 const open=()=>{if(disabled)return;setText(format(value));setEditing(true)}
 const commit=()=>{try{const raw=parse(text);setEditing(false);if(raw!==value)onCommit(raw)}catch(e){onError(e instanceof Error?e.message:String(e))}}
 const blur=()=>{if(!editing)return;try{const raw=parse(text);setEditing(false);if(raw!==value)onCommit(raw)}catch{setEditing(false)}}
 const key=(e:KeyboardEvent<HTMLInputElement>)=>{if(e.key==='Enter'){e.preventDefault();commit()}else if(e.key==='Escape'){e.preventDefault();setEditing(false)}}
 return editing
  ?<input ref={input} className="m3k-entry" value={text} aria-label={`${label}, saisir la valeur`} onChange={e=>setText(e.currentTarget.value)} onKeyDown={key} onBlur={blur}/>
  :<button type="button" className="m3k-value" disabled={disabled} aria-label={`${label} : ${format(value)}, modifier`} title="Double-clic ou Entrée : saisir · Entrée : valider · Échap : annuler"
    onDoubleClick={open} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();open()}}}>{format(value)}</button>
}

export const download=(name:string,bytes:Uint8Array|string,type:string)=>{const url=URL.createObjectURL(new Blob([typeof bytes==='string'?bytes:Uint8Array.from(bytes).buffer],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export const safeName=(s:string,fallback:string)=>s.replace(/[^\p{L}\p{N}_-]+/gu,'_').slice(0,40)||fallback

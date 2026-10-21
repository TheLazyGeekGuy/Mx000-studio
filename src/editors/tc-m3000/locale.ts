// M3000/M2000 page language (owner request 2026-10-21): the views are written in French; for any other host language
// the rendered text, titles, aria-labels and placeholders are put in English (exact strings, then fragment rules for
// text with numbers), then in the host language by its table (i18n/<lang>.ts, loaded on demand). Names (presets,
// files), the LCD and values are never rewritten by rule. French restores the originals.
import {useEffect,useRef,type RefObject} from 'react'
import {frenchToEnglish,englishFragments} from './locale-en'
import {applyLanguage,loadLanguage,type CompiledLanguage} from '../../editor-host/page-languages'
import {languageLoaders} from './i18n'

const GUARDED='.m3k-lcd,[data-m3k-name],.m3k-lib-table td:nth-child(2)>button,.m3k-lib-inspector h3,.m3k-lib-current strong,.m3k-value,.m3k-entry,option[data-m3k-name]'
const ATTRIBUTES=['title','aria-label','placeholder'] as const
const fragments=englishFragments.map(([source,replacement])=>[new RegExp(source,'g'),replacement] as [RegExp,string])
export function translateToEnglish(source:string){
 const text=source.trim();if(!text)return source
 const exact=frenchToEnglish[text.replace(/\s+/g,' ')];if(exact)return source.replace(text,exact)
 let out=source;for(const [pattern,replacement] of fragments)out=out.replace(pattern,replacement);return out
}
export function createDomLocale(root:HTMLElement,language:string){
 let english=language!=='fr',pending=false,disposed=false,target=language,table:CompiledLanguage|null=null
 // Other languages: the English text is translated by that language's table (loaded on demand).
 const useLanguage=(value:string)=>{target=value;table=null;if(value==='fr'||value==='en')return
  void loadLanguage(languageLoaders,value).then(t=>{if(disposed||target!==value)return;table=t;paint()})}
 // Guarded areas (names, LCD, values): whole known strings only, never fragment rules.
 const toTarget=(source:string,guarded=false)=>{if(guarded){const inEnglish=frenchToEnglish[source.trim()]?translateToEnglish(source):source;return applyLanguage(table,inEnglish,{fragments:false})}
  return applyLanguage(table,translateToEnglish(source))}
 const texts=new WeakMap<Node,{source:string;output:string}>(),attrs=new WeakMap<Element,Map<string,{source:string;output:string}>>()
 const paint=()=>{if(disposed)return;pending=false;observer.disconnect()
  const walk=root.ownerDocument.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null
  while((node=walk.nextNode())){const parent=node.parentElement;if(!parent||parent.closest('script,style'))continue
   const before=node.textContent??'',known=texts.get(node),source=known&&known.output===before?known.source:before
   const output=!english?source:toTarget(source,!!parent.closest(GUARDED))
   texts.set(node,{source,output});if(output!==before)node.textContent=output}
  for(const element of root.querySelectorAll('[title],[aria-label],[placeholder]')){let records=attrs.get(element);if(!records){records=new Map();attrs.set(element,records)}
   for(const key of ATTRIBUTES){const before=element.getAttribute(key);if(before===null)continue;const known=records.get(key),source=known?.output===before?known.source:before,output=english?toTarget(source):source
    records.set(key,{source,output});if(output!==before)element.setAttribute(key,output)}}
  observer.observe(root,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:[...ATTRIBUTES]})}
 const observer=new MutationObserver(()=>{if(!pending){pending=true;queueMicrotask(paint)}})
 useLanguage(language);paint()
 return {set(value:string){english=value!=='fr';useLanguage(value);paint()},dispose(){disposed=true;observer.disconnect()}}
}
/** Keeps the page of `ref` in the host language (French source; English, Italian, German, Japanese, Spanish, Russian, Chinese). */
export function useDomLocale(ref:RefObject<HTMLElement|null>,language:string){
 // One translator per page, kept across language changes: it remembers each node's French source. Recreating it on a
 // change took the text on screen (already German, say) as the source, and a later language mixed both.
 const locale=useRef<ReturnType<typeof createDomLocale>|null>(null),first=useRef(language)
 useEffect(()=>{const root=ref.current;if(!root)return;locale.current=createDomLocale(root,first.current);return()=>{locale.current?.dispose();locale.current=null}},[ref])
 useEffect(()=>{locale.current?.set(language)},[language])
}

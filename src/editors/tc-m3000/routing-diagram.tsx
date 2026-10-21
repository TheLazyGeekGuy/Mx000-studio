// Routing of the two engines, drawn (M3000 and M2000: same six routings; manuals M3K-EN pp.18–19, M2K-EN p.16).
// Each routing is a card with its signal diagram (inputs L/R → engines → outputs L/R); the selected one is drawn large
// with the manual's description. No inline style (CSP): SVG presentation attributes and classes only.
import type {ReactNode} from 'react'

export type RoutingKind='serial'|'parallel'|'dual-input'|'dual-mono'|'linked'|'glide'
export interface RoutingChoice {value:number;label:string;kind:RoutingKind}
const ABOUT:Record<RoutingKind,string>={
 'serial':'Entrée et sortie stéréo. Toute la sortie du moteur 1 alimente l’entrée du moteur 2 : deux effets dans le même trajet (par exemple de-esser puis réverbe).',
 'parallel':'Entrée et sortie stéréo. Les deux moteurs traitent la même source et leurs sorties sont mélangées en stéréo.',
 'dual-input':'Deux entrées mono, sortie stéréo commune : l’entrée gauche va au moteur 1, la droite au moteur 2 (deux envois de console, un seul retour).',
 'dual-mono':'Deux effets mono indépendants : entrée/sortie gauche pour le moteur 1, entrée/sortie droite pour le moteur 2 (deux inserts).',
 'linked':'Le preset du moteur 1 est copié dans le moteur 2 et leurs pages d’édition sont couplées ; voies gauche et droite entièrement séparées. Choisir ce routage remplace le moteur 2.',
 'glide':'Changement de preset en fondu enchaîné entre l’effet en cours et le nouveau (durée dans Utility). Un seul moteur disponible.',
}
/** Kind of each routing value: M3000 order confirmed on the unit (0 Serial … 5 Pre-glide); M2000 by its manual labels. */
export function routingKind(label:string):RoutingKind{
 const l=label.toLowerCase()
 return /glide/.test(l)?'glide':/linked|coupl|stereo|stéréo/.test(l)?'linked':/dual ?mono|double mono/.test(l)?'dual-mono':/dual ?input|split|double entr/.test(l)?'dual-input':/parallel|parallèle/.test(l)?'parallel':'serial'
}

const box=(x:number,y:number,label:string,muted=false)=><g className={`rt-engine${muted?' rt-muted':''}`}><rect x={x} y={y} width={52} height={26} rx={3}/><text x={x+26} y={y+17}>{label}</text></g>
const port=(x:number,y:number,label:string,anchor:'start'|'end')=><g className="rt-port"><circle cx={x} cy={y} r={3}/><text x={anchor==='start'?x+6:x-6} y={y-6} textAnchor={anchor}>{label}</text></g>
const wire=(d:string,extra='')=><path className={`rt-wire${extra?' '+extra:''}`} d={d}/>
const sum=(x:number,y:number)=><g className="rt-sum"><circle cx={x} cy={y} r={7}/><text x={x} y={y+4}>+</text></g>

/** Signal diagram of one routing (viewBox 0 0 260 110). */
export function RoutingDiagram({kind,large=false}:{kind:RoutingKind;large?:boolean}){
 let body:ReactNode
 switch(kind){
  case 'serial':body=<>{port(12,55,'IN L/R','start')}{wire('M15 55 H58')}{box(58,42,'Moteur 1')}{wire('M110 55 H140')}{box(140,42,'Moteur 2')}{wire('M192 55 H245')}{port(248,55,'OUT L/R','end')}</>;break
  case 'parallel':body=<>{port(12,55,'IN L/R','start')}{wire('M15 55 H40 V28 H88 M40 55 V82 H88')}{box(88,15,'Moteur 1')}{box(88,69,'Moteur 2')}{wire('M140 28 H190 V48 M140 82 H190 V62')}{sum(190,55)}{wire('M197 55 H245')}{port(248,55,'OUT L/R','end')}</>;break
  case 'dual-input':body=<>{port(12,28,'IN L','start')}{port(12,82,'IN R','start')}{wire('M15 28 H88 M15 82 H88')}{box(88,15,'Moteur 1')}{box(88,69,'Moteur 2')}{wire('M140 28 H190 V48 M140 82 H190 V62')}{sum(190,55)}{wire('M197 55 H245')}{port(248,55,'OUT L/R','end')}</>;break
  case 'dual-mono':body=<>{port(12,28,'IN L','start')}{port(12,82,'IN R','start')}{wire('M15 28 H104 M15 82 H104')}{box(104,15,'Moteur 1')}{box(104,69,'Moteur 2')}{wire('M156 28 H245 M156 82 H245')}{port(248,28,'OUT L','end')}{port(248,82,'OUT R','end')}</>;break
  case 'linked':body=<>{port(12,28,'IN L','start')}{port(12,82,'IN R','start')}{wire('M15 28 H104 M15 82 H104')}{box(104,15,'Moteur 1')}{box(104,69,'= Moteur 1')}{wire('M130 41 V69','rt-link')}<text className="rt-note" x={136} y={58}>copie</text>{wire('M156 28 H245 M156 82 H245')}{port(248,28,'OUT L','end')}{port(248,82,'OUT R','end')}</>;break
  default:body=<>{port(12,55,'IN L/R','start')}{wire('M15 55 H96')}{box(96,42,'Moteur 1')}<text className="rt-note" x={122} y={34}>fondu enchaîné</text>{box(96,80,'Moteur 2',true)}{wire('M148 55 H245')}{port(248,55,'OUT L/R','end')}</>
 }
 return <svg className={`rt-diagram${large?' rt-large':''}`} viewBox="0 0 260 110" role="img" aria-label={`Schéma du routage : ${ABOUT[kind]}`}>{body}</svg>
}

/** Six routing cards; the current one is drawn large with its description. */
export function RoutingPicker({value,choices,disabled,onChange,note}:{value:number;choices:readonly RoutingChoice[];disabled?:boolean;onChange:(value:number)=>void;note?:ReactNode}){
 const current=choices.find(c=>c.value===value)
 return <section className="rt-picker" aria-label="Routage des moteurs">
  <div className="rt-cards" role="radiogroup" aria-label="Routage">{choices.map(c=><button key={c.value} type="button" role="radio" aria-checked={c.value===value} disabled={disabled}
   className="rt-card" onClick={()=>c.value!==value&&onChange(c.value)} title={ABOUT[c.kind]}><RoutingDiagram kind={c.kind}/><span>{c.value+1} · {c.label}</span></button>)}</div>
  {current&&<div className="rt-current"><RoutingDiagram kind={current.kind} large/><div><h4>{current.value+1} · {current.label}</h4><p>{ABOUT[current.kind]}</p>{note}</div></div>}
 </section>
}

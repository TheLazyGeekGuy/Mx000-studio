import {useEffect,useRef,type KeyboardEvent,type PointerEvent} from 'react'
import {adjust,blackWindow,cardSlot,chassis,cursorLegend,earSlots,headerY,headers,indicatorX,indicators,keys,lcd,meterColumns,meterRows,meterScale,okBadge,panelSize,sectionRulesX,type PanelKey} from './panel-geometry'

export interface LcdEngineLine {engine:1|2;type:string;parameter:string;value:string;name:string;inactive?:boolean}
export interface PanelProps {
 /** Keys whose LED is lit by the editor (editor state, not hardware feedback). */
 litKeys:ReadonlySet<string>
 /** Keys wired to a local editor action; every other key is shown but inert, with an explanation. */
 actions:Readonly<Record<string,string>>
 lcdLines:readonly [LcdEngineLine,LcdEngineLine]
 onKey:(id:string)=>void
 onAdjust:(delta:number)=>void
 adjustLabel:string
 /** Skin and legends. The M2000 shares the M3000 layout (PANEL-INVENTORY.md, "M2000"): black plate, light keys,
  * underlined white headers, blue secondary legends, TUNER and AUTO LEVEL under SETUP, OK on a light box. */
 model?:'m3000'|'m2000'
}
const SECONDARY_M2000:Readonly<Record<string,string>>={'setup.routing':'TUNER','setup.levels':'AUTO LEVEL'}
const SECONDARY_AT_M2000:Readonly<Record<string,readonly [number,number]>>={'setup.routing':[907,133],'setup.levels':[907,170]}
const textLines=(k:PanelKey)=>k.primary||'POWER'

/** Native reconstruction of the M3000 front panel in the coordinates of TC's press image (panel-geometry.ts).
 * It is an editor surface: LEDs and LCD show the editor's own state, never hardware feedback. */
export function M3000Panel({litKeys,actions,lcdLines,onKey,onAdjust,adjustLabel,model='m3000'}:PanelProps){
 const m2000=model==='m2000',name=m2000?'M2000':'M3000'
 const wheel=useRef<SVGGElement>(null),drag=useRef<{y:number;sent:number}|null>(null),adjustRef=useRef(onAdjust)
 adjustRef.current=onAdjust
 useEffect(()=>{const el=wheel.current;if(!el)return
  const handler=(e:WheelEvent)=>{const root=el.getRootNode() as Document|ShadowRoot;if(root.activeElement!==el)return;e.preventDefault();adjustRef.current(e.deltaY<0?1:-1)}
  el.addEventListener('wheel',handler,{passive:false});return()=>el.removeEventListener('wheel',handler)},[])
 const keyDown=(id:string)=>(e:KeyboardEvent<SVGGElement>)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(actions[id])onKey(id)}}
 const wheelKey=(e:KeyboardEvent<SVGGElement>)=>{const d:Record<string,number>={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:10,PageDown:-10};if(e.key in d){e.preventDefault();onAdjust(d[e.key]*(e.shiftKey?10:1))}}
 const down=(e:PointerEvent<SVGGElement>)=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.focus();drag.current={y:e.clientY,sent:0}}
 const move=(e:PointerEvent<SVGGElement>)=>{const d=drag.current;if(!d)return;const steps=Math.trunc((d.y-e.clientY)/6);if(steps!==d.sent){onAdjust(steps-d.sent);d.sent=steps}}
 const up=(e:PointerEvent<SVGGElement>)=>{drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}
 const [lx,ly,lw,lh]=lcd
 return <svg className={`m3k-panel${m2000?' m3k-skin-m2000':''}`} viewBox={`0 0 ${panelSize.width} ${panelSize.height}`} role="group" aria-label={`Façade TC Electronic ${name} (reconstruction)`} data-model={model}>
  <rect className="m3k-plate" x={chassis[0]} y={chassis[1]} width={chassis[2]} height={chassis[3]} rx="3"/>
  <line className="m3k-ear-seam" x1="138" y1={chassis[1]} x2="138" y2={chassis[1]+chassis[3]}/><line className="m3k-ear-seam" x1="1911" y1={chassis[1]} x2="1911" y2={chassis[1]+chassis[3]}/>
  {earSlots.map(([x,y,w,h],i)=><rect key={i} className="m3k-slot" x={x} y={y} width={w} height={h} rx={h/2}/>)}
  <text className="m3k-logo" x="188" y="138">t.c. electronic</text><line className="m3k-rule" x1="314.5" y1="103" x2="314.5" y2="140"/>
  <text className="m3k-model" x="324" y="132">{name}</text><text className="m3k-model-sub" x="323" y="139">{m2000?'STUDIO EFFECTS PROCESSOR':'STUDIO REVERB PROCESSOR'}</text>
  <rect className="m3k-card" x={cardSlot[0]} y={cardSlot[1]} width={cardSlot[2]} height={cardSlot[3]}/>
  <rect className="m3k-window" x={blackWindow[0]} y={blackWindow[1]} width={blackWindow[2]} height={blackWindow[3]} rx="2"/>
  {meterColumns.map((x,c)=>meterRows.map((y,r)=><rect key={`${c}-${r}`} className="m3k-meter-led" x={x} y={y} width="10.5" height="6.6"/>))}
  {meterScale.map((t,r)=><text key={t} className="m3k-window-text m3k-center" x="483.5" y={meterRows[r]+6}>{t}</text>)}
  <text className="m3k-window-text m3k-boxed" x="463" y="186">L</text><text className="m3k-window-text" x="480" y="186">dB</text><text className="m3k-window-text m3k-boxed" x="494" y="186">R</text>
  {indicators.map(i=><g key={i.id}><rect className="m3k-indicator" x={indicatorX} y={i.y} width="6.6" height="6.6"/><text className="m3k-window-text" x="533" y={i.y+6}>{i.label}</text></g>)}
  <g className="m3k-lcd" aria-label="Écran (projection de l’éditeur, pas une lecture de l’écran matériel)">
   <rect className="m3k-lcd-bg" x={lx} y={ly} width={lw} height={lh}/>
   {lcdLines.map((line,i)=>{const y=ly+4+i*58;return <g key={line.engine} className={line.inactive?'m3k-lcd-inactive':undefined}>
    <rect className="m3k-lcd-ink" x={lx+3} y={y} width="11" height="24"/><text className="m3k-lcd-num" x={lx+8.5} y={y+17}>{line.engine}</text>
    <text className="m3k-lcd-small" x={lx+18} y={y+7}>TYPE</text><text className="m3k-lcd-big" x={lx+18} y={y+23}>{line.type.slice(0,12)}</text>
    <text className="m3k-lcd-small" x={lx+150} y={y+7}>{line.parameter.slice(0,14)}</text><text className="m3k-lcd-big" x={lx+150} y={y+23}>{line.value.slice(0,10)}</text>
    <text className="m3k-lcd-name" x={lx+18} y={y+46}>{line.name.slice(0,20)}</text></g>})}
  </g>
  {headers.map(h=><g key={h.id}><rect className="m3k-header" x={h.x0} y={headerY[0]} width={h.x1-h.x0} height={headerY[1]-headerY[0]}/>{m2000&&<line className="m3k-header-rule" x1={h.x0+3} y1={headerY[1]+1} x2={h.x1-6} y2={headerY[1]+1}/>}<text className="m3k-header-text" x={h.x0+4} y={headerY[1]-3}>{h.text}</text>{h.extra&&<text className="m3k-header-text m3k-small" x={h.x1-4} y={headerY[1]-3} textAnchor="end">{h.extra}</text>}</g>)}
  {sectionRulesX.map(x=><line key={x} className="m3k-rule m3k-section-rule" x1={x} y1={headerY[0]} x2={x} y2="196"/>)}
  <rect className="m3k-ok-badge" x={okBadge[0]} y={okBadge[1]} width={okBadge[2]} height={okBadge[3]}/><text className="m3k-ok-text" x={okBadge[0]+okBadge[2]/2} y={okBadge[1]+12}>OK</text>
  <text className="m3k-legend" x={cursorLegend[0]} y={cursorLegend[1]}>CURSOR</text>
  {keys.map(k=>{const [x,y,w,h]=k.rect,action=actions[k.id],lit=litKeys.has(k.id),secondary=(m2000?SECONDARY_M2000[k.id]:undefined)??k.secondary,secondaryAt=(m2000?SECONDARY_AT_M2000[k.id]:undefined)??k.secondaryAt
   return <g key={k.id} className={`m3k-key${action?'':' m3k-key-inert'}`} data-key={k.id} role="button" tabIndex={0} aria-disabled={!action}
    aria-pressed={k.led?lit:undefined} aria-label={`${textLines(k)}${secondary?` (${secondary})`:''}${action?` — ${action}`:' — sans action dans l’éditeur'}`}
    onClick={()=>{if(action)onKey(k.id)}} onKeyDown={keyDown(k.id)}>
    <title>{action??'Touche reproduite, sans action : aucun échange avec l’appareil dans cette version'}</title>
    <rect className="m3k-key-cap" x={x} y={y} width={w} height={h} rx="2"/>
    {k.led&&<rect className={`m3k-key-led${lit?' m3k-lit':''}${k.id==='power'?' m3k-power':''}`} x={k.led[0]} y={k.led[1]} width={k.led[2]} height={k.led[3]}/>}
    {k.legend&&<text className="m3k-legend" x={k.legend[0]} y={k.legend[1]}>{k.primary}</text>}
    {secondary&&secondaryAt&&<text className="m3k-legend m3k-small m3k-secondary" x={secondaryAt[0]} y={secondaryAt[1]}>{secondary}</text>}
   </g>})}
  <text className="m3k-legend" x={adjust.label[0]} y={adjust.label[1]+9}>ADJUST</text>
  <g ref={wheel} className="m3k-adjust" role="slider" tabIndex={0} aria-label={`ADJUST — ${adjustLabel}`} aria-valuetext={adjustLabel} onKeyDown={wheelKey} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
   <circle className="m3k-adjust-skirt" cx={adjust.cx} cy={adjust.cy} r={adjust.r}/><circle className="m3k-adjust-cap" cx={adjust.cx} cy={adjust.cy} r={adjust.r*0.82}/>
  </g>
 </svg>
}

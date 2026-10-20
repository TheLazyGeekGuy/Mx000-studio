// Front-panel geometry of the TC Electronic M3000, in pixels of TC's own press image M3000_Front.jpg
// (2048×254, retrieved byte-exact from the Internet Archive, SHA-256 9cc1f559…). Key rectangles were measured on
// that image and cross-checked against the manual's vector drawing (English Rev 3, printed pp.6–7): 26 key centres,
// residual max 2.93 px. Source: docs/instruments/sources/tc-m2000-m3000/PANEL-INVENTORY.md and m3000-panel-geometry.json.
// The legend typeface is not identified; the renderer substitutes a humanist sans (recorded, not claimed).
export type Rect=readonly [x:number,y:number,w:number,h:number]
export type KeySection='power'|'setup'|'engine1'|'engine2'|'combined'|'snapshots'|'control'
export interface PanelKey {id:string;section:KeySection;primary:string;secondary?:string;rect:Rect;led?:Rect;
 /** Primary legend placement (measured); absent when the legend is the inverse OK badge or a symbol group. */
 legend?:readonly [x:number,y:number];secondaryAt?:readonly [x:number,y:number]}

const L=(x:number,y:number)=>[x,y+6] as const
export const panelSize={width:2048,height:254} as const
export const chassis:Rect=[27,35,1993,182]
export const earSlots:readonly Rect[]=[[45,46,41,30],[45,180,42,29],[1962,44,40,29],[1963,176,39,28]]
export const cardSlot:Rect=[186,147,234,29]
export const blackWindow:Rect=[440,60,431,137]
export const lcd:Rect=[587,68,265,119]
export const adjust={cx:1799.3,cy:125,r:66.3,label:[1839,50] as const}
export const headers:readonly {id:string;text:string;x0:number;x1:number;extra?:string}[]=[
 {id:'setup',text:'SETUP',x0:897,x1:1049},{id:'engine1',text:'ENGINE 1',x0:1054,x1:1206},{id:'engine2',text:'ENGINE 2',x0:1210,x1:1362},
 {id:'combined',text:'COMBINED 1+2',x0:1367,x1:1559,extra:'SNAPSHOTS'},{id:'control',text:'CONTROL',x0:1563,x1:1708}]
export const headerY=[48,62] as const
export const sectionRulesX=[897,1054,1210,1367,1563] as const

const ledRows=[76.3,112.9,149.5,186.2]
const row=(i:number,x:number,w:number,h:number):Rect=>[x,[70,106,143,179][i],w,h]
const keyLed=(x:number,i:number):Rect=>[x,ledRows[i],13.1,4]
export const keys:readonly PanelKey[]=[
 {id:'power',section:'power',primary:'',rect:[185,70,78,18],led:[195.7,76.3,13.1,5.3]},
 {id:'setup.io',section:'setup',primary:'I/O',secondary:'HELP',rect:[906,70,76,18],led:keyLed(912.1,0),legend:L(989,75),secondaryAt:L(907,91)},
 {id:'setup.routing',section:'setup',primary:'ROUTING',rect:[906,106,76,20],led:keyLed(912.1,1),legend:L(989,111)},
 {id:'setup.levels',section:'setup',primary:'LEVELS',rect:[906,143,76,19],led:keyLed(912.1,2),legend:L(989,148)},
 {id:'setup.util_midi',section:'setup',primary:'UTIL / MIDI',secondary:'MIDI MONITOR',rect:[906,180,77,19],led:keyLed(912.1,3),legend:L(989,184),secondaryAt:L(907,201)},
 ...(['engine1','engine2','combined'] as const).flatMap((section,s)=>{
  const x=[1063,1219,1376][s],lx=[1145,1302,1458][s],led=[1068.8,1225.7,1382.6][s]
  return [
   {id:`${section}.recall`,section,primary:'RECALL',secondary:'WIZARD',rect:row(0,x,76,18),led:keyLed(led,0),legend:L(lx,75),secondaryAt:L(x,91)},
   {id:`${section}.store`,section,primary:'STORE',secondary:'DELETE PRESET',rect:row(1,x,76,19),led:keyLed(led,1),legend:L(lx,111),secondaryAt:L(x,127)},
   {id:`${section}.edit`,section,primary:'EDIT',rect:row(2,x,76,19),led:keyLed(led,2),legend:L(lx,147)},
   {id:`${section}.bypass`,section,primary:'BYPASS',rect:row(3,x,76,19),led:keyLed(led,3),legend:L(lx,184)},
  ] as PanelKey[]}),
 ...[0,1,2,3].map(i=>({id:`snapshot.${i+1}`,section:'snapshots' as const,primary:String(i+1),secondary:`STORE ${i+1}`,rect:row(i,1512,34,i===0||i===2?18:19),legend:L(1549,[75,111,148,184][i]),secondaryAt:L(1512,[90,127,164,200][i])})),
 {id:'control.ok',section:'control',primary:'OK',secondary:'CANCEL',rect:[1574,69,76,19],led:[1581.3,76.4,13.1,4],secondaryAt:L(1574,90)},
 {id:'control.shift',section:'control',primary:'SHIFT',rect:[1574,106,76,19],led:[1581.3,112.9,13.1,4],legend:L(1656,110)},
 {id:'control.cursor_up',section:'control',primary:'▲',secondary:'PAGE UP',rect:[1574,143,76,18],legend:L(1656,146),secondaryAt:L(1574,163)},
 {id:'control.cursor_down',section:'control',primary:'▼',secondary:'PAGE DOWN',rect:[1574,179,76,19],legend:L(1656,183),secondaryAt:L(1574,200)},
 {id:'control.tap',section:'control',primary:'TAP',rect:[1678,70,34,18],legend:L(1716,74)},
]
export const okBadge:Rect=[1648,70,20,16]
export const cursorLegend=[1656,171] as const
/** PPM meter: 2 columns × 7 LEDs; scale printed between the columns (manual p.6: −40 dB to 0 dB). */
export const meterScale=['0','-3','-6','-12','-18','-24','-40'] as const
export const meterRows=[70.5,86.2,101.9,117.6,133.3,149.0,164.7] as const
export const meterColumns=[462.4,493.7] as const
export const indicators:readonly {id:string;label:string;y:number}[]=[
 {id:'overload',label:'OVERLOAD',y:70.4},{id:'fs48',label:'48000Hz',y:86.1},{id:'fs44',label:'44100Hz',y:101.8},{id:'fs32',label:'32000Hz',y:117.5},
 {id:'midi-in',label:'MIDI IN',y:133.2},{id:'card',label:'CARD',y:148.9},{id:'tempo',label:'TEMPO',y:164.6},{id:'morphing',label:'MORPHING',y:180.3}]
export const indicatorX=521.8

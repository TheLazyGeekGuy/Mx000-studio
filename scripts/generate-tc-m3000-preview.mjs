// Renders the catalog preview from the actual M3000 panel component and stylesheet.
// Usage: node scripts/generate-tc-m3000-preview.mjs [--check]
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
const out=process.cwd()+'/output/research/tc-m3000-panel/render.cjs'
mkdirSync('output/research/tc-m3000-panel',{recursive:true})
await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {M3000Panel} from './src/editors/tc-m3000/panel';
export const svg=()=>renderToStaticMarkup(React.createElement(M3000Panel,{litKeys:new Set(['power','engine1.edit']),actions:{},onKey(){},onAdjust(){},adjustLabel:'aperçu',
 lcdLines:[{engine:1,type:'VSS-3 REVERB',parameter:'MIX',value:'0',name:'Brouillon local'},{engine:2,type:'DELAY',parameter:'MIX',value:'0',name:'—',inactive:true}]}))`,
 resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'cjs',outfile:out,jsx:'automatic',logLevel:'silent'})
const css=readFileSync('src/editors/tc-m3000/m3000.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'').split('\n').filter(l=>/^\.m3k-(plate|ear|slot|logo|model|rule|card|window|meter|indicator|center|boxed|lcd|header|small|legend|ok|key|adjust)/.test(l)).join('')
const panel=createRequire(import.meta.url)(out).svg().replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ').replace(/ role="group" aria-label="[^"]*"/,'')
const svg=panel.replace(/(<svg[^>]*>)/,`$1<style>${css}</style>`)
const target='public/editor-previews/tc-electronic-m3000.svg'
if(process.argv.includes('--check')){if(!existsSync(target)||readFileSync(target,'utf8')!==svg)throw Error('M3000 preview differs from the actual panel');console.log('PASS M3000 preview matches the panel component')}
else{writeFileSync(target,svg);console.log(`wrote ${target} (${svg.length} bytes) from the actual panel component`)}

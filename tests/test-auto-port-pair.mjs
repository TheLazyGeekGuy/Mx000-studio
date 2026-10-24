import assert from 'node:assert/strict'
import {build} from 'esbuild'
const built=await build({stdin:{contents:"export * from './src/editors/tc-m3000/device-ports'",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'esm'}),m=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const port=(id,name,state='connected')=>({id,name,state}),i=port('in','Rack M2000'),o=port('out',i.name),yes=()=>true
assert.deepEqual(m.automaticMSeriesPair([i],[o],yes,null),{input:i,output:o})
assert.equal(m.automaticMSeriesPair([i,port('other','M3000')],[o,port('other-out','M3000')],yes,null),null)
assert.equal(m.automaticMSeriesPair([i],[o],()=>false,null),null)
assert.equal(m.automaticMSeriesPair([i],[{...o,state:'disconnected'}],yes,null),null)
assert.equal(m.automaticMSeriesPair([i],[o],yes,'Remembered missing port'),null,'No fallback away from a remembered route')
assert.deepEqual(m.automaticMSeriesPair([i,port('other','M3000')],[o,port('other-out','M3000')],yes,i.name),{input:i,output:o})
assert.equal(m.automaticMSeriesPair([i,port('duplicate',i.name)],[o],yes,null),null)
assert.equal(m.automaticMSeriesPair([port('x','Other device')],[port('y','Other device')],yes,null),null)
console.log('PASS M-series first binding: unique named candidate, remembered route, ambiguity/busy/disconnected/no-retarget; no MIDI')

import {spawnSync} from 'node:child_process'
// Offline suites: synthetic data and fake MIDI only; no physical port is ever opened.
for(const file of ['test-auto-port-pair.mjs','test-tc-m3000.mjs','test-tc-m2000.mjs']){
 const result=spawnSync(process.execPath,['tests/'+file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1)
}
console.log('PASS all offline suites; no physical MIDI ports')

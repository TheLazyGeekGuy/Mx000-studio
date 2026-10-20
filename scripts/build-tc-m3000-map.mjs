// Generates src/editors/tc-m3000/parameter-map.ts from the manufacturer SysEx tables transcribed in
// docs/instruments/tc-m3000/SYSEX-PARAMETERS.json (TC Electronic M3000 MIDI specification V1.01, SW 2.03).
// Optional display labels/units come from docs/instruments/tc-m3000/DISPLAY-MAP.json when present.
// Usage: node scripts/build-tc-m3000-map.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const sourcePath = path.join(root, 'docs/instruments/tc-m3000/SYSEX-PARAMETERS.json')
const displayPath = path.join(root, 'docs/instruments/tc-m3000/DISPLAY-MAP.json')
const target = path.join(root, 'src/editors/tc-m3000/parameter-map.ts')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

const sourceBytes = fs.readFileSync(sourcePath)
const spec = JSON.parse(sourceBytes)
const displayBytes = fs.existsSync(displayPath) ? fs.readFileSync(displayPath) : null
const display = displayBytes ? JSON.parse(displayBytes) : null

const int = (v, what) => { if (!Number.isInteger(v)) throw Error(`${what}: integer expected, got ${v}`); return v }
const algorithms = spec.algorithm_types.rows.map(r => ({id: int(r.id, r.name), name: String(r.name), expert: /\(Expert\)/.test(r.name)}))
if (new Set(algorithms.map(a => a.id)).size !== algorithms.length) throw Error('Duplicate algorithm id')

const tables = spec.engine_parameter_tables.map((t, index) => {
  const ids = t.algorithm_ids.map(id => int(id, t.heading))
  for (const id of ids) if (!algorithms.some(a => a.id === id)) throw Error(`Unknown algorithm ${id} in ${t.heading}`)
  const params = t.rows.map(r => {
    const p = {id: int(r.id, r.name), name: String(r.name), cc: r.cc === null ? null : int(r.cc, r.name), min: int(r.min, r.name), max: int(r.max, r.name)}
    if (p.min > p.max || p.id < 0 || p.id > 127) throw Error(`Invalid row ${t.heading} ${r.name}`)
    return p
  })
  if (new Set(params.map(p => p.id)).size !== params.length) throw Error(`Duplicate parameter id in ${t.heading}`)
  return {key: `t${index}`, heading: String(t.heading).replace(/:$/, ''), algorithmIds: ids, page: int(t.page, t.heading), params}
})
for (const a of algorithms) {
  const owners = tables.filter(t => t.algorithmIds.includes(a.id))
  if (owners.length !== 1) throw Error(`Algorithm ${a.id} has ${owners.length} parameter tables`)
  a.table = owners[0].key
}
const system = spec.system_parameters.rows.map(r => ({
  id: int(r.id, r.name), name: String(r.name), cc: r.cc === null ? null : int(r.cc, r.name),
  min: r.min === null ? null : int(r.min, r.name), max: r.max === null ? null : int(r.max, r.name),
}))

// Display data is attached only where the display map gives it; unknown stays raw.
const displayFor = (scope, id) => {
  if (!display) return null
  const list = scope === 'system' ? display.system : null
  const entry = list?.find(e => e.id === id)
  return entry ? {label: entry.label_en ?? null, labelFr: entry.label_fr ?? null, unit: entry.unit ?? null, scale: entry.scale ?? {kind: 'unknown'}, status: entry.status ?? 'unknown', cite: entry.cite ?? []} : null
}
const engineDisplay = (table, id) => {
  if (!display?.engines) return null
  for (const key of [table.heading, ...table.algorithmIds.map(String)]) {
    const e = display.engines[key]?.params?.find(p => p.id === id)
    if (e) return {label: e.label_en ?? null, labelFr: e.label_fr ?? null, unit: e.unit ?? null, scale: e.scale ?? {kind: 'unknown'}, status: e.status ?? 'unknown', cite: e.cite ?? []}
  }
  return null
}
const engineGroups = table => {
  if (!display?.engines) return null
  for (const key of [table.heading, ...table.algorithmIds.map(String)]) if (display.engines[key]?.groups) {
    return display.engines[key].groups.map(g => {
      const params = g.params.map(id => int(id, `group ${g.name_en} of ${table.heading}`))
      for (const id of params) if (!table.params.some(q => q.id === id)) throw Error(`Group ${g.name_en} of ${table.heading} names unknown parameter ${id}`)
      return {name_en: g.name_en ?? null, name_fr: g.name_fr ?? null, params, cite: g.cite ?? []}
    })
  }
  return null
}
for (const t of tables) { for (const p of t.params) p.display = engineDisplay(t, p.id); t.groups = engineGroups(t) }
// Two rows of one table sharing a French label (e.g. Hi Color, easy mode vs early reflections) would read as one
// control: the French label is dropped for those rows, the qualified English label is shown instead.
for (const t of tables) {
  const count = new Map(); for (const p of t.params) if (p.display?.labelFr) count.set(p.display.labelFr, (count.get(p.display.labelFr) ?? 0) + 1)
  for (const p of t.params) if (p.display?.labelFr && count.get(p.display.labelFr) > 1 && p.display.label && p.display.label !== p.display.labelFr) p.display.labelFr = null
}
for (const p of system) p.display = displayFor('system', p.id)

const data = {
  source: {document: spec.source?.title ?? 'TC Electronic M3000 MIDI specification', edition: spec.source?.edition ?? 'V1.01 1999/08/10 (SW 2.03)',
    tablesSha256: sha(sourceBytes), displaySha256: displayBytes ? sha(displayBytes) : null},
  algorithms, tables, system,
}
const text = `// GENERATED by scripts/build-tc-m3000-map.mjs — do not edit by hand.
// Raw identifiers, controller numbers and ranges: TC Electronic M3000 MIDI specification ${data.source.edition}, pp.4–11.
// Display labels/units: manufacturer manuals via docs/instruments/tc-m3000/DISPLAY-MAP.json (${displayBytes ? 'present' : 'absent: raw values only'}).
export interface M3000Display {label:string|null;labelFr:string|null;unit:string|null;scale:{kind:string;[key:string]:unknown};status:string;cite:readonly unknown[]}
export interface M3000Param {id:number;name:string;cc:number|null;min:number;max:number;display:M3000Display|null}
export interface M3000SystemParam {id:number;name:string;cc:number|null;min:number|null;max:number|null;display:M3000Display|null}
export interface M3000Table {key:string;heading:string;algorithmIds:readonly number[];page:number;params:readonly M3000Param[];groups:readonly {name_en:string|null;name_fr:string|null;params:readonly number[];cite:readonly string[]}[]|null}
export interface M3000Algorithm {id:number;name:string;expert:boolean;table:string}
const deepFreeze=<T>(value:T):T=>{if(value&&typeof value==='object'){Object.values(value as object).forEach(deepFreeze);Object.freeze(value)}return value}
export const m3000Map=deepFreeze(${JSON.stringify(data, null, 1)} as {source:{document:string;edition:string;tablesSha256:string;displaySha256:string|null};algorithms:M3000Algorithm[];tables:M3000Table[];system:M3000SystemParam[]})
`
if (process.argv.includes('--check')) {
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
  if (current !== text) { console.error('parameter-map.ts is stale: run node scripts/build-tc-m3000-map.mjs'); process.exit(1) }
  console.log('parameter-map.ts up to date')
} else {
  fs.mkdirSync(path.dirname(target), {recursive: true})
  fs.writeFileSync(target, text)
  console.log(`wrote ${path.relative(root, target)}: ${algorithms.length} algorithms, ${tables.length} tables, ${tables.reduce((n, t) => n + t.params.length, 0)} engine rows, ${system.length} system rows, display ${displayBytes ? 'merged' : 'absent'}`)
}

// Generates src/editors/tc-m3000/m2000-map.ts from docs/instruments/tc-m2000/M2000-PARAMETERS.json (TC Electronic
// M2000 manuals + MIDI CC guide) and docs/instruments/tc-m2000/MAPPING-M2000-M3000.json (candidate correspondences).
// Usage: node scripts/build-tc-m2000-map.mjs [--check]
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
// TC_M2000_DATA / TC_M2000_MAPPING / TC_M2000_TARGET serve test fixtures only; the shipped map always comes from docs/.
const dataPath = process.env.TC_M2000_DATA ?? path.join(root, 'docs/instruments/tc-m2000/M2000-PARAMETERS.json')
const mappingPath = process.env.TC_M2000_MAPPING ?? path.join(root, 'docs/instruments/tc-m2000/MAPPING-M2000-M3000.json')
const m3000Path = path.join(root, 'docs/instruments/tc-m3000/SYSEX-PARAMETERS.json')
const target = process.env.TC_M2000_TARGET ?? path.join(root, 'src/editors/tc-m3000/m2000-map.ts')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const dataBytes = fs.readFileSync(dataPath), data = JSON.parse(dataBytes)
const mappingBytes = fs.existsSync(mappingPath) ? fs.readFileSync(mappingPath) : null, mapping = mappingBytes ? JSON.parse(mappingBytes) : null
const m3000 = JSON.parse(fs.readFileSync(m3000Path))
if (data.schema !== 'tc-m2000-parameters/1') throw Error(`Unexpected schema ${data.schema}`)
const num = v => typeof v === 'number' && Number.isFinite(v)
const decimalsOf = v => { const s = String(v); return s.includes('.') ? s.split('.')[1].length : 0 }
const strings = v => Array.isArray(v) ? v.map(String) : []

// Domain rules: an enumeration with printed labels is a list; a confirmed min/max/step is a step grid; anything
// else is edited as the raw 0–127 controller value. For a raw value, confirmed printed endpoints are kept: M2K-CC
// says "MIDI CC values are scaled to parameter values", so CC 0 and 127 are the printed ends. Values in between are
// shown only for units read linearly (dB, ms, s, %, °), as an explicitly approximate reading; never for Hz.
const LINEAR_UNITS = new Set(['dB', 'ms', 's', '%', 'deg', 'degree'])
function domainOf(p, where) {
  const labels = strings(p.labels)
  if (labels.length) return {kind: 'list', max: labels.length - 1, labels, labelsFr: Array.isArray(p.labels_fr) && p.labels_fr.length === labels.length ? strings(p.labels_fr) : null}
  if (p.status === 'confirmed' && num(p.min) && num(p.max) && num(p.step) && p.step > 0 && p.max > p.min) {
    const count = (p.max - p.min) / p.step, steps = Math.round(count)
    if (Math.abs(count - steps) > 1e-6) throw Error(`${where}: (max-min)/step is not an integer`)
    return {kind: 'steps', max: steps, min: p.min, step: p.step, decimals: Math.max(decimalsOf(p.min), decimalsOf(p.step)), unit: p.unit ?? null}
  }
  const end = v => typeof v === 'string' && v.trim() ? v.trim() : null
  const printed = p.status === 'confirmed' && (num(p.min) || end(p.minLabel)) && (num(p.max) || end(p.maxLabel))
    ? {min: num(p.min) ? p.min : null, max: num(p.max) ? p.max : null, minLabel: end(p.minLabel), maxLabel: end(p.maxLabel), unit: p.unit ?? null,
       interpolate: num(p.min) && num(p.max) && LINEAR_UNITS.has(p.unit), decimals: num(p.min) && num(p.max) ? Math.max(0, Math.ceil(-Math.log10((p.max - p.min) / 127))) : 0}
    : null
  return {kind: 'cc', max: 127, printed}
}
const cite = v => strings(v)
function param(raw, key, cc, where) {
  return {key, label: String(raw.label_en ?? raw.name_en ?? key), labelFr: raw.label_fr ?? null, layer: raw.layer === 'expert' ? 'expert' : 'user', cc, domain: domainOf(raw, where), status: String(raw.status ?? 'unknown'),
    printed: {min: num(raw.min) ? raw.min : null, max: num(raw.max) ? raw.max : null, step: num(raw.step) ? raw.step : null, unit: raw.unit ?? null},
    cite: cite(raw.cite), note: raw.note ?? null}
}
const keyRe = /^[a-z0-9][a-z0-9-]{0,63}$/
const skippedActions = [], documentaryRows = []
const algorithms = data.algorithms.map(a => {
  if (!keyRe.test(a.key)) throw Error(`Bad algorithm key ${a.key}`)
  const params = []
  if (a.mix) params.push(param({label_en: 'Mix', label_fr: 'Mix', ...a.mix}, 'mix', data.cc.engineMix, `${a.key}.mix`))
  if (a.outLevel) params.push(param({label_en: 'Out Level', label_fr: 'Niveau de sortie', ...a.outLevel}, 'out', data.cc.engineOutLevel, `${a.key}.out`))
  for (const p of a.params) {
    if (p.kind === 'action') { skippedActions.push(`${a.key}.${p.key}`); continue }   // e.g. "Expert mode": a command, not a value
    if (!keyRe.test(p.key) || p.key === 'mix' || p.key === 'out') throw Error(`Bad parameter key ${a.key}.${p.key}`)
    const cc = Number.isInteger(p.editIndex) ? data.cc.firstEditParameter + p.editIndex : null
    if (cc !== null && (cc < 12 || cc > 127)) throw Error(`${a.key}.${p.key}: CC ${cc} out of range`)
    params.push(param(p, p.key, cc, `${a.key}.${p.key}`))
  }
  if (new Set(params.map(p => p.key)).size !== params.length) throw Error(`Duplicate parameter key in ${a.key}`)
  const ccs = params.map(p => p.cc).filter(c => c !== null)
  if (new Set(ccs).size !== ccs.length) throw Error(`Duplicate CC in ${a.key}`)
  return {key: a.key, name: String(a.name_en), nameFr: a.name_fr ?? null, category: String(a.category ?? 'other'), manualPages: strings(a.manualPages), expertModeDiffers: a.expertModeDiffers ?? null, params}
})
if (!algorithms.length) throw Error('No M2000 algorithm')
if (new Set(algorithms.map(a => a.key)).size !== algorithms.length) throw Error('Duplicate algorithm key')
const routings = (data.routings ?? []).map(r => ({label: String(r.label_en), labelFr: r.label_fr ?? null, cite: cite(r.cite)}))

// Mapping: only references that exist on both sides survive; anything else is a build error, not a silent drop.
const m3000Tables = m3000.engine_parameter_tables
const m3000Params = type => m3000Tables.find(t => t.algorithm_ids.includes(type))?.rows ?? null
const pairs = (mapping?.pairs ?? []).map(pair => {
  const a = algorithms.find(x => x.key === pair.m2000)
  if (!a) throw Error(`Mapping names unknown M2000 algorithm ${pair.m2000}`)
  const rows = pair.m3000Algorithm === null ? null : m3000Params(pair.m3000Algorithm)
  if (pair.m3000Algorithm !== null && !rows) throw Error(`Mapping names unknown M3000 algorithm ${pair.m3000Algorithm}`)
  const params = (pair.params ?? []).filter(p => {
    const key = p.m2000 === 'outLevel' ? 'out' : p.m2000
    if (a.params.some(q => q.key === key)) return true
    // A row stating that a parameter absent from this algorithm has no counterpart is documentation, not a mapping.
    if (p.m3000Id === null && (p.conversion ?? 'none') === 'none') { documentaryRows.push(`${pair.m2000}.${p.m2000}`); return false }
    throw Error(`Mapping ${pair.m2000}: unknown M2000 parameter ${p.m2000}`)
  }).map(p => {
    const key = p.m2000 === 'outLevel' ? 'out' : p.m2000
    if (p.m3000Id !== null && !rows?.some(r => r.id === p.m3000Id)) throw Error(`Mapping ${pair.m2000}.${p.m2000}: unknown M3000 id ${p.m3000Id}`)
    return {m2000: key, m3000Id: p.m3000Id ?? null, conversion: String(p.conversion ?? 'none'), factor: num(p.factor) ? p.factor : null, offset: num(p.offset) ? p.offset : null,
      listMap: Array.isArray(p.listMap) ? p.listMap.map(([a, b]) => [a, b]) : null, status: String(p.status ?? 'none'), reason: p.reason ?? null}
  })
  return {m2000: pair.m2000, m3000Algorithm: pair.m3000Algorithm ?? null, relation: String(pair.relation ?? 'none'), relationCite: cite(pair.relationCite), params}
})

const out = {
  source: {document: 'TC Electronic M2000 manuals and MIDI CC guide', dataSha256: sha(dataBytes), mappingSha256: mappingBytes ? sha(mappingBytes) : null},
  cc: {engineMix: data.cc.engineMix, engineOutLevel: data.cc.engineOutLevel, firstEditParameter: data.cc.firstEditParameter, scaling: String(data.cc.scaling ?? ''),
    defaultChannels: {engine1: data.cc.defaultChannels?.engine1 ?? null, engine2: data.cc.defaultChannels?.engine2 ?? null, combined: data.cc.defaultChannels?.combined ?? null}},
  routings, routingOrderEvidence: String(data.routingOrderEvidence ?? data.routings?.[0]?.orderEvidence ?? 'not recorded'),
  algorithms, mapping: {pairs},
}
const text = `// GENERATED by scripts/build-tc-m2000-map.mjs — do not edit by hand.
// TC Electronic M2000: algorithms and EDIT-page parameters from the manuals (CC = 12 + position, M2K-CC), and the
// candidate M2000→M3000 correspondences of docs/instruments/tc-m2000/MAPPING-M2000-M3000.json (${mappingBytes ? 'present' : 'absent'}).
export interface M2000Printed {min:number|null;max:number|null;minLabel:string|null;maxLabel:string|null;unit:string|null;interpolate:boolean;decimals:number}
export type M2000Domain={kind:'list';max:number;labels:readonly string[];labelsFr:readonly string[]|null}|{kind:'steps';max:number;min:number;step:number;decimals:number;unit:string|null}|{kind:'cc';max:127;printed:M2000Printed|null}
export interface M2000Param {key:string;label:string;labelFr:string|null;layer:'user'|'expert';cc:number|null;domain:M2000Domain;status:string;printed:{min:number|null;max:number|null;step:number|null;unit:string|null};cite:readonly string[];note:string|null}
export interface M2000Algorithm {key:string;name:string;nameFr:string|null;category:string;manualPages:readonly string[];expertModeDiffers:boolean|null;params:readonly M2000Param[]}
export interface M2000MappingParam {m2000:string;m3000Id:number|null;conversion:string;factor:number|null;offset:number|null;listMap:readonly (readonly [number,number])[]|null;status:string;reason:string|null}
export interface M2000MappingPair {m2000:string;m3000Algorithm:number|null;relation:string;relationCite:readonly string[];params:readonly M2000MappingParam[]}
const deepFreeze=<T>(value:T):T=>{if(value&&typeof value==='object'){Object.values(value as object).forEach(deepFreeze);Object.freeze(value)}return value}
export const m2000Map=deepFreeze(${JSON.stringify(out, null, 1)} as {source:{document:string;dataSha256:string;mappingSha256:string|null};cc:{engineMix:number;engineOutLevel:number;firstEditParameter:number;scaling:string;defaultChannels:{engine1:number|null;engine2:number|null;combined:number|null}};routings:{label:string;labelFr:string|null;cite:string[]}[];routingOrderEvidence:string;algorithms:M2000Algorithm[];mapping:{pairs:M2000MappingPair[]}})
`
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) { console.error('m2000-map.ts is stale: run node scripts/build-tc-m2000-map.mjs'); process.exit(1) }
  console.log('m2000-map.ts up to date')
} else {
  fs.writeFileSync(target, text)
  const params = algorithms.flatMap(a => a.params), kinds = params.reduce((m, p) => (m[p.domain.kind] = (m[p.domain.kind] ?? 0) + 1, m), {})
  console.log(`wrote ${path.relative(root, target)}: ${algorithms.length} algorithms, ${params.length} parameters (${Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(', ')}; ${params.filter(p => p.domain.printed).length} with printed endpoints, ${params.filter(p => p.domain.printed?.interpolate).length} read linearly), ${params.filter(p => p.cc === null).length} without CC, ${routings.length} routings, ${pairs.length} mapping pairs; skipped ${skippedActions.length} action line(s) [${skippedActions.join(', ')}] and ${documentaryRows.length} documentary mapping row(s) for absent parameters`)
}

// Generated from src/editor-modules.json. Run npm run modules:generate; do not edit.
import type {EditorModule} from './contracts'
import {m3000Module as entry0} from '../editors/tc-m3000/module'
export const generatedModules:readonly EditorModule[]=Object.freeze([entry0])
const declaredIds=["tc-electronic-m3000-editor"]
if(generatedModules.some((entry,index)=>entry?.manifest.id!==declaredIds[index]))throw Error('Editor declaration/export mismatch')

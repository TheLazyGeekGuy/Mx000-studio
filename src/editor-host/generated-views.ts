// Generated from src/editor-modules.json. Run npm run modules:generate; do not edit.
import type {EditorViewRegistration} from './view-contract'
import {m3000View as entry0} from '../editors/tc-m3000/registration'
export const generatedViews:readonly EditorViewRegistration[]=Object.freeze([entry0])
const declaredIds=["tc-electronic-m3000-editor"]
if(generatedViews.some((entry,index)=>entry?.moduleId!==declaredIds[index]))throw Error('Editor declaration/export mismatch')

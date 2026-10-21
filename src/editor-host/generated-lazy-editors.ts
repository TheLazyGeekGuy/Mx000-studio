// Generated from editor-modules.json and editor-catalog.json; do not edit.
import type {LazyEditorDefinition} from './lazy-installation'
export const generatedLazyEditors:readonly LazyEditorDefinition[]=[
{...{"manifest":{"id":"tc-electronic-m3000-editor","modelId":"tc-electronic-m3000","name":"M3000 / M2000 Editor","version":"0.2.0","sdkVersion":1,"stateSchemaVersion":2,"capabilities":["parameter-sysex","offline-editing","sysex-file-import","sysex-file-export","device-selector","cc-file-export"]},"presentation":{"manufacturer":"M3000 / M2000","model":"Editor","preview":{"src":"/editor-previews/tc-electronic-m3000.svg","width":2048,"height":254,"kind":"reference-aligned"}}},load:async()=>{const entries=await Promise.all([import("../editors/tc-m3000/module"),import("../editors/tc-m3000/registration")]);return {module:entries[0].m3000Module,view:entries[1].m3000View}}}
]

// TC M-series editor workspace: one independent sub-workspace per device, selected by the device slider.
// Switching device never converts or drops data; conversion is a separate, explicit and reported action.
import {defaultState,validateState as validateM3000State,type M3000State} from './model'
import {defaultM2000State,validateM2000State,type M2000State} from './m2000-model'

export type DeviceId='m3000'|'m2000'
export const DEVICES:readonly DeviceId[]=['m3000','m2000']
export interface TcWorkspace {format:'tc-m-series-workspace';version:2;device:DeviceId;m3000:M3000State;m2000:M2000State}

export const defaultWorkspace=():TcWorkspace=>({format:'tc-m-series-workspace',version:2,device:'m3000',m3000:defaultState(),m2000:defaultM2000State()})
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)

/** Accepts the current workspace and the M3000-only workspace of module 0.1.0 (kept readable: it becomes the M3000
 * part of a new workspace, the M2000 part starting from local defaults). */
export function validateWorkspace(value:unknown):TcWorkspace{
 if(isRecord(value)&&value.format==='tc-m3000-workspace')return {...defaultWorkspace(),m3000:validateM3000State(value)}
 if(!isRecord(value)||value.format!=='tc-m-series-workspace')throw Error('Espace TC M-series invalide')
 if(value.version!==2)throw Error('Version d’espace TC M-series non prise en charge')
 if(!DEVICES.includes(value.device as DeviceId))throw Error('Appareil inconnu')
 return {format:'tc-m-series-workspace',version:2,device:value.device as DeviceId,m3000:validateM3000State(value.m3000),m2000:validateM2000State(value.m2000)}
}

/** Replaces the part named by a sub-workspace file, or the whole workspace. */
export function replaceIn(current:TcWorkspace,value:unknown):TcWorkspace{
 if(isRecord(value)&&value.format==='tc-m3000-workspace')return {...current,m3000:validateM3000State(value)}
 if(isRecord(value)&&value.format==='tc-m2000-workspace')return {...current,m2000:validateM2000State(value)}
 return validateWorkspace(value)
}

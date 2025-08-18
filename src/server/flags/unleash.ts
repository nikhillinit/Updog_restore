import { gate as envGate } from './gate';
export function initUnleash(){ /* wire provider when available */ }
export function flag(name:string, context?:Record<string,any>, fallback=false){
  return envGate(name, fallback);
}

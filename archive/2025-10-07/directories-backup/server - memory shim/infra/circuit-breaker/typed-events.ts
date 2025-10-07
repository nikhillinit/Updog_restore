import { EventEmitter } from 'events';
import type { StateChangeEvent } from './types';

export interface CircuitEvents {
  stateChange: (e: StateChangeEvent) => void;
  probeDenied: (info: { rateLimited: boolean; concurrencyLimited: boolean; timestamp: number }) => void;
  circuitOpen: (info: { timestamp: number }) => void;
}

export class TypedEmitter<T extends Record<string, (...args: any[]) => void>> {
  private emitter = new EventEmitter();
  on<E extends keyof T>(event: E, listener: T[E]) {
    this.emitter.on(event as string, listener as any);
  }
  emit<E extends keyof T>(event: E, ...args: Parameters<T[E]>) {
    this.emitter.emit(event as string, ...args);
  }
}

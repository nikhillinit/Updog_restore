/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
export * from '../utils/async-iteration';
export * from './type-guards';
export * from './validation-helpers';
export * from './ts/spreadIfDefined';

// Simple API client
export const api = {
  async get<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json() as unknown as T;
  },

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response.json() as unknown as T;
  }
};


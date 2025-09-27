import React from 'react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';

export function withWouter(ui: React.ReactNode, initial = '/fund-setup?step=2') {
  const loc = memoryLocation(initial);
  return <Router hook={loc}>{ui}</Router>;
}
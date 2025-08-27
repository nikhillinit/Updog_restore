/**
 * BMAD Metrics Collection and ROI Reporting
 * Tracks agent performance and generates weekly reports
 */

import * as client from 'prom-client';
import express from 'express';
import { BMAD_CONFIG } from './bmad-config.js';
import { router } from './bmad-router.js';
import fs from 'fs/promises';
import path from 'path';

// Create dedicated registry for BMAD metrics
const bmadRegistry = new client.Registry();

// Define metrics
const metrics = {
  // Repair metrics
  repairPRCreated: new client.Counter({
    name: 'bmad_repair_pr_created_total',
    help: 'Total repair PRs created by BMAD',
    labelNames: ['agent', 'issue_type'],
    registers: [bmadRegistry]
  }),
  
  repairPRMerged: new client.Counter({
    name: 'bmad_repair_pr_merged_total',
    help: 'Total repair PRs merged',
    labelNames: ['agent', 'issue_type'],
    registers: [bmadRegistry]
  })
};

// Time estimates for different repair types (in seconds)
const TIME_ESTIMATES = {
  syntax: 300,        // 5 minutes
  typescript: 600,    // 10 minutes
  assertion: 450,     // 7.5 minutes
  integration: 900,   // 15 minutes
  e2e: 1200,         // 20 minutes
  unknown: 600       // 10 minutes default
};

export function recordRepair(repair) {
  const { agent, issueType, prCreated, prMerged } = repair;
  
  if (prCreated) {
    metrics.repairPRCreated.labels(agent, issueType).inc();
  }
  
  if (prMerged) {
    metrics.repairPRMerged.labels(agent, issueType).inc();
  }
}

export default { recordRepair };

import { Router } from 'express';
import { errorBudgetManager } from '../lib/error-budget';
import type { Request, Response } from '../types/request-response';

const router = Router();

// Get overall error budget status
router['get']('/', async (_req: Request, res: Response) => {
  try {
    const report = await errorBudgetManager.generateReport();
    res.json(report);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to generate error budget report',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific SLO error budget
router['get']('/:slo', async (req: Request, res: Response) => {
  try {
    const { slo } = req.params;
    if (!slo) {
      return res.status(400).json({ error: 'SLO parameter is required' });
    }
    const budget = await errorBudgetManager.calculateErrorBudget(slo);
    res.json(budget);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unknown SLO')) {
      res.status(404).json({ error: error.message });
    } else {
      res.status(500).json({ 
        error: 'Failed to calculate error budget',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
});

// Check deployment gate status
router['get']('/gate/status', async (_req: Request, res: Response) => {
  try {
    const gate = await errorBudgetManager.checkDeploymentGate();
    res.json(gate);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to check deployment gate',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get SLO configurations
router['get']('/config/slos', (_req: Request, res: Response) => {
  const slos = errorBudgetManager.getSLOs();
  res.json(slos);
});

// Add new SLO (protected endpoint)
router.post('/config/slos', (req: Request, res: Response) => {
  try {
    const { name, target, window, alertThreshold } = req.body;
    
    if (!name || typeof target !== 'number' || !window || typeof alertThreshold !== 'number') {
      return res.status(400).json({
        error: 'Invalid SLO configuration',
        required: ['name', 'target', 'window', 'alertThreshold']
      });
    }
    
    if (target <= 0 || target >= 1) {
      return res.status(400).json({
        error: 'Target must be between 0 and 1 (exclusive)'
      });
    }
    
    if (alertThreshold <= 0 || alertThreshold >= 1) {
      return res.status(400).json({
        error: 'Alert threshold must be between 0 and 1 (exclusive)'
      });
    }
    
    errorBudgetManager.addSLO({ name, target, window, alertThreshold });
    res.status(201).json({ message: 'SLO configuration added successfully' });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to add SLO configuration',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
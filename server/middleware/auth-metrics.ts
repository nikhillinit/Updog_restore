/**
 * Authentication middleware for metrics endpoint
 */
import type { Request, Response, NextFunction } from 'express';

export function authenticateMetrics(req: Request, res: Response, next: NextFunction) {
  // Option 1: Bearer token authentication
  const authHeader = req.headers.authorization;
  const metricsKey = process.env.METRICS_KEY;
  
  if (metricsKey && authHeader && typeof authHeader === 'string') {
    const [type, token] = authHeader.split(' ');
    if (type === 'Bearer' && token === metricsKey) {
      return next();
    }
  }
  
  // Option 2: IP allowlist for internal monitoring
  const allowedIPs = (process.env.METRICS_ALLOWED_IPS || '').split(',').filter(Boolean);
  const clientIP = req.ip || req.socket.remoteAddress || '';
  
  if (allowedIPs.length > 0) {
    // Check if client IP is in allowlist
    const isAllowed = allowedIPs.some(allowed => {
      // Handle both direct IPs and CIDR ranges
      return clientIP === allowed || 
             clientIP === `::ffff:${allowed}` ||
             (clientIP === '127.0.0.1' && allowed === 'localhost');
    });
    
    if (isAllowed) {
      return next();
    }
  }
  
  // Option 3: Allow localhost in development
  if (process.env.NODE_ENV === 'development' && 
      (clientIP === '127.0.0.1' || clientIP === '::1' || clientIP === '::ffff:127.0.0.1')) {
    return next();
  }
  
  // Reject unauthorized access
  res.status(403).json({ 
    error: 'Forbidden',
    message: 'Metrics access requires authentication'
  });
}
// Replit Deployment Configuration
module.exports = {
  // Build configuration
  build: {
    command: 'npm run build',
    outputDir: 'dist',
    env: {
      NODE_ENV: 'production'
    }
  },

  // Runtime configuration
  runtime: {
    startCommand: 'npm start',
    port: process.env.PORT || 5000,
    healthCheck: '/api/funds',
    autoRestart: true
  },

  // Database configuration
  database: {
    type: 'postgresql',
    url: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production'
  },

  // GitHub integration
  github: {
    repository: 'nikhillinit/UpDawg',
    branch: 'main',
    autoSync: true,
    deployOnPush: true
  },

  // Environment variables
  env: {
    required: ['DATABASE_URL'],
    optional: ['NODE_ENV', 'PORT']
  },

  // Performance monitoring
  monitoring: {
    enabled: true,
    metrics: ['response_time', 'memory_usage', 'database_connections'],
    alerts: {
      responseTime: 5000, // ms
      memoryUsage: 80, // percentage
      errorRate: 5 // percentage
    }
  },

  // Security configuration
  security: {
    cors: {
      origin: true,
      credentials: true
    },
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff'
    }
  }
};
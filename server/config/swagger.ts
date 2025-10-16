import swaggerJSDoc, { Options } from 'swagger-jsdoc';

export const swaggerOptions: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'POVC Fund Platform API',
      version: '1.3.2',
      description: `
        A venture-capital fund modeling and reporting platform API.
        
        This API provides endpoints for:
        - Reserve calculations and allocations
        - Portfolio construction modeling
        - Monte Carlo simulations
        - Strategic scenario planning
        
        Built with Express.js, TypeScript, and PostgreSQL.
      `,
      contact: {
        name: 'POVC Engineering Team',
        url: 'https://github.com/nikhillinit/Updog_restore'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: 'https://api.povc.fund',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error type identifier'
            },
            message: {
              type: 'string',
              description: 'Human-readable error message'
            },
            rid: {
              type: 'string',
              format: 'uuid',
              description: 'Request ID for tracing'
            }
          },
          required: ['error']
        },
        ValidationError: {
          allOf: [
            { $ref: '#/components/schemas/Error' },
            {
              type: 'object',
              properties: {
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      path: { type: 'array', items: { type: 'string' } },
                      message: { type: 'string' },
                      code: { type: 'string' }
                    }
                  }
                }
              }
            }
          ]
        },
        ReserveInput: {
          type: 'object',
          properties: {
            totalReserve: {
              type: 'number',
              minimum: 0,
              description: 'Total reserve amount to allocate'
            },
            allocations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    description: 'Allocation category'
                  },
                  amount: {
                    type: 'number',
                    minimum: 0,
                    description: 'Amount to allocate'
                  },
                  priority: {
                    type: 'integer',
                    minimum: 1,
                    description: 'Allocation priority (1 = highest)'
                  }
                },
                required: ['category', 'amount', 'priority']
              }
            }
          },
          required: ['totalReserve', 'allocations']
        },
        ReserveOutput: {
          type: 'object',
          properties: {
            allocations: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  allocated: { type: 'number' },
                  requested: { type: 'number' }
                }
              }
            },
            totalAllocated: {
              type: 'number',
              description: 'Total amount allocated'
            },
            remaining: {
              type: 'number',
              description: 'Remaining unallocated reserve'
            },
            rid: {
              type: 'string',
              format: 'uuid',
              description: 'Request ID for tracing'
            }
          },
          required: ['allocations', 'totalAllocated', 'remaining', 'rid']
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './server/routes/**/*.ts',  // Include route files
    './server/app.ts'           // Include main app file
  ]
};

export const swaggerSpec = swaggerJSDoc(swaggerOptions);
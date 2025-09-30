/**
 * Notion Integration Schema
 * Comprehensive data models for Notion workspace integration
 */

import { z } from 'zod';

// =============================================================================
// NOTION API TYPES
// =============================================================================

export const NotionRichTextSchema = z.object({
  type: z.enum(['text', 'mention', 'equation']),
  text: z.object({
    content: z.string(),
    link: z.object({ url: z.string() }).optional()
  }).optional(),
  annotations: z.object({
    bold: z.boolean(),
    italic: z.boolean(),
    strikethrough: z.boolean(),
    underline: z.boolean(),
    code: z.boolean(),
    color: z.string()
  }),
  plain_text: z.string(),
  href: z.string().optional()
});

export const NotionPropertySchema = z.object({
  id: z.string(),
  type: z.enum([
    'title', 'rich_text', 'number', 'select', 'multi_select',
    'date', 'checkbox', 'url', 'email', 'phone_number',
    'relation', 'rollup', 'people', 'files', 'formula', 'status'
  ]),
  title: z.array(NotionRichTextSchema).optional(),
  rich_text: z.array(NotionRichTextSchema).optional(),
  number: z.number().optional(),
  select: z.object({
    id: z.string(),
    name: z.string(),
    color: z.string()
  }).optional(),
  multi_select: z.array(z.object({
    id: z.string(),
    name: z.string(),
    color: z.string()
  })).optional(),
  date: z.object({
    start: z.string(),
    end: z.string().optional(),
    time_zone: z.string().optional()
  }).optional(),
  checkbox: z.boolean().optional(),
  url: z.string().optional(),
  email: z.string().optional(),
  phone_number: z.string().optional()
});

export const NotionPageSchema = z.object({
  object: z.literal('page'),
  id: z.string(),
  created_time: z.string(),
  created_by: z.object({ id: z.string() }),
  last_edited_time: z.string(),
  last_edited_by: z.object({ id: z.string() }),
  cover: z.object({
    type: z.enum(['external', 'file']),
    external: z.object({ url: z.string() }).optional(),
    file: z.object({ url: z.string(), expiry_time: z.string() }).optional()
  }).optional(),
  icon: z.object({
    type: z.enum(['emoji', 'external', 'file']),
    emoji: z.string().optional(),
    external: z.object({ url: z.string() }).optional(),
    file: z.object({ url: z.string(), expiry_time: z.string() }).optional()
  }).optional(),
  parent: z.object({
    type: z.enum(['database_id', 'page_id', 'workspace']),
    database_id: z.string().optional(),
    page_id: z.string().optional()
  }),
  archived: z.boolean(),
  properties: z.record(NotionPropertySchema),
  url: z.string(),
  public_url: z.string().optional()
});

export const NotionDatabaseSchema = z.object({
  object: z.literal('database'),
  id: z.string(),
  created_time: z.string(),
  created_by: z.object({ id: z.string() }),
  last_edited_time: z.string(),
  last_edited_by: z.object({ id: z.string() }),
  title: z.array(NotionRichTextSchema),
  description: z.array(NotionRichTextSchema),
  icon: z.object({
    type: z.enum(['emoji', 'external', 'file']),
    emoji: z.string().optional()
  }).optional(),
  cover: z.object({
    type: z.enum(['external', 'file']),
    external: z.object({ url: z.string() }).optional()
  }).optional(),
  properties: z.record(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    // Type-specific properties would be added here
  })),
  parent: z.object({
    type: z.literal('workspace')
  }),
  archived: z.boolean(),
  is_inline: z.boolean(),
  public_url: z.string().optional(),
  url: z.string()
});

// =============================================================================
// INTEGRATION CONFIGURATION
// =============================================================================

export const NotionWorkspaceConnectionSchema = z.object({
  id: z.string().uuid(),
  fundId: z.string(),
  workspaceId: z.string(),
  workspaceName: z.string(),
  accessToken: z.string(), // Encrypted in storage
  botId: z.string(),
  owner: z.object({
    type: z.enum(['user', 'workspace']),
    user: z.object({
      id: z.string(),
      name: z.string(),
      avatar_url: z.string().optional(),
      type: z.enum(['person', 'bot']),
      person: z.object({
        email: z.string()
      }).optional()
    }).optional()
  }),
  capabilities: z.object({
    read_content: z.boolean(),
    update_content: z.boolean(),
    insert_content: z.boolean(),
    read_user_with_email: z.boolean(),
    read_user_without_email: z.boolean()
  }),
  status: z.enum(['active', 'revoked', 'expired', 'error']),
  lastSyncAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const NotionDatabaseMappingSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  notionDatabaseId: z.string(),
  databaseName: z.string(),
  mappingType: z.enum([
    'portfolio_companies',
    'investments',
    'deal_memos',
    'board_reports',
    'kpi_tracking',
    'team_notes',
    'action_items',
    'due_diligence',
    'fund_updates',
    'lp_communications'
  ]),
  fieldMappings: z.record(z.object({
    notionProperty: z.string(),
    systemField: z.string(),
    dataType: z.enum(['string', 'number', 'date', 'boolean', 'array', 'object']),
    required: z.boolean(),
    transform: z.enum(['none', 'currency', 'percentage', 'date_format', 'extract_number']).optional()
  })),
  syncSettings: z.object({
    enabled: z.boolean(),
    direction: z.enum(['pull_only', 'push_only', 'bidirectional']),
    frequency: z.enum(['real_time', 'hourly', 'daily', 'weekly', 'manual']),
    lastSyncAt: z.date().optional(),
    nextSyncAt: z.date().optional()
  }),
  filters: z.object({
    status: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.date().optional(),
      end: z.date().optional()
    }).optional(),
    customFilters: z.record(z.any()).optional()
  }).optional(),
  createdAt: z.date(),
  updatedAt: z.date()
});

export const NotionSyncJobSchema = z.object({
  id: z.string().uuid(),
  connectionId: z.string().uuid(),
  mappingId: z.string().uuid().optional(),
  type: z.enum(['full_sync', 'incremental_sync', 'single_page', 'webhook_trigger']),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  direction: z.enum(['pull', 'push', 'bidirectional']),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  progress: z.object({
    total: z.number(),
    processed: z.number(),
    success: z.number(),
    failed: z.number(),
    skipped: z.number()
  }),
  result: z.object({
    recordsCreated: z.number(),
    recordsUpdated: z.number(),
    recordsDeleted: z.number(),
    errors: z.array(z.object({
      type: z.string(),
      message: z.string(),
      notionPageId: z.string().optional(),
      systemRecordId: z.string().optional()
    }))
  }).optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.date()
});

// =============================================================================
// PORTFOLIO COMPANY INTEGRATION
// =============================================================================

export const PortfolioCompanyNotionConfigSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string(),
  companyName: z.string(),
  notionWorkspaceId: z.string().optional(),
  integrationStatus: z.enum(['not_connected', 'pending_approval', 'connected', 'error']),
  sharedDatabases: z.array(z.object({
    databaseId: z.string(),
    databaseName: z.string(),
    purpose: z.enum([
      'board_reports',
      'kpi_metrics',
      'financial_data',
      'product_updates',
      'hiring_updates',
      'fundraising_updates'
    ]),
    accessLevel: z.enum(['read_only', 'comment_only', 'edit']),
    lastUpdated: z.date().optional()
  })),
  automationRules: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    trigger: z.enum(['new_page', 'page_updated', 'property_changed', 'scheduled']),
    condition: z.object({
      database: z.string().optional(),
      property: z.string().optional(),
      value: z.any().optional()
    }).optional(),
    action: z.enum([
      'create_investment_update',
      'update_kpi_metrics',
      'send_notification',
      'create_board_deck_item',
      'update_valuation'
    ]),
    actionConfig: z.record(z.any()),
    enabled: z.boolean()
  })),
  communicationSettings: z.object({
    allowNotifications: z.boolean(),
    notificationChannels: z.array(z.enum(['email', 'slack', 'in_app'])),
    reportingSchedule: z.enum(['weekly', 'monthly', 'quarterly']).optional()
  }),
  createdAt: z.date(),
  updatedAt: z.date()
});

// =============================================================================
// EXTRACTED DATA MODELS
// =============================================================================

export const NotionExtractedContentSchema = z.object({
  id: z.string().uuid(),
  sourcePageId: z.string(),
  sourcePageUrl: z.string(),
  contentType: z.enum([
    'deal_memo',
    'board_report',
    'kpi_update',
    'financial_report',
    'team_update',
    'product_milestone',
    'market_analysis',
    'competitive_intel'
  ]),
  extractedData: z.object({
    title: z.string(),
    summary: z.string().optional(),
    keyMetrics: z.record(z.union([z.string(), z.number()])).optional(),
    actionItems: z.array(z.object({
      description: z.string(),
      assignee: z.string().optional(),
      dueDate: z.date().optional(),
      status: z.enum(['open', 'in_progress', 'completed'])
    })).optional(),
    attachments: z.array(z.object({
      name: z.string(),
      url: z.string(),
      type: z.string()
    })).optional(),
    tags: z.array(z.string()).optional()
  }),
  confidence: z.number().min(0).max(1),
  lastProcessedAt: z.date(),
  createdAt: z.date()
});

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type NotionRichText = z.infer<typeof NotionRichTextSchema>;
export type NotionProperty = z.infer<typeof NotionPropertySchema>;
export type NotionPage = z.infer<typeof NotionPageSchema>;
export type NotionDatabase = z.infer<typeof NotionDatabaseSchema>;
export type NotionWorkspaceConnection = z.infer<typeof NotionWorkspaceConnectionSchema>;
export type NotionDatabaseMapping = z.infer<typeof NotionDatabaseMappingSchema>;
export type NotionSyncJob = z.infer<typeof NotionSyncJobSchema>;
export type PortfolioCompanyNotionConfig = z.infer<typeof PortfolioCompanyNotionConfigSchema>;
export type NotionExtractedContent = z.infer<typeof NotionExtractedContentSchema>;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

export const createNotionConnection = (input: Partial<NotionWorkspaceConnection>): NotionWorkspaceConnection => {
  const now = new Date();
  return NotionWorkspaceConnectionSchema.parse({
    ...input,
    id: input.id || crypto.randomUUID(),
    status: input.status || 'active',
    createdAt: now,
    updatedAt: now
  });
};

export const createDatabaseMapping = (input: Partial<NotionDatabaseMapping>): NotionDatabaseMapping => {
  const now = new Date();
  return NotionDatabaseMappingSchema.parse({
    ...input,
    id: input.id || crypto.randomUUID(),
    fieldMappings: input.fieldMappings || {},
    syncSettings: {
      enabled: true,
      direction: 'pull_only',
      frequency: 'daily',
      ...input.syncSettings
    },
    createdAt: now,
    updatedAt: now
  });
};

export const extractPlainText = (richText: NotionRichText[]): string => {
  return richText.map(rt => rt.plain_text).join('');
};

export const parseNotionNumber = (property: NotionProperty): number | null => {
  return property.number || null;
};

export const parseNotionDate = (property: NotionProperty): Date | null => {
  if (property.date?.start) {
    return new Date(property.date.start);
  }
  return null;
};

export const parseNotionSelect = (property: NotionProperty): string | null => {
  return property.select?.name || null;
};

export const parseNotionMultiSelect = (property: NotionProperty): string[] => {
  return property.multi_select?.map(s => s.name) || [];
};
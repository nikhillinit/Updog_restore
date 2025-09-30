/**
 * Notion Integration Service
 * Handles all Notion API interactions, data synchronization, and content extraction
 */

import { Client } from '@notionhq/client';
import { APIResponseError } from '@notionhq/client';
import crypto from 'crypto';
import {
  NotionWorkspaceConnection,
  NotionDatabaseMapping,
  NotionSyncJob,
  NotionPage,
  NotionDatabase,
  NotionExtractedContent,
  PortfolioCompanyNotionConfig,
  extractPlainText,
  parseNotionNumber,
  parseNotionDate,
  parseNotionSelect,
  parseNotionMultiSelect
} from '@shared/notion-schema';

// =============================================================================
// NOTION API SERVICE
// =============================================================================

export class NotionService {
  private clients: Map<string, Client> = new Map();
  private rateLimiter: Map<string, { lastRequest: number; requestCount: number }> = new Map();

  /**
   * Initialize Notion client for a specific workspace connection
   */
  private getClient(connection: NotionWorkspaceConnection): Client {
    const cacheKey = connection.id;

    if (!this.clients.has(cacheKey)) {
      const client = new Client({
        auth: this.decryptToken(connection.accessToken),
        notionVersion: '2022-06-28'
      });
      this.clients.set(cacheKey, client);
    }

    return this.clients.get(cacheKey)!;
  }

  /**
   * Rate limiting to respect Notion's 3 requests/second limit
   */
  private async enforceRateLimit(connectionId: string): Promise<void> {
    const now = Date.now();
    const rateLimitData = this.rateLimiter.get(connectionId) || { lastRequest: 0, requestCount: 0 };

    // Reset count if more than 1 second has passed
    if (now - rateLimitData.lastRequest >= 1000) {
      rateLimitData.requestCount = 0;
      rateLimitData.lastRequest = now;
    }

    // If we've made 3 requests in the current second, wait
    if (rateLimitData.requestCount >= 3) {
      const waitTime = 1000 - (now - rateLimitData.lastRequest);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      rateLimitData.requestCount = 0;
      rateLimitData.lastRequest = Date.now();
    }

    rateLimitData.requestCount++;
    this.rateLimiter.set(connectionId, rateLimitData);
  }

  // =============================================================================
  // AUTHENTICATION & CONNECTION MANAGEMENT
  // =============================================================================

  /**
   * Handle OAuth callback and create workspace connection
   */
  async handleOAuthCallback(
    code: string,
    fundId: string
  ): Promise<NotionWorkspaceConnection> {
    try {
      const auth = Buffer.from(
        `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
      ).toString('base64');

      const response = await fetch('https://api.notion.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.NOTION_REDIRECT_URI
        })
      });

      const tokenData = await response.json();

      if (!response.ok) {
        throw new Error(`OAuth error: ${tokenData.error_description}`);
      }

      // Create workspace connection
      const connection: NotionWorkspaceConnection = {
        id: crypto.randomUUID(),
        fundId,
        workspaceId: tokenData.workspace_id,
        workspaceName: tokenData.workspace_name || 'Unknown Workspace',
        accessToken: this.encryptToken(tokenData.access_token),
        botId: tokenData.bot_id,
        owner: tokenData.owner,
        capabilities: {
          read_content: true,
          update_content: tokenData.owner.type === 'workspace',
          insert_content: tokenData.owner.type === 'workspace',
          read_user_with_email: true,
          read_user_without_email: true
        },
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // TODO: Save to database
      await this.saveConnection(connection);

      return connection;
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  /**
   * Test connection and validate permissions
   */
  async validateConnection(connection: NotionWorkspaceConnection): Promise<{
    valid: boolean;
    capabilities: string[];
    errors: string[];
  }> {
    try {
      const client = this.getClient(connection);
      await this.enforceRateLimit(connection.id);

      const response = await client.users.me({});

      return {
        valid: true,
        capabilities: Object.keys(connection.capabilities).filter(
          key => connection.capabilities[key as keyof typeof connection.capabilities]
        ),
        errors: []
      };
    } catch (error) {
      const errorMessage = error instanceof APIResponseError
        ? `${error.status}: ${error.message}`
        : 'Unknown connection error';

      return {
        valid: false,
        capabilities: [],
        errors: [errorMessage]
      };
    }
  }

  // =============================================================================
  // DATABASE DISCOVERY & MAPPING
  // =============================================================================

  /**
   * Discover all accessible databases in a workspace
   */
  async discoverDatabases(connection: NotionWorkspaceConnection): Promise<NotionDatabase[]> {
    const client = this.getClient(connection);
    const databases: NotionDatabase[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    try {
      while (hasMore) {
        await this.enforceRateLimit(connection.id);

        const response = await client.search({
          filter: { property: 'object', value: 'database' },
          start_cursor: nextCursor,
          page_size: 100
        });

        databases.push(...response.results as NotionDatabase[]);
        hasMore = response.has_more;
        nextCursor = response.next_cursor || undefined;
      }

      return databases;
    } catch (error) {
      console.error('Database discovery error:', error);
      throw error;
    }
  }

  /**
   * Analyze database structure and suggest field mappings
   */
  async analyzeDatabaseStructure(
    connection: NotionWorkspaceConnection,
    databaseId: string
  ): Promise<{
    properties: Record<string, any>;
    suggestedMappings: Record<string, string>;
    dataTypes: Record<string, string>;
  }> {
    const client = this.getClient(connection);

    try {
      await this.enforceRateLimit(connection.id);

      const database = await client.databases.retrieve({ database_id: databaseId });
      const properties = database.properties;

      // Suggest mappings based on property names and types
      const suggestedMappings: Record<string, string> = {};
      const dataTypes: Record<string, string> = {};

      Object.entries(properties).forEach(([name, property]) => {
        const lowerName = name.toLowerCase();
        dataTypes[name] = property.type;

        // Mapping suggestions based on common field names
        if (lowerName.includes('company') || lowerName.includes('name')) {
          suggestedMappings[name] = 'company_name';
        } else if (lowerName.includes('valuation')) {
          suggestedMappings[name] = 'valuation';
        } else if (lowerName.includes('revenue') || lowerName.includes('arr')) {
          suggestedMappings[name] = 'revenue';
        } else if (lowerName.includes('stage') || lowerName.includes('round')) {
          suggestedMappings[name] = 'investment_stage';
        } else if (lowerName.includes('date') || lowerName.includes('time')) {
          suggestedMappings[name] = 'last_updated';
        } else if (lowerName.includes('status')) {
          suggestedMappings[name] = 'status';
        }
      });

      return {
        properties,
        suggestedMappings,
        dataTypes
      };
    } catch (error) {
      console.error('Database analysis error:', error);
      throw error;
    }
  }

  // =============================================================================
  // DATA SYNCHRONIZATION
  // =============================================================================

  /**
   * Perform full database sync
   */
  async performFullSync(
    connection: NotionWorkspaceConnection,
    mapping: NotionDatabaseMapping
  ): Promise<NotionSyncJob> {
    const job: NotionSyncJob = {
      id: crypto.randomUUID(),
      connectionId: connection.id,
      mappingId: mapping.id,
      type: 'full_sync',
      status: 'queued',
      direction: mapping.syncSettings.direction === 'bidirectional' ? 'pull' : mapping.syncSettings.direction.replace('_only', '') as any,
      progress: {
        total: 0,
        processed: 0,
        success: 0,
        failed: 0,
        skipped: 0
      },
      createdAt: new Date()
    };

    try {
      job.status = 'running';
      job.startedAt = new Date();

      const pages = await this.fetchAllPages(connection, mapping.notionDatabaseId);
      job.progress.total = pages.length;

      const extractedData: any[] = [];
      const errors: any[] = [];

      for (const page of pages) {
        try {
          await this.enforceRateLimit(connection.id);

          const extracted = await this.extractDataFromPage(page, mapping);
          if (extracted) {
            extractedData.push(extracted);
            job.progress.success++;
          } else {
            job.progress.skipped++;
          }
        } catch (error) {
          errors.push({
            type: 'extraction_error',
            message: error instanceof Error ? error.message : 'Unknown error',
            notionPageId: page.id
          });
          job.progress.failed++;
        }

        job.progress.processed++;
      }

      // Process extracted data based on mapping type
      const processResult = await this.processExtractedData(extractedData, mapping);

      job.status = 'completed';
      job.completedAt = new Date();
      job.result = {
        recordsCreated: processResult.created,
        recordsUpdated: processResult.updated,
        recordsDeleted: 0,
        errors
      };

      await this.saveSyncJob(job);
      return job;

    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.result = {
        recordsCreated: 0,
        recordsUpdated: 0,
        recordsDeleted: 0,
        errors: [{
          type: 'sync_error',
          message: error instanceof Error ? error.message : 'Unknown sync error'
        }]
      };

      await this.saveSyncJob(job);
      throw error;
    }
  }

  /**
   * Fetch all pages from a Notion database
   */
  private async fetchAllPages(
    connection: NotionWorkspaceConnection,
    databaseId: string
  ): Promise<NotionPage[]> {
    const client = this.getClient(connection);
    const pages: NotionPage[] = [];
    let hasMore = true;
    let nextCursor: string | undefined;

    while (hasMore) {
      await this.enforceRateLimit(connection.id);

      const response = await client.databases.query({
        database_id: databaseId,
        start_cursor: nextCursor,
        page_size: 100
      });

      pages.push(...response.results as NotionPage[]);
      hasMore = response.has_more;
      nextCursor = response.next_cursor || undefined;
    }

    return pages;
  }

  /**
   * Extract structured data from a Notion page based on mapping configuration
   */
  private async extractDataFromPage(
    page: NotionPage,
    mapping: NotionDatabaseMapping
  ): Promise<any | null> {
    const extracted: any = {
      notionPageId: page.id,
      notionUrl: page.url,
      lastModified: new Date(page.last_edited_time),
      createdAt: new Date(page.created_time)
    };

    // Extract mapped properties
    Object.entries(mapping.fieldMappings).forEach(([systemField, mappingConfig]) => {
      const notionProperty = page.properties[mappingConfig.notionProperty];
      if (!notionProperty) return;

      let value: any = null;

      switch (notionProperty.type) {
        case 'title':
        case 'rich_text':
          value = extractPlainText(notionProperty[notionProperty.type] || []);
          break;
        case 'number':
          value = parseNotionNumber(notionProperty);
          if (mappingConfig.transform === 'currency' && value) {
            value = Math.round(value * 100) / 100; // Round to 2 decimal places
          } else if (mappingConfig.transform === 'percentage' && value) {
            value = value / 100;
          }
          break;
        case 'date':
          value = parseNotionDate(notionProperty);
          break;
        case 'select':
          value = parseNotionSelect(notionProperty);
          break;
        case 'multi_select':
          value = parseNotionMultiSelect(notionProperty);
          break;
        case 'checkbox':
          value = notionProperty.checkbox;
          break;
        case 'url':
        case 'email':
        case 'phone_number':
          value = notionProperty[notionProperty.type];
          break;
      }

      if (value !== null) {
        extracted[systemField] = value;
      }
    });

    // Skip if required fields are missing
    const requiredFields = Object.entries(mapping.fieldMappings)
      .filter(([_, config]) => config.required)
      .map(([systemField]) => systemField);

    const hasAllRequired = requiredFields.every(field =>
      extracted[field] !== undefined && extracted[field] !== null && extracted[field] !== ''
    );

    return hasAllRequired ? extracted : null;
  }

  /**
   * Process extracted data and save to appropriate system entities
   */
  private async processExtractedData(
    data: any[],
    mapping: NotionDatabaseMapping
  ): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;

    for (const item of data) {
      try {
        switch (mapping.mappingType) {
          case 'portfolio_companies':
            await this.processPortfolioCompanyData(item);
            created++;
            break;
          case 'investments':
            await this.processInvestmentData(item);
            created++;
            break;
          case 'kpi_tracking':
            await this.processKPIData(item);
            created++;
            break;
          case 'board_reports':
            await this.processBoardReportData(item);
            created++;
            break;
          // Add more processing types as needed
          default:
            console.warn(`Unknown mapping type: ${mapping.mappingType}`);
        }
      } catch (error) {
        console.error(`Error processing ${mapping.mappingType} data:`, error);
      }
    }

    return { created, updated };
  }

  // =============================================================================
  // DATA PROCESSING METHODS
  // =============================================================================

  private async processPortfolioCompanyData(data: any): Promise<void> {
    // TODO: Implement portfolio company data processing
    console.log('Processing portfolio company data:', data);
  }

  private async processInvestmentData(data: any): Promise<void> {
    // TODO: Implement investment data processing
    console.log('Processing investment data:', data);
  }

  private async processKPIData(data: any): Promise<void> {
    // TODO: Implement KPI data processing
    console.log('Processing KPI data:', data);
  }

  private async processBoardReportData(data: any): Promise<void> {
    // TODO: Implement board report data processing
    console.log('Processing board report data:', data);
  }

  // =============================================================================
  // PORTFOLIO COMPANY INTEGRATION
  // =============================================================================

  /**
   * Set up integration with a portfolio company's Notion workspace
   */
  async setupPortfolioCompanyIntegration(
    companyId: string,
    companyName: string,
    sharedDatabaseConfigs: Array<{
      databaseId: string;
      purpose: string;
      accessLevel: string;
    }>
  ): Promise<PortfolioCompanyNotionConfig> {
    const config: PortfolioCompanyNotionConfig = {
      id: crypto.randomUUID(),
      companyId,
      companyName,
      integrationStatus: 'pending_approval',
      sharedDatabases: sharedDatabaseConfigs.map(db => ({
        databaseId: db.databaseId,
        databaseName: 'Database', // TODO: Fetch actual name
        purpose: db.purpose as any,
        accessLevel: db.accessLevel as any
      })),
      automationRules: [],
      communicationSettings: {
        allowNotifications: true,
        notificationChannels: ['email', 'in_app'],
        reportingSchedule: 'monthly'
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // TODO: Save to database and send approval request
    await this.savePortfolioCompanyConfig(config);
    return config;
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  private encryptToken(token: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.NOTION_ENCRYPTION_KEY || '', 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipher(algorithm, key);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  private decryptToken(encryptedToken: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.NOTION_ENCRYPTION_KEY || '', 'hex');
    const parts = encryptedToken.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipher(algorithm, key);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // =============================================================================
  // DATABASE OPERATIONS (TODO: Implement with your DB layer)
  // =============================================================================

  private async saveConnection(connection: NotionWorkspaceConnection): Promise<void> {
    // TODO: Implement database save
    console.log('Saving connection:', connection.id);
  }

  private async saveSyncJob(job: NotionSyncJob): Promise<void> {
    // TODO: Implement database save
    console.log('Saving sync job:', job.id);
  }

  private async savePortfolioCompanyConfig(config: PortfolioCompanyNotionConfig): Promise<void> {
    // TODO: Implement database save
    console.log('Saving portfolio company config:', config.id);
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const notionService = new NotionService();
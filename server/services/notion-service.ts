/**
 * Notion Integration Service
 * Handles all Notion API interactions, data synchronization, and content extraction
 */

import { Client } from '@notionhq/client';
import { APIResponseError } from '@notionhq/client';
import crypto from 'crypto';
import type {
  NotionWorkspaceConnection,
  NotionSyncJob,
  NotionPage,
  NotionDatabase,
  NotionDatabaseMapping,
  PortfolioCompanyNotionConfig} from '@shared/notion-schema';
import {
  extractPlainText,
  parseNotionNumber,
  parseNotionDate,
  parseNotionSelect,
  parseNotionMultiSelect
} from '@shared/notion-schema';
import { db } from '../db';
import { eq, desc } from 'drizzle-orm';
import {
  notionConnections,
  notionSyncJobs,
  notionPortfolioConfigs,
  portfolioCompanies,
  investments,
} from '@shared/schema';

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
        `${process.env["NOTION_CLIENT_ID"]}:${process.env["NOTION_CLIENT_SECRET"]}`
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
          redirect_uri: process.env["NOTION_REDIRECT_URI"]
        })
      });

      const tokenData = await response["json"]();

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
          ...(nextCursor && { start_cursor: nextCursor }),
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
        ...(nextCursor && { start_cursor: nextCursor }),
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
    const updated = 0;

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
    try {
      // Extract company data from Notion page properties
      const companyData = {
        name: extractPlainText(data.properties?.Name || data.properties?.name),
        stage: parseNotionSelect(data.properties?.Stage || data.properties?.stage),
        sector: parseNotionSelect(data.properties?.Sector || data.properties?.sector),
        location: extractPlainText(data.properties?.Location || data.properties?.location),
        website: extractPlainText(data.properties?.Website || data.properties?.website),
        founded: parseNotionDate(data.properties?.Founded || data.properties?.founded),
        employees: parseNotionNumber(data.properties?.Employees || data.properties?.employees),
        description: extractPlainText(data.properties?.Description || data.properties?.description),
        notionPageId: data.id,
      };

      if (!companyData.name) {
        console.warn('[notion-service] Skipping company - no name found');
        return;
      }

      // Check if company exists by Notion page ID (stored in metadata)
      const existingCompanies = await db
        .select()
        .from(portfolioCompanies)
        .limit(100);

      const existing = existingCompanies.find(c =>
        (c.metadata as any)?.notionPageId === data.id
      );

      if (existing) {
        // Update existing company
        await db
          .update(portfolioCompanies)
          .set({
            name: companyData.name,
            stage: companyData.stage || existing.stage,
            sector: companyData.sector || existing.sector,
            metadata: {
              ...(existing.metadata as object || {}),
              notionPageId: data.id,
              lastSyncedFromNotion: new Date().toISOString(),
            },
          })
          .where(eq(portfolioCompanies.id, existing.id));
        console.log('[notion-service] Updated portfolio company:', companyData.name);
      } else {
        console.log('[notion-service] Portfolio company from Notion needs manual linking:', companyData.name);
        // Don't auto-create - just log for manual review
        // Companies should be created through the normal workflow
      }
    } catch (error) {
      console.error('[notion-service] Failed to process portfolio company data:', error instanceof Error ? error.message : String(error));
    }
  }

  private async processInvestmentData(data: any): Promise<void> {
    try {
      // Extract investment data from Notion page properties
      const investmentData = {
        companyName: extractPlainText(data.properties?.Company || data.properties?.company),
        amount: parseNotionNumber(data.properties?.Amount || data.properties?.amount),
        date: parseNotionDate(data.properties?.Date || data.properties?.date),
        round: parseNotionSelect(data.properties?.Round || data.properties?.round),
        valuation: parseNotionNumber(data.properties?.Valuation || data.properties?.valuation),
        ownership: parseNotionNumber(data.properties?.Ownership || data.properties?.ownership),
        notionPageId: data.id,
      };

      if (!investmentData.companyName || !investmentData.amount) {
        console.warn('[notion-service] Skipping investment - missing company name or amount');
        return;
      }

      // Log for manual review - investments should be linked to existing companies
      console.log('[notion-service] Investment data from Notion:', {
        company: investmentData.companyName,
        amount: investmentData.amount,
        round: investmentData.round,
        date: investmentData.date,
      });

      // Find matching company
      const [company] = await db
        .select()
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.name, investmentData.companyName))
        .limit(1);

      if (company) {
        // Check if investment already exists
        const existingInvestments = await db
          .select()
          .from(investments)
          .where(eq(investments.companyId, company.id))
          .limit(100);

        const existing = existingInvestments.find(i =>
          (i.metadata as any)?.notionPageId === data.id
        );

        if (existing) {
          await db
            .update(investments)
            .set({
              amount: investmentData.amount?.toString() || existing.amount,
              round: investmentData.round || existing.round,
              date: investmentData.date ? new Date(investmentData.date) : existing.date,
              metadata: {
                ...(existing.metadata as object || {}),
                notionPageId: data.id,
                lastSyncedFromNotion: new Date().toISOString(),
              },
            })
            .where(eq(investments.id, existing.id));
          console.log('[notion-service] Updated investment for:', investmentData.companyName);
        }
      } else {
        console.log('[notion-service] Company not found for investment:', investmentData.companyName);
      }
    } catch (error) {
      console.error('[notion-service] Failed to process investment data:', error instanceof Error ? error.message : String(error));
    }
  }

  private async processKPIData(data: any): Promise<void> {
    try {
      // Extract KPI data from Notion page properties
      const kpiData = {
        companyName: extractPlainText(data.properties?.Company || data.properties?.company),
        metric: extractPlainText(data.properties?.Metric || data.properties?.metric),
        value: parseNotionNumber(data.properties?.Value || data.properties?.value),
        period: extractPlainText(data.properties?.Period || data.properties?.period),
        date: parseNotionDate(data.properties?.Date || data.properties?.date),
        category: parseNotionSelect(data.properties?.Category || data.properties?.category),
        notionPageId: data.id,
      };

      if (!kpiData.companyName || !kpiData.metric) {
        console.warn('[notion-service] Skipping KPI - missing company name or metric');
        return;
      }

      // Log KPI data for processing
      console.log('[notion-service] KPI data from Notion:', {
        company: kpiData.companyName,
        metric: kpiData.metric,
        value: kpiData.value,
        period: kpiData.period,
      });

      // KPIs would typically be stored in a separate kpis table
      // For now, log for manual review or future implementation
    } catch (error) {
      console.error('[notion-service] Failed to process KPI data:', error instanceof Error ? error.message : String(error));
    }
  }

  private async processBoardReportData(data: any): Promise<void> {
    try {
      // Extract board report data from Notion page properties
      const reportData = {
        companyName: extractPlainText(data.properties?.Company || data.properties?.company),
        reportDate: parseNotionDate(data.properties?.Date || data.properties?.date),
        reportType: parseNotionSelect(data.properties?.Type || data.properties?.type),
        status: parseNotionSelect(data.properties?.Status || data.properties?.status),
        summary: extractPlainText(data.properties?.Summary || data.properties?.summary),
        highlights: parseNotionMultiSelect(data.properties?.Highlights || data.properties?.highlights),
        concerns: parseNotionMultiSelect(data.properties?.Concerns || data.properties?.concerns),
        notionPageId: data.id,
      };

      if (!reportData.companyName) {
        console.warn('[notion-service] Skipping board report - missing company name');
        return;
      }

      // Log board report data for processing
      console.log('[notion-service] Board report from Notion:', {
        company: reportData.companyName,
        date: reportData.reportDate,
        type: reportData.reportType,
        status: reportData.status,
      });

      // Board reports would typically be stored in a separate table
      // For now, log for manual review or future implementation
    } catch (error) {
      console.error('[notion-service] Failed to process board report data:', error instanceof Error ? error.message : String(error));
    }
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
    const key = Buffer.from(process.env["NOTION_ENCRYPTION_KEY"] || '', 'hex');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  private decryptToken(encryptedToken: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env["NOTION_ENCRYPTION_KEY"] || '', 'hex');
    const parts = encryptedToken.split(':');

    // Handle both old format (iv:encrypted) and new format (iv:authTag:encrypted)
    const iv = Buffer.from(parts[0] ?? '', 'hex');
    const authTag = parts.length === 3 ? Buffer.from(parts[1] ?? '', 'hex') : null;
    const encrypted = parts.length === 3 ? (parts[2] ?? '') : (parts[1] ?? '');

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    if (authTag) {
      decipher.setAuthTag(authTag);
    }
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // =============================================================================
  // DATABASE OPERATIONS
  // =============================================================================

  private async saveConnection(connection: NotionWorkspaceConnection): Promise<void> {
    try {
      // Check if connection already exists
      const existing = await db
        .select()
        .from(notionConnections)
        .where(eq(notionConnections.workspaceId, connection.workspaceId))
        .limit(1);

      if (existing.length > 0) {
        // Update existing connection
        await db
          .update(notionConnections)
          .set({
            workspaceName: connection.workspaceName,
            accessToken: connection.accessToken,
            tokenType: connection.tokenType || 'bearer',
            botId: connection.botId,
            ownerType: connection.ownerType,
            ownerId: connection.ownerId,
            status: connection.status,
            scopes: connection.scopes,
            lastSyncAt: connection.lastSyncedAt,
            metadata: connection.metadata,
            updatedAt: new Date(),
          })
          .where(eq(notionConnections.workspaceId, connection.workspaceId));
        console.log('[notion-service] Updated connection:', connection.workspaceId);
      } else {
        // Insert new connection
        await db.insert(notionConnections).values({
          workspaceId: connection.workspaceId,
          workspaceName: connection.workspaceName,
          accessToken: connection.accessToken,
          tokenType: connection.tokenType || 'bearer',
          botId: connection.botId,
          ownerType: connection.ownerType,
          ownerId: connection.ownerId,
          status: connection.status,
          scopes: connection.scopes,
          lastSyncAt: connection.lastSyncedAt,
          metadata: connection.metadata,
        });
        console.log('[notion-service] Created connection:', connection.workspaceId);
      }
    } catch (error) {
      console.error('[notion-service] Failed to save connection:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async saveSyncJob(job: NotionSyncJob): Promise<void> {
    try {
      // Get connection ID from workspace
      const [connection] = await db
        .select({ id: notionConnections.id })
        .from(notionConnections)
        .where(eq(notionConnections.workspaceId, job.connectionId))
        .limit(1);

      if (!connection) {
        throw new Error(`Connection not found for workspace: ${job.connectionId}`);
      }

      await db.insert(notionSyncJobs).values({
        connectionId: connection.id,
        fundId: job.fundId ? parseInt(job.fundId, 10) : null,
        syncType: job.syncType,
        direction: job.direction || 'inbound',
        status: job.status,
        progress: job.progress || 0,
        itemsProcessed: job.itemsProcessed || 0,
        itemsCreated: job.itemsCreated || 0,
        itemsUpdated: job.itemsUpdated || 0,
        itemsFailed: job.itemsFailed || 0,
        errorMessage: job.errorMessage,
        errorDetails: job.errorDetails,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        metadata: job.metadata,
      });
      console.log('[notion-service] Created sync job for connection:', job.connectionId);
    } catch (error) {
      console.error('[notion-service] Failed to save sync job:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async savePortfolioCompanyConfig(config: PortfolioCompanyNotionConfig): Promise<void> {
    try {
      // Check if config already exists for this company
      const companyIdNum = parseInt(config.companyId, 10);
      const existing = await db
        .select()
        .from(notionPortfolioConfigs)
        .where(eq(notionPortfolioConfigs.companyId, companyIdNum))
        .limit(1);

      if (existing.length > 0) {
        // Update existing config
        await db
          .update(notionPortfolioConfigs)
          .set({
            companyName: config.companyName,
            integrationStatus: config.integrationStatus,
            sharedDatabases: config.sharedDatabases,
            automationRules: config.automationRules,
            communicationSettings: config.communicationSettings,
            lastActivityAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(notionPortfolioConfigs.companyId, companyIdNum));
        console.log('[notion-service] Updated portfolio config for company:', config.companyId);
      } else {
        // Insert new config
        await db.insert(notionPortfolioConfigs).values({
          companyId: companyIdNum,
          companyName: config.companyName,
          integrationStatus: config.integrationStatus,
          sharedDatabases: config.sharedDatabases,
          automationRules: config.automationRules,
          communicationSettings: config.communicationSettings,
        });
        console.log('[notion-service] Created portfolio config for company:', config.companyId);
      }
    } catch (error) {
      console.error('[notion-service] Failed to save portfolio config:', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  // =============================================================================
  // CONNECTION RETRIEVAL METHODS
  // =============================================================================

  async getConnectionByWorkspaceId(workspaceId: string): Promise<NotionWorkspaceConnection | null> {
    try {
      const [result] = await db
        .select()
        .from(notionConnections)
        .where(eq(notionConnections.workspaceId, workspaceId))
        .limit(1);

      if (!result) return null;

      return {
        id: result.id,
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        botId: result.botId || undefined,
        ownerType: result.ownerType as 'user' | 'workspace' | undefined,
        ownerId: result.ownerId || undefined,
        status: result.status as 'active' | 'revoked' | 'expired',
        scopes: result.scopes as string[] || [],
        lastSyncedAt: result.lastSyncAt || undefined,
        metadata: result.metadata as Record<string, unknown> | undefined,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      };
    } catch (error) {
      console.error('[notion-service] Failed to get connection:', error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  async listActiveConnections(): Promise<NotionWorkspaceConnection[]> {
    try {
      const results = await db
        .select()
        .from(notionConnections)
        .where(eq(notionConnections.status, 'active'))
        .orderBy(desc(notionConnections.updatedAt));

      return results.map(result => ({
        id: result.id,
        workspaceId: result.workspaceId,
        workspaceName: result.workspaceName,
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        botId: result.botId || undefined,
        ownerType: result.ownerType as 'user' | 'workspace' | undefined,
        ownerId: result.ownerId || undefined,
        status: result.status as 'active' | 'revoked' | 'expired',
        scopes: result.scopes as string[] || [],
        lastSyncedAt: result.lastSyncAt || undefined,
        metadata: result.metadata as Record<string, unknown> | undefined,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      }));
    } catch (error) {
      console.error('[notion-service] Failed to list connections:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  async getSyncJobsByConnection(connectionId: string, limit = 10): Promise<NotionSyncJob[]> {
    try {
      const results = await db
        .select()
        .from(notionSyncJobs)
        .where(eq(notionSyncJobs.connectionId, connectionId))
        .orderBy(desc(notionSyncJobs.createdAt))
        .limit(limit);

      return results.map(result => ({
        id: result.id,
        connectionId: result.connectionId,
        fundId: result.fundId?.toString(),
        syncType: result.syncType as 'full' | 'incremental' | 'manual',
        direction: result.direction as 'inbound' | 'outbound' | 'bidirectional',
        status: result.status as 'pending' | 'running' | 'completed' | 'failed',
        progress: result.progress || 0,
        itemsProcessed: result.itemsProcessed || 0,
        itemsCreated: result.itemsCreated || 0,
        itemsUpdated: result.itemsUpdated || 0,
        itemsFailed: result.itemsFailed || 0,
        errorMessage: result.errorMessage || undefined,
        errorDetails: result.errorDetails as Record<string, unknown> | undefined,
        startedAt: result.startedAt || undefined,
        completedAt: result.completedAt || undefined,
        metadata: result.metadata as Record<string, unknown> | undefined,
        createdAt: result.createdAt,
      }));
    } catch (error) {
      console.error('[notion-service] Failed to get sync jobs:', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const notionService = new NotionService();
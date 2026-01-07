/**
 * Cohort Analysis API Routes
 *
 * Endpoints for advanced cohort analysis functionality:
 * - POST /api/cohorts/analyze - Run cohort analysis
 * - GET /api/cohorts/unmapped - Get unmapped sectors
 * - POST /api/cohorts/sector-mappings - Bulk upsert sector mappings
 * - GET /api/cohorts/definitions - List cohort definitions
 * - POST /api/cohorts/definitions - Create cohort definition
 */

import type { Request, Response } from 'express';
import express from 'express';
import { z } from 'zod';
import { eq, and, desc, isNull } from 'drizzle-orm';
import { db } from '../db';
import {
  sectorTaxonomy,
  sectorMappings,
  companyOverrides,
  investmentOverrides,
  cohortDefinitions,
  portfolioCompanies,
  investments,
  investmentLots,
} from '@shared/schema';
import { CohortAnalyzeRequestSchema, CohortAnalyzeResponseSchema } from '@shared/types';
import { normalizeSector, slugifySector } from '@shared/utils/sector-normalization';

const router = express.Router();

/**
 * Type guard to check if error is a ZodError
 */
function isZodError(error: unknown): error is { name: 'ZodError'; errors: unknown } {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'ZodError'
  );
}

/**
 * Type guard to check if error has a message property
 */
function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

// =============================================================================
// COHORT ANALYSIS ENDPOINT
// =============================================================================

/**
 * POST /api/cohorts/analyze
 *
 * Runs cohort analysis for a fund using the advanced cohort engine.
 */
router['post']('/analyze', async (req: Request, res: Response) => {
  try {
    // Validate request
    const request = CohortAnalyzeRequestSchema.parse(req.body);
    const { fundId, cohortDefinitionId } = request;

    // Get or find default cohort definition
    let definition;
    if (cohortDefinitionId) {
      const [found] = await db
        .select()
        .from(cohortDefinitions)
        .where(
          and(eq(cohortDefinitions.id, cohortDefinitionId), eq(cohortDefinitions.fundId, fundId))
        )
        .limit(1);
      definition = found;
    } else {
      // Find default definition
      const [defaultDef] = await db
        .select()
        .from(cohortDefinitions)
        .where(
          and(
            eq(cohortDefinitions.fundId, fundId),
            eq(cohortDefinitions.isDefault, true),
            isNull(cohortDefinitions.archivedAt)
          )
        )
        .limit(1);
      definition = defaultDef;
    }

    if (!definition) {
      return res['status'](404)['json']({
        error: 'not_found',
        message: 'Cohort definition not found. Run seed first.',
      });
    }

    // Load portfolio data
    const companies = await db
      .select({
        id: portfolioCompanies.id,
        name: portfolioCompanies.name,
        sector: portfolioCompanies.sector,
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId));

    const investmentsData = await db
      .select({
        id: investments.id,
        companyId: investments.companyId,
        investmentDate: investments.investmentDate,
        amount: investments.amount,
        round: investments.round,
      })
      .from(investments)
      .where(eq(investments.fundId, fundId));

    // Load normalization layer data
    const taxonomy = await db
      .select({
        id: sectorTaxonomy.id,
        slug: sectorTaxonomy.slug,
        name: sectorTaxonomy.name,
        isSystem: sectorTaxonomy.isSystem,
      })
      .from(sectorTaxonomy)
      .where(
        and(
          eq(sectorTaxonomy.fundId, fundId),
          eq(sectorTaxonomy.taxonomyVersion, definition.sectorTaxonomyVersion)
        )
      );

    const mappings = await db
      .select({
        rawValueNormalized: sectorMappings.rawValueNormalized,
        canonicalSectorId: sectorMappings.canonicalSectorId,
      })
      .from(sectorMappings)
      .where(
        and(
          eq(sectorMappings.fundId, fundId),
          eq(sectorMappings.taxonomyVersion, definition.sectorTaxonomyVersion)
        )
      );

    const companyOverridesData = await db
      .select({
        companyId: companyOverrides.companyId,
        canonicalSectorId: companyOverrides.canonicalSectorId,
        excludeFromCohorts: companyOverrides.excludeFromCohorts,
      })
      .from(companyOverrides)
      .where(
        and(
          eq(companyOverrides.fundId, fundId),
          eq(companyOverrides.taxonomyVersion, definition.sectorTaxonomyVersion)
        )
      );

    const investmentOverridesData = await db
      .select({
        investmentId: investmentOverrides.investmentId,
        excludeFromCohorts: investmentOverrides.excludeFromCohorts,
        vintageYear: investmentOverrides.vintageYear,
        vintageQuarter: investmentOverrides.vintageQuarter,
      })
      .from(investmentOverrides)
      .where(eq(investmentOverrides.fundId, fundId));

    // Load lots data
    const lotsData = await db
      .select({
        id: investmentLots.id,
        investmentId: investmentLots.investmentId,
        lotType: investmentLots.lotType,
        sharePriceCents: investmentLots.sharePriceCents,
        sharesAcquired: investmentLots.sharesAcquired,
        costBasisCents: investmentLots.costBasisCents,
        createdAt: investmentLots.createdAt,
      })
      .from(investmentLots)
      .innerJoin(investments, eq(investmentLots.investmentId, investments.id))
      .where(eq(investments.fundId, fundId));

    // Import and run the analysis engine dynamically to avoid circular imports
    const { analyzeCohorts } = await import('../../client/src/core/cohorts/advanced-engine.js');

    const response = analyzeCohorts({
      request,
      cohortDefinition: {
        id: definition.id,
        fundId: definition.fundId,
        name: definition.name,
        vintageGranularity: definition.vintageGranularity,
        sectorTaxonomyVersion: definition.sectorTaxonomyVersion,
        unit: definition.unit,
      },
      resolutionInput: {
        fundId,
        taxonomyVersion: definition.sectorTaxonomyVersion,
        granularity: definition.vintageGranularity,
        companies,
        investments: investmentsData.filter(
          (inv): inv is typeof inv & { companyId: number } => inv.companyId !== null
        ),
        sectorTaxonomy: taxonomy,
        sectorMappings: mappings,
        companyOverrides: companyOverridesData,
        investmentOverrides: investmentOverridesData,
      },
      lots: lotsData.map((lot) => ({
        id: lot.id,
        investmentId: lot.investmentId,
        lotType: lot.lotType as 'initial' | 'follow_on' | 'secondary',
        sharePriceCents: lot.sharePriceCents,
        sharesAcquired: lot.sharesAcquired,
        costBasisCents: lot.costBasisCents,
        acquisitionDate: lot.createdAt,
      })),
    });

    // Validate response
    const validated = CohortAnalyzeResponseSchema.parse(response);
    res['status'](200)['json'](validated);
  } catch (error: unknown) {
    if (isZodError(error)) {
      return res['status'](400)['json']({
        error: 'validation_error',
        message: 'Invalid request',
        details: error.errors,
      });
    }

    console.error('Cohort analysis error:', error);
    res['status'](500)['json']({
      error: 'internal_error',
      message: hasMessage(error) ? error.message : 'Failed to run cohort analysis',
    });
  }
});

// =============================================================================
// UNMAPPED SECTORS ENDPOINT
// =============================================================================

const UnmappedQuerySchema = z.object({
  fundId: z.coerce.number().int().positive(),
  taxonomyVersion: z.string().default('v1'),
});

/**
 * GET /api/cohorts/unmapped
 *
 * Returns sectors that are not mapped to canonical sectors.
 */
router['get']('/unmapped', async (req: Request, res: Response) => {
  try {
    const { fundId, taxonomyVersion } = UnmappedQuerySchema.parse(req.query);

    // Get all raw sectors from portfolio companies
    const companies = await db
      .select({
        id: portfolioCompanies.id,
        sector: portfolioCompanies.sector,
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId));

    // Get existing mappings
    const existingMappings = await db
      .select({
        rawValueNormalized: sectorMappings.rawValueNormalized,
      })
      .from(sectorMappings)
      .where(
        and(eq(sectorMappings.fundId, fundId), eq(sectorMappings.taxonomyVersion, taxonomyVersion))
      );

    const mappedValues = new Set(existingMappings.map((m) => m.rawValueNormalized));

    // Find unmapped sectors
    const unmappedMap = new Map<
      string,
      { rawValue: string; companyCount: number; companyIds: number[] }
    >();

    for (const company of companies) {
      const normalized = normalizeSector(company.sector);
      if (!mappedValues.has(normalized)) {
        const existing = unmappedMap.get(normalized);
        if (existing) {
          existing.companyCount++;
          existing.companyIds.push(company.id);
        } else {
          unmappedMap.set(normalized, {
            rawValue: company.sector || '(blank)',
            companyCount: 1,
            companyIds: [company.id],
          });
        }
      }
    }

    const unmapped = Array.from(unmappedMap.entries()).map(([normalized, data]) => ({
      rawValue: data.rawValue,
      rawValueNormalized: normalized,
      companyCount: data.companyCount,
    }));

    res['status'](200)['json']({
      fundId,
      taxonomyVersion,
      unmappedCount: unmapped.length,
      unmapped,
    });
  } catch (error: unknown) {
    if (isZodError(error)) {
      return res['status'](400)['json']({
        error: 'validation_error',
        message: 'Invalid query parameters',
        details: error.errors,
      });
    }

    console.error('Unmapped sectors error:', error);
    res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to get unmapped sectors',
    });
  }
});

// =============================================================================
// SECTOR MAPPINGS ENDPOINTS
// =============================================================================

const SectorMappingInputSchema = z.object({
  rawValue: z.string().min(1),
  canonicalSectorId: z.string().uuid(),
  confidenceScore: z.number().min(0).max(1).default(1.0),
});

const BulkSectorMappingsSchema = z.object({
  fundId: z.number().int().positive(),
  taxonomyVersion: z.string().default('v1'),
  mappings: z.array(SectorMappingInputSchema),
});

/**
 * POST /api/cohorts/sector-mappings
 *
 * Bulk upsert sector mappings.
 */
router['post']('/sector-mappings', async (req: Request, res: Response) => {
  try {
    const { fundId, taxonomyVersion, mappings } = BulkSectorMappingsSchema.parse(req.body);

    const results = {
      created: 0,
      updated: 0,
      errors: [] as Array<{ rawValue: string; error: string }>,
    };

    for (const mapping of mappings) {
      try {
        const normalized = normalizeSector(mapping.rawValue);

        // Check if mapping exists
        const [existing] = await db
          .select()
          .from(sectorMappings)
          .where(
            and(
              eq(sectorMappings.fundId, fundId),
              eq(sectorMappings.taxonomyVersion, taxonomyVersion),
              eq(sectorMappings.rawValueNormalized, normalized)
            )
          )
          .limit(1);

        if (existing) {
          // Update
          await db
            .update(sectorMappings)
            .set({
              canonicalSectorId: mapping.canonicalSectorId,
              confidenceScore: String(mapping.confidenceScore),
              source: 'manual',
              updatedAt: new Date(),
            })
            .where(eq(sectorMappings.id, existing.id));
          results.updated++;
        } else {
          // Insert
          await db.insert(sectorMappings).values({
            fundId,
            taxonomyVersion,
            rawValue: mapping.rawValue,
            rawValueNormalized: normalized,
            canonicalSectorId: mapping.canonicalSectorId,
            confidenceScore: String(mapping.confidenceScore),
            source: 'manual',
          });
          results.created++;
        }
      } catch (err) {
        results.errors.push({
          rawValue: mapping.rawValue,
          error: hasMessage(err) ? err.message : 'Unknown error',
        });
      }
    }

    res['status'](200)['json'](results);
  } catch (error: unknown) {
    if (isZodError(error)) {
      return res['status'](400)['json']({
        error: 'validation_error',
        message: 'Invalid request',
        details: error.errors,
      });
    }

    console.error('Sector mappings error:', error);
    res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to update sector mappings',
    });
  }
});

// =============================================================================
// COHORT DEFINITIONS ENDPOINTS
// =============================================================================

const ListDefinitionsQuerySchema = z.object({
  fundId: z.coerce.number().int().positive(),
  unit: z.enum(['company', 'investment']).optional(),
  includeArchived: z.coerce.boolean().default(false),
});

/**
 * GET /api/cohorts/definitions
 *
 * List cohort definitions for a fund.
 */
router['get']('/definitions', async (req: Request, res: Response) => {
  try {
    const { fundId, unit, includeArchived } = ListDefinitionsQuerySchema.parse(req.query);

    const query = db
      .select()
      .from(cohortDefinitions)
      .where(eq(cohortDefinitions.fundId, fundId))
      .orderBy(desc(cohortDefinitions.isDefault), desc(cohortDefinitions.createdAt));

    const definitions = await query;

    // Filter by unit and archived status
    const filtered = definitions.filter((d) => {
      if (unit && d.unit !== unit) return false;
      if (!includeArchived && d.archivedAt !== null) return false;
      return true;
    });

    res['status'](200)['json']({
      fundId,
      count: filtered.length,
      definitions: filtered,
    });
  } catch (error: unknown) {
    if (isZodError(error)) {
      return res['status'](400)['json']({
        error: 'validation_error',
        message: 'Invalid query parameters',
        details: error.errors,
      });
    }

    console.error('List definitions error:', error);
    res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to list cohort definitions',
    });
  }
});

const CreateDefinitionSchema = z.object({
  fundId: z.number().int().positive(),
  name: z.string().min(1).max(100),
  vintageGranularity: z.enum(['year', 'quarter']).default('year'),
  sectorTaxonomyVersion: z.string().default('v1'),
  unit: z.enum(['company', 'investment']).default('company'),
  isDefault: z.boolean().default(false),
});

/**
 * POST /api/cohorts/definitions
 *
 * Create a new cohort definition.
 */
router['post']('/definitions', async (req: Request, res: Response) => {
  try {
    const input = CreateDefinitionSchema.parse(req.body);

    // If setting as default, unset other defaults first
    if (input.isDefault) {
      await db
        .update(cohortDefinitions)
        .set({ isDefault: false })
        .where(
          and(eq(cohortDefinitions.fundId, input.fundId), eq(cohortDefinitions.isDefault, true))
        );
    }

    const [created] = await db
      .insert(cohortDefinitions)
      .values({
        fundId: input.fundId,
        name: input.name,
        vintageGranularity: input.vintageGranularity,
        sectorTaxonomyVersion: input.sectorTaxonomyVersion,
        unit: input.unit,
        isDefault: input.isDefault,
      })
      .returning();

    res['status'](201)['json'](created);
  } catch (error: unknown) {
    if (isZodError(error)) {
      return res['status'](400)['json']({
        error: 'validation_error',
        message: 'Invalid request',
        details: error.errors,
      });
    }

    // Check for unique constraint violation
    if (hasMessage(error) && error.message.includes('unique')) {
      return res['status'](409)['json']({
        error: 'conflict',
        message: 'A cohort definition with this name already exists',
      });
    }

    console.error('Create definition error:', error);
    res['status'](500)['json']({
      error: 'internal_error',
      message: 'Failed to create cohort definition',
    });
  }
});

// =============================================================================
// SEED ENDPOINT (for initial setup)
// =============================================================================

const SeedSchema = z.object({
  fundId: z.number().int().positive(),
});

/**
 * POST /api/cohorts/seed
 *
 * Seeds the cohort normalization tables for a fund.
 * Creates default taxonomy, mappings, and definitions.
 */
router['post']('/seed', async (req: Request, res: Response) => {
  try {
    const { fundId } = SeedSchema.parse(req.body);
    const taxonomyVersion = 'v1';

    // Check if already seeded
    const [existingTaxonomy] = await db
      .select()
      .from(sectorTaxonomy)
      .where(
        and(eq(sectorTaxonomy.fundId, fundId), eq(sectorTaxonomy.taxonomyVersion, taxonomyVersion))
      )
      .limit(1);

    if (existingTaxonomy) {
      return res['status'](200)['json']({
        message: 'Already seeded',
        fundId,
        taxonomyVersion,
      });
    }

    // Get distinct sectors from portfolio companies
    const companies = await db
      .select({
        sector: portfolioCompanies.sector,
      })
      .from(portfolioCompanies)
      .where(eq(portfolioCompanies.fundId, fundId));

    const distinctSectors = new Set<string>();
    for (const company of companies) {
      if (company.sector) {
        distinctSectors.add(company.sector);
      }
    }

    // Create system "Unmapped" sector (ID not needed, just ensuring record exists)
    await db
      .insert(sectorTaxonomy)
      .values({
        fundId,
        taxonomyVersion,
        name: 'Unmapped',
        slug: 'unmapped',
        isSystem: true,
        sortOrder: 9999,
      })
      .returning();

    // Create identity sectors and mappings
    const createdSectors: Array<{ id: string; name: string; slug: string }> = [];
    let sortOrder = 0;

    for (const sectorName of distinctSectors) {
      const slug = slugifySector(sectorName);
      const normalized = normalizeSector(sectorName);

      // Create sector
      const [sector] = await db
        .insert(sectorTaxonomy)
        .values({
          fundId,
          taxonomyVersion,
          name: sectorName,
          slug,
          isSystem: false,
          sortOrder: sortOrder++,
        })
        .returning();

      if (!sector) {
        continue; // Skip if insert failed
      }

      createdSectors.push({ id: sector.id, name: sector.name, slug: sector.slug });

      // Create identity mapping
      await db.insert(sectorMappings).values({
        fundId,
        taxonomyVersion,
        rawValue: sectorName,
        rawValueNormalized: normalized,
        canonicalSectorId: sector.id,
        confidenceScore: '1.00',
        source: 'seed_identity',
      });
    }

    // Create default cohort definitions
    await db.insert(cohortDefinitions).values([
      {
        fundId,
        name: 'Default (Company / Year)',
        vintageGranularity: 'year',
        sectorTaxonomyVersion: taxonomyVersion,
        unit: 'company',
        isDefault: true,
      },
      {
        fundId,
        name: 'Deployment (Investment / Year)',
        vintageGranularity: 'year',
        sectorTaxonomyVersion: taxonomyVersion,
        unit: 'investment',
        isDefault: false,
      },
    ]);

    res['status'](201)['json']({
      message: 'Seeded successfully',
      fundId,
      taxonomyVersion,
      sectorsCreated: createdSectors.length + 1, // +1 for Unmapped
      mappingsCreated: createdSectors.length,
      definitionsCreated: 2,
    });
  } catch (error: unknown) {
    console.error('Seed error:', error);
    res['status'](500)['json']({
      error: 'internal_error',
      message: hasMessage(error) ? error.message : 'Failed to seed cohort data',
    });
  }
});

export default router;

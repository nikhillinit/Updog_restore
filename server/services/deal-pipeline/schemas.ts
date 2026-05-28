import { z } from 'zod';
import { CompanySectorSchema, CompanyStageSchema } from '@shared/company-taxonomy';

export const DealStatusEnum = z.enum([
  'lead',
  'qualified',
  'pitch',
  'dd',
  'committee',
  'term_sheet',
  'closed',
  'passed',
]);

export const DealPriorityEnum = z.enum(['high', 'medium', 'low']);

export const DealStageEnum = CompanyStageSchema;

export const SourceTypeEnum = z.enum([
  'Referral',
  'Cold outreach',
  'Inbound',
  'Event',
  'Network',
  'Other',
]);

export const CreateDealSchema = z.object({
  fundId: z.number().int().positive().optional(),
  companyName: z.string().min(1, 'Company name is required').max(255),
  sector: CompanySectorSchema,
  stage: DealStageEnum,
  sourceType: SourceTypeEnum,
  dealSize: z.number().positive().optional(),
  valuation: z.number().positive().optional(),
  status: DealStatusEnum.default('lead'),
  priority: DealPriorityEnum.default('medium'),
  foundedYear: z.number().int().min(1900).max(2100).optional(),
  employeeCount: z.number().int().positive().optional(),
  revenue: z.number().optional(),
  description: z.string().max(5000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  sourceNotes: z.string().max(2000).optional(),
  nextAction: z.string().max(500).optional(),
});

export const UpdateDealSchema = CreateDealSchema.partial();

const SortByEnum = z
  .enum(['updatedAt', 'companyName', 'dealSize', 'createdAt'])
  .default('createdAt');
const SortDirEnum = z.enum(['asc', 'desc']).default('desc');

export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: DealStatusEnum.optional(),
  priority: DealPriorityEnum.optional(),
  fundId: z.coerce.number().int().positive().optional(),
  search: z.string().max(100).optional(),
  sortBy: SortByEnum,
  sortDir: SortDirEnum,
});

export const PipelineQuerySchema = z.object({
  fundId: z.coerce.number().int().positive().optional(),
});

export const StageChangeSchema = z.object({
  status: DealStatusEnum,
  notes: z.string().max(1000).optional(),
});

export const CreateDDItemSchema = z.object({
  category: z.enum(['Financial', 'Legal', 'Technical', 'Market', 'Team']),
  item: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'not_applicable']).default('pending'),
  priority: DealPriorityEnum.default('medium'),
  assignedTo: z.string().max(255).optional(),
  dueDate: z.string().datetime().optional(),
});

export const ImportRowSchema = z.object({
  companyName: z.string().min(1).max(255),
  sector: CompanySectorSchema,
  stage: DealStageEnum,
  sourceType: SourceTypeEnum,
  dealSize: z.number().positive().optional(),
  valuation: z.number().positive().optional(),
  status: DealStatusEnum.optional(),
  priority: DealPriorityEnum.optional(),
  foundedYear: z.number().int().min(1900).max(2100).optional(),
  employeeCount: z.number().int().positive().optional(),
  revenue: z.number().optional(),
  description: z.string().max(5000).optional(),
  website: z.string().url().optional().or(z.literal('')),
  contactName: z.string().max(255).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().max(50).optional(),
  sourceNotes: z.string().max(2000).optional(),
  nextAction: z.string().max(500).optional(),
});

export const ImportPreviewSchema = z.object({
  rows: z.array(z.record(z.unknown())).max(1000),
  fundId: z.number().int().positive().optional(),
});

export const ImportConfirmSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(1000),
  fundId: z.number().int().positive().optional(),
  mode: z.enum(['skip_duplicates', 'import_all']).default('skip_duplicates'),
});

export const BulkStatusSchema = z.object({
  dealIds: z.array(z.number().int().positive()).min(1).max(100),
  status: DealStatusEnum,
  notes: z.string().max(1000).optional(),
});

export const BulkArchiveSchema = z.object({
  dealIds: z.array(z.number().int().positive()).min(1).max(100),
});

export const dealPipelineValidationSchemas = {
  createDeal: CreateDealSchema,
  updateDeal: UpdateDealSchema,
  importConfirm: ImportConfirmSchema,
} as const;

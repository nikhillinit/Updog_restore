import { pgTable, serial, integer, text, boolean, timestamp, jsonb, uuid, varchar, index } from "drizzle-orm/pg-core";
import { funds, portfolioCompanies, users } from './tables';

// Custom fields schema
export const customFields = pgTable("custom_fields", {
  id: serial("id").primaryKey(),
  fundId: integer("fund_id").references(() => funds.id),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'number', 'tags', 'text', 'color', 'date'
  required: boolean("required").default(false),
  options: text("options").array(), // For tags and color options
  createdAt: timestamp("created_at").defaultNow(),
});

export const customFieldValues = pgTable("custom_fieldvalues", {
  id: serial("id").primaryKey(),
  fieldId: integer("field_id").references(() => customFields.id),
  investmentId: integer("investment_id").references(() => portfolioCompanies.id),
  value: text("value"), // JSON string for complex values
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit log table for comprehensive activity tracking with 7-year retention
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: integer("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  changes: jsonb("changes"),
  ipAddress: text("ip_address"), // INET type handled as text in TypeScript
  userAgent: text("user_agent"),
  correlationId: varchar("correlation_id", { length: 36 }),
  sessionId: varchar("session_id", { length: 64 }),
  requestPath: text("request_path"),
  httpMethod: varchar("http_method", { length: 10 }),
  statusCode: integer("status_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  // retention_until is a generated column, not managed by Drizzle directly
}, (table) => ({
  retentionIdx: index("idx_audit_retention").on(table.createdAt), // Index on created_at for retention queries
  correlationIdx: index("idx_audit_correlation").on(table.correlationId),
  userActionIdx: index("idx_audit_user_action").on(table.userId, table.action, table.createdAt.desc()),
}));

// Type exports
export type CustomField = typeof customFields.$inferSelect;
export type NewCustomField = typeof customFields.$inferInsert;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type NewCustomFieldValue = typeof customFieldValues.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
/**
 * Input validation schemas using Zod
 * Validates API inputs and provides type safety
 */

import { z } from 'zod';
import { BOARD_STATUS_VALUES } from '@/lib/crm';
import { CREATABLE_PROJECT_TYPES } from '@/lib/project-modes';

// Common validation patterns
const uuidSchema = z.string().uuid();
const urlSchema = z.string().url();
const nonEmptyString = z.string().min(1);
const pastedProfileTextSchema = z.string().max(50_000, 'Pasted text must be 50,000 characters or less').optional();

// Project-related schemas
export const createProjectSchema = z.object({
  name: z.string().optional(),
  slug: z.string().optional(),
  project_type: z.enum(CREATABLE_PROJECT_TYPES).optional().default('startup'),
  draft: z.boolean().optional().default(false),
}).superRefine((data, ctx) => {
  if (!data.draft && !data.name?.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['name'],
      message: 'Name is required',
    });
  }
});

// Person-related schemas
export const createPersonSchema = z.object({
  project_id: uuidSchema,
  outreach_project_id: uuidSchema.optional(),
  name: z.string().optional(),  // populated after crawl when not provided
  title: z.string().optional(),
  company: z.string().optional(),
  persona_type: z.enum(['potential_user', 'buyer', 'operator', 'domain_expert', 'skeptic', 'connector']).optional(),
  source_urls: z.array(urlSchema).optional().default([]),
  raw_pasted_text: pastedProfileTextSchema,
  additional_context: z.array(z.string()).optional(),
  research_depth: z.enum(['quick', 'deep']).default('quick'),
}).refine((data) => {
  return data.source_urls.length > 0 || !!data.raw_pasted_text?.trim();
}, {
  message: 'Enter at least one URL or paste profile text.',
  path: ['source_urls'],
});

export const updatePersonSchema = z.object({
  name: nonEmptyString.optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  persona_type: z.enum(['potential_user', 'buyer', 'operator', 'domain_expert', 'skeptic', 'connector']).optional(),
  source_urls: z.array(urlSchema).optional(),
  raw_pasted_text: pastedProfileTextSchema,
  additional_context: z.array(z.string().max(50_000, 'Additional context must be 50,000 characters or less')).optional(),
  board_status: z.enum(BOARD_STATUS_VALUES).optional(),
  call_scheduled_at: z.string().datetime().optional(),
});

// Webhook schemas
export const clerkWebhookSchema = z.object({
  type: z.string(),
  data: z.record(z.string(), z.any()),
});

// Utility function to validate and parse input
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation failed: ${error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

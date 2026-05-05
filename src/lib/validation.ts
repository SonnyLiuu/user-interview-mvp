/**
 * Input validation schemas using Zod
 * Validates API inputs and provides type safety
 */

import { z } from 'zod';

// Common validation patterns
const uuidSchema = z.string().uuid();
const urlSchema = z.string().url();
const nonEmptyString = z.string().min(1);

// Project-related schemas
export const createProjectSchema = z.object({
  name: nonEmptyString,
  slug: z.string().optional(),
});

// Person-related schemas
export const createPersonSchema = z.object({
  project_id: uuidSchema,
  name: z.string().optional(),  // populated after crawl when not provided
  title: z.string().optional(),
  company: z.string().optional(),
  persona_type: z.enum(['potential_user', 'buyer', 'operator', 'domain_expert', 'skeptic', 'connector']).optional(),
  source_urls: z.array(urlSchema).min(1, 'At least one URL is required'),
  raw_pasted_text: z.string().optional(),
  additional_context: z.array(z.string()).optional(),
  research_depth: z.enum(['quick', 'deep']).default('deep'),
});

export const updatePersonSchema = z.object({
  name: nonEmptyString.optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  persona_type: z.enum(['potential_user', 'buyer', 'operator', 'domain_expert', 'skeptic', 'connector']).optional(),
  source_urls: z.array(urlSchema).optional(),
  raw_pasted_text: z.string().optional(),
  additional_context: z.array(z.string()).optional(),
  board_status: z.enum(['bookmarked', 'contacted', 'scheduled', 'completed']).optional(),
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

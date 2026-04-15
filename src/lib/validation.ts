/**
 * Input validation schemas using Zod
 * Validates API inputs and provides type safety
 */

import { z } from 'zod';

// Common validation patterns
const uuidSchema = z.string().uuid();
const emailSchema = z.string().email();
const urlSchema = z.string().url();
const nonEmptyString = z.string().min(1);

// User-related schemas
export const createUserSchema = z.object({
  clerk_user_id: z.string().min(1),
  email: emailSchema,
  name: z.string().optional(),
  avatar_url: urlSchema.optional(),
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  avatar_url: urlSchema.optional(),
});

// Project-related schemas
export const createProjectSchema = z.object({
  name: nonEmptyString,
  slug: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: nonEmptyString.optional(),
  slug: z.string().optional(),
  is_archived: z.boolean().optional(),
});

// Person-related schemas
export const createPersonSchema = z.object({
  project_id: uuidSchema,
  name: nonEmptyString,
  title: z.string().optional(),
  company: z.string().optional(),
  persona_type: z.enum(['potential_user', 'buyer', 'operator', 'domain_expert', 'skeptic', 'connector']).optional(),
  source_urls: z.array(urlSchema).optional(),
  raw_pasted_text: z.string().optional(),
  additional_context: z.array(z.string()).optional(),
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

// Onboarding schemas
export const onboardingAnswerSchema = z.object({
  slot_key: z.string().min(1),
  answer: z.union([z.string(), z.boolean()]),
});

export const onboardingMessageSchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: nonEmptyString,
  message_type: z.enum(['question', 'choice_answer', 'custom_answer', 'system']).optional(),
});

// Interaction schemas
export const createInteractionSchema = z.object({
  person_id: uuidSchema,
  type: z.enum(['call', 'email', 'meeting']).default('call'),
  notes_raw: z.string().optional(),
  transcript_raw: z.string().optional(),
  scheduled_at: z.string().datetime().optional(),
});

export const updateInteractionSchema = z.object({
  notes_raw: z.string().optional(),
  transcript_raw: z.string().optional(),
  scheduled_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
});

// Debrief schemas
export const createDebriefSchema = z.object({
  interaction_id: uuidSchema,
  person_id: uuidSchema,
  project_id: uuidSchema,
  notes: z.string().optional(),
  transcript: z.string().optional(),
});

// AI request schemas
export const aiTextRequestSchema = z.object({
  prompt: nonEmptyString,
  model: z.string().optional(),
});

export const aiJsonRequestSchema = z.object({
  taskName: nonEmptyString,
  schema: z.record(z.string(), z.any()), // JSON schema object
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: nonEmptyString,
  })),
  model: z.string().optional(),
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

// Type exports for use in API routes
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreatePersonInput = z.infer<typeof createPersonSchema>;
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
export type OnboardingAnswerInput = z.infer<typeof onboardingAnswerSchema>;
export type OnboardingMessageInput = z.infer<typeof onboardingMessageSchema>;
export type CreateInteractionInput = z.infer<typeof createInteractionSchema>;
export type UpdateInteractionInput = z.infer<typeof updateInteractionSchema>;
export type CreateDebriefInput = z.infer<typeof createDebriefSchema>;
export type AiTextRequestInput = z.infer<typeof aiTextRequestSchema>;
export type AiJsonRequestInput = z.infer<typeof aiJsonRequestSchema>;
export type ClerkWebhookInput = z.infer<typeof clerkWebhookSchema>;
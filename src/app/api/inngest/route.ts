import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { generateBriefFn } from '@/inngest/functions/generate-brief';

export const { GET, POST, PUT } = serve({ client: inngest, functions: [generateBriefFn] });

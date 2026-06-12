import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from './db/index';
import { outreach_projects, type OutreachProjectBrief } from './db/schema';
import { normalizeIdeaValidationBrief } from './idea-validation-context-core';
export {
  applyIdeaValidationBrief,
  normalizeIdeaValidationBrief,
} from './idea-validation-context-core';

export async function getActiveIdeaValidationBrief(startupProjectId: string) {
  const [row] = await db
    .select({ brief: outreach_projects.brief_json })
    .from(outreach_projects)
    .where(and(
      eq(outreach_projects.startup_project_id, startupProjectId),
      eq(outreach_projects.type, 'idea_validation'),
      eq(outreach_projects.status, 'active'),
    ))
    .orderBy(desc(outreach_projects.updated_at))
    .limit(1);

  return normalizeIdeaValidationBrief(row?.brief as OutreachProjectBrief | null | undefined);
}

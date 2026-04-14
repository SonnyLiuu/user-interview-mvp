import { inngest } from '@/inngest/client';
import { db } from '@/lib/db';
import { project_intake, project_briefs, projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { generateBrief } from '@/lib/ai/generate-brief';

export const generateBriefFn = inngest.createFunction(
  { id: 'generate-brief', name: 'Generate Project Brief' },
  { event: 'brief/generate' },
  async ({ event }) => {
    const { projectId } = event.data as { projectId: string };

    const [intake] = await db
      .select()
      .from(project_intake)
      .where(eq(project_intake.project_id, projectId))
      .limit(1);

    if (!intake) throw new Error(`No intake found for project ${projectId}`);

    const brief = await generateBrief(intake);

    // Mark old briefs as not current
    await db
      .update(project_briefs)
      .set({ is_current: false })
      .where(eq(project_briefs.project_id, projectId));

    // Insert new brief
    await db.insert(project_briefs).values({
      project_id: projectId,
      idea_summary: brief.idea_summary,
      strengths: brief.strengths,
      weaknesses: brief.weaknesses,
      most_promising_avenues: brief.most_promising_avenues,
      assumptions: brief.assumptions,
      recommended_conversations: brief.recommended_conversations,
      is_current: true,
    });

    await db
      .update(projects)
      .set({ intake_status: 'complete' })
      .where(eq(projects.id, projectId));
  }
);

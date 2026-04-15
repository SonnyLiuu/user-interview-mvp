import { inngest } from '@/inngest/client';
import { db } from '@/lib/db';
import { project_intake, project_briefs, projects } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';
import { generateBrief } from '@/lib/ai/generate-brief';

export const generateBriefFn = inngest.createFunction(
  { id: 'generate-brief', name: 'Generate Project Brief' },
  { event: 'brief/generate' },
  async ({ event }) => {
    const { projectId } = event.data as { projectId: string };

    try {
      const [intake] = await db
        .select()
        .from(project_intake)
        .where(eq(project_intake.project_id, projectId))
        .limit(1);

      if (!intake) throw new Error(`No intake found for project ${projectId}`);

      const brief = await generateBrief(intake);

      const [created] = await db
        .insert(project_briefs)
        .values({
          project_id: projectId,
          idea_summary: brief.idea_summary,
          strengths: brief.strengths,
          weaknesses: brief.weaknesses,
          most_promising_avenues: brief.most_promising_avenues,
          assumptions: brief.assumptions,
          recommended_conversations: brief.recommended_conversations,
          is_current: true,
        })
        .returning({ id: project_briefs.id });

      await db
        .update(project_briefs)
        .set({ is_current: false })
        .where(and(eq(project_briefs.project_id, projectId), ne(project_briefs.id, created.id)));

      await db
        .update(projects)
        .set({ intake_status: 'complete', updated_at: new Date() })
        .where(eq(projects.id, projectId));
    } catch (error) {
      await db
        .update(projects)
        .set({ intake_status: 'generation_failed', updated_at: new Date() })
        .where(eq(projects.id, projectId));

      throw error;
    }
  }
);

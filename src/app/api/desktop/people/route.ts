import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, projects } from '@/lib/db/schema';
import { getDesktopUser } from '@/lib/desktop-auth';

export async function GET(request: Request) {
  const user = await getDesktopUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({
      id: people.id,
      name: people.name,
      title: people.title,
      company: people.company,
      personaType: people.persona_type,
      analysisStatus: people.analysis_status,
      boardStatus: people.board_status,
      updatedAt: people.updated_at,
      projectId: projects.id,
      projectName: projects.name,
      projectSlug: projects.slug,
    })
    .from(people)
    .innerJoin(projects, eq(people.project_id, projects.id))
    .where(eq(projects.user_id, user.id))
    .orderBy(desc(people.updated_at))
    .limit(50);

  return NextResponse.json(rows);
}

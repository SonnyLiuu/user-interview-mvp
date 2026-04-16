import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { people, users } from '@/lib/db/schema';
import { validateInput, createPersonSchema } from '@/lib/validation';

// Derive a human-readable placeholder name from the first URL while the crawl runs.
function placeholderName(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const slug = pathname.replace(/\//g, ' ').trim();
    return slug || hostname;
  } catch {
    return 'Discovering...';
  }
}

export async function POST(req: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const data = validateInput(createPersonSchema, body);

    // Verify the project belongs to this user
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.clerk_user_id, clerkUserId));
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const [person] = await db
      .insert(people)
      .values({
        project_id: data.project_id,
        name: data.name ?? placeholderName(data.source_urls[0]),
        title: data.title,
        company: data.company,
        persona_type: data.persona_type,
        source_urls: data.source_urls,
        raw_pasted_text: data.raw_pasted_text,
        additional_context: data.additional_context,
        research_depth: data.research_depth,
        crawl_status: 'pending',
        analysis_status: 'pending',
        expires_at: expiresAt,
      })
      .returning();

    return NextResponse.json(person, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Validation failed:')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Person creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

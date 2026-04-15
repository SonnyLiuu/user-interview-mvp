import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { env } from '@/lib/server-env';
import { validateInput, clerkWebhookSchema } from '@/lib/validation';

export const runtime = 'nodejs'; // svix requires Node.js crypto

export async function POST(req: NextRequest) {
  const h = await headers();
  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);

  let evt: { type: string; data: Record<string, unknown> };
  try {
    evt = wh.verify(await req.text(), {
      'svix-id': h.get('svix-id')!,
      'svix-timestamp': h.get('svix-timestamp')!,
      'svix-signature': h.get('svix-signature')!,
    }) as typeof evt;
  } catch {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  // Validate webhook payload structure
  try {
    validateInput(clerkWebhookSchema, evt);
  } catch (error) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  if (evt.type === 'user.created') {
    const d = evt.data;

    // Validate required fields
    const email = (d.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address;
    const userId = d.id as string;

    if (!email || !userId) {
      return NextResponse.json({ error: 'Missing required user data' }, { status: 400 });
    }

    const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || email;
    const avatarUrl = d.image_url as string;

    try {
      await db.insert(users).values({
        clerk_user_id: userId,
        email,
        name,
        avatar_url: avatarUrl || undefined,
      }).onConflictDoNothing();
    } catch (error) {
      console.error('Database error creating user:', error);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

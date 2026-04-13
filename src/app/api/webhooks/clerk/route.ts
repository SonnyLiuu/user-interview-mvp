import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

export const runtime = 'nodejs'; // svix requires Node.js crypto

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'No secret' }, { status: 500 });
  const h = await headers();
  const wh = new Webhook(secret);
  let evt: { type: string; data: Record<string, unknown> };
  try {
    evt = wh.verify(await req.text(), {
      'svix-id': h.get('svix-id')!,
      'svix-timestamp': h.get('svix-timestamp')!,
      'svix-signature': h.get('svix-signature')!,
    }) as typeof evt;
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (evt.type === 'user.created') {
    const d = evt.data;
    const email = (d.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address ?? '';
    const name = [d.first_name, d.last_name].filter(Boolean).join(' ') || email;
    await db.insert(users).values({ email, name, avatar_url: (d.image_url as string) ?? '' }).onConflictDoNothing();
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { getDesktopUser } from '@/lib/desktop-auth';

export async function GET(request: Request) {
  const user = await getDesktopUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    userId: user.clerkUserId,
    dbUserId: user.id,
  });
}

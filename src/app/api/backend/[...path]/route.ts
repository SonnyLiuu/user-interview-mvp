import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

async function handle(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const pathname = `/${path.join('/')}`;
  const search = req.nextUrl.search || '';
  return proxyToBackend(req, `${pathname}${search}`);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;

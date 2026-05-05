import { NextRequest } from 'next/server';
import { proxyToBackend } from '@/lib/backend-proxy';

type Params = { params: Promise<{ personId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { personId } = await params;
  return proxyToBackend(req, `/v1/people/${encodeURIComponent(personId)}/call-brief`);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { personId } = await params;
  return proxyToBackend(req, `/v1/people/${encodeURIComponent(personId)}/call-brief/refresh`);
}

import { readFile, stat } from 'node:fs/promises';

import { NextResponse } from 'next/server';

import {
  getNotetakerDownload,
  type NotetakerPlatform,
} from '@/lib/notetaker-download';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PLATFORMS = new Set<NotetakerPlatform>(['windows', 'macos']);

type RouteContext = {
  params: Promise<{ platform: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { platform: rawPlatform } = await context.params;
  const platform = rawPlatform.toLowerCase() as NotetakerPlatform;

  if (!PLATFORMS.has(platform)) {
    return new NextResponse('Unknown notetaker platform.', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const download = getNotetakerDownload(platform);
  try {
    const artifactStat = await stat(download.localPath);
    const artifact = await readFile(download.localPath);

    return new NextResponse(artifact, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${download.filename}"`,
        'Content-Length': String(artifactStat.size),
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return new NextResponse(
        [
          `${download.label} notetaker artifact has not been built yet.`,
          `Expected: ${download.localPath}`,
        ].join('\n'),
        {
          status: 404,
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'text/plain; charset=utf-8',
          },
        },
      );
    }

    console.error(`[downloads/notetaker/${platform}] failed to serve artifact`, error);
    return NextResponse.json(
      { error: 'Unable to serve notetaker artifact.' },
      { status: 500 },
    );
  }
}

import { readFile, stat } from 'node:fs/promises';

import { NextResponse } from 'next/server';

import {
  NOTETAKER_DOWNLOAD_FILENAME,
  NOTETAKER_INSTALLER_PATH,
} from '@/lib/notetaker-download';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const installerStat = await stat(NOTETAKER_INSTALLER_PATH);
    const installer = await readFile(NOTETAKER_INSTALLER_PATH);

    return new NextResponse(installer, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="${NOTETAKER_DOWNLOAD_FILENAME}"`,
        'Content-Length': String(installerStat.size),
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return new NextResponse(
        [
          'Notetaker installer has not been built yet.',
          'Expected: desktop/installer/dist/foundry-overlay-setup-0.1.0.exe',
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

    console.error('[downloads/notetaker] failed to serve installer', error);
    return NextResponse.json(
      { error: 'Unable to serve notetaker installer.' },
      { status: 500 }
    );
  }
}

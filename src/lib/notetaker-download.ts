import 'server-only';

import path from 'node:path';

import { env } from '@/lib/server-env';

export const NOTETAKER_INSTALLER_VERSION = '0.1.0';
export const NOTETAKER_LOCAL_DOWNLOAD_HREF = '/downloads/notetaker';
export const NOTETAKER_DOWNLOAD_FILENAME =
  `User-Interview-Notetaker-Setup-${NOTETAKER_INSTALLER_VERSION}.exe`;
export const NOTETAKER_INSTALLER_PATH = path.join(
  process.cwd(),
  'desktop',
  'installer',
  'dist',
  `foundry-overlay-setup-${NOTETAKER_INSTALLER_VERSION}.exe`
);

export function getNotetakerDownloadHref() {
  return env.FOUNDRY_OVERLAY_INSTALLER_URL?.trim() || NOTETAKER_LOCAL_DOWNLOAD_HREF;
}

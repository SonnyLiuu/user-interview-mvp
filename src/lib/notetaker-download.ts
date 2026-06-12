import 'server-only';

import { env } from '@/lib/server-env';
import {
  buildNotetakerDownload,
  buildNotetakerDownloads,
  NOTETAKER_DOWNLOAD_FILENAME,
  NOTETAKER_INSTALLER_PATH,
  NOTETAKER_INSTALLER_VERSION,
  NOTETAKER_LOCAL_DOWNLOAD_HREF,
  type NotetakerDownload,
  type NotetakerPlatform,
} from './notetaker-download-core';

export {
  NOTETAKER_DOWNLOAD_FILENAME,
  NOTETAKER_INSTALLER_PATH,
  NOTETAKER_INSTALLER_VERSION,
  NOTETAKER_LOCAL_DOWNLOAD_HREF,
  type NotetakerDownload,
  type NotetakerPlatform,
};

export function getNotetakerDownload(platform: NotetakerPlatform): NotetakerDownload {
  return buildNotetakerDownload(platform, {
    legacyWindowsUrl: env.FOUNDRY_OVERLAY_INSTALLER_URL,
  });
}

export function getNotetakerDownloads() {
  return buildNotetakerDownloads({
    legacyWindowsUrl: env.FOUNDRY_OVERLAY_INSTALLER_URL,
  });
}

export function getNotetakerDownloadHref(platform: NotetakerPlatform = 'windows') {
  const download = getNotetakerDownload(platform);
  return download.remoteUrl || download.localHref;
}

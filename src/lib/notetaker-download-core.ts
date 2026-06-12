import path from 'node:path';

export type NotetakerPlatform = 'windows' | 'macos';

export type NotetakerDownload = {
  platform: NotetakerPlatform;
  label: string;
  buttonLabel: string;
  filename: string;
  localHref: string;
  localPath: string;
  version: string;
  fileType: string;
  requirement: string;
  remoteUrl?: string;
};

export type NotetakerDownloadUrls = {
  windowsUrl?: string;
  legacyWindowsUrl?: string;
  macosUrl?: string;
};

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

export const NOTETAKER_MACOS_DMG_FILENAME =
  `User-Interview-Notetaker-${NOTETAKER_INSTALLER_VERSION}-macOS.dmg`;
export const NOTETAKER_MACOS_DMG_PATH = path.join(
  process.cwd(),
  'desktop',
  'macos',
  'dist',
  NOTETAKER_MACOS_DMG_FILENAME,
);

function trimmed(value: string | undefined) {
  const result = value?.trim();
  return result || undefined;
}

export function buildNotetakerDownload(
  platform: NotetakerPlatform,
  urls: NotetakerDownloadUrls = {},
): NotetakerDownload {
  if (platform === 'macos') {
    return {
      platform,
      label: 'macOS',
      buttonLabel: 'Download for macOS (.dmg)',
      filename: NOTETAKER_MACOS_DMG_FILENAME,
      localHref: '/downloads/notetaker/macos',
      localPath: NOTETAKER_MACOS_DMG_PATH,
      version: NOTETAKER_INSTALLER_VERSION,
      fileType: '.dmg',
      requirement: 'macOS 13 Ventura or later, Apple Silicon or Intel',
      remoteUrl: trimmed(urls.macosUrl),
    };
  }

  return {
    platform,
    label: 'Windows',
    buttonLabel: 'Download for Windows (.exe)',
    filename: NOTETAKER_DOWNLOAD_FILENAME,
    localHref: '/downloads/notetaker/windows',
    localPath: NOTETAKER_INSTALLER_PATH,
    version: NOTETAKER_INSTALLER_VERSION,
    fileType: '.exe',
    requirement: 'Windows 10 build 19041 or Windows 11, 64-bit',
    remoteUrl: trimmed(urls.windowsUrl) || trimmed(urls.legacyWindowsUrl),
  };
}

export function buildNotetakerDownloads(urls: NotetakerDownloadUrls = {}) {
  return [
    buildNotetakerDownload('macos', urls),
    buildNotetakerDownload('windows', urls),
  ] satisfies NotetakerDownload[];
}

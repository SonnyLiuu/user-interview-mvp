import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildNotetakerDownload,
  buildNotetakerDownloads,
} = await import('./notetaker-download-core.ts');

const urls = {
  windowsUrl: 'https://downloads.example.com/notetaker.exe',
  macosUrl: 'https://downloads.example.com/notetaker.dmg',
};

test('returns platform-specific notetaker downloads', () => {
  const downloads = buildNotetakerDownloads(urls);
  assert.deepEqual(downloads.map((download) => download.platform), ['macos', 'windows']);

  const macos = buildNotetakerDownload('macos', urls);
  assert.equal(macos.filename, 'User-Interview-Notetaker-0.1.0-macOS.dmg');
  assert.equal(macos.localHref, '/downloads/notetaker/macos');
  assert.equal(macos.remoteUrl, 'https://downloads.example.com/notetaker.dmg');

  const windows = buildNotetakerDownload('windows', urls);
  assert.equal(windows.filename, 'User-Interview-Notetaker-Setup-0.1.0.exe');
  assert.equal(windows.localHref, '/downloads/notetaker/windows');
  assert.equal(windows.remoteUrl, 'https://downloads.example.com/notetaker.exe');
});

test('windows download falls back to legacy installer URL', () => {
  const windows = buildNotetakerDownload('windows', {
    legacyWindowsUrl: 'https://downloads.example.com/legacy.exe',
  });

  assert.equal(windows.remoteUrl, 'https://downloads.example.com/legacy.exe');
});

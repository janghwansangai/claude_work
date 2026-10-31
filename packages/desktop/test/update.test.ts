import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, macDownloadUrl, shouldAutoCheck, versionFromReleaseUrl } from '../src/update-core';

test('compareVersions orders semantic versions numerically', () => {
  assert.ok(compareVersions('1.1.10', '1.1.9') > 0);
  assert.ok(compareVersions('1.2.0', '1.10.0') < 0);
  assert.equal(compareVersions('v1.1.1', '1.1.1'), 0);
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
});

test('versionFromReleaseUrl reads the desktop tag only', () => {
  assert.equal(versionFromReleaseUrl('https://github.com/janghwansangai/claude_work/releases/tag/desktop-v1.2.0'), '1.2.0');
  assert.equal(versionFromReleaseUrl('https://github.com/x/y/releases/tag/other-v1.2.0'), null);
  assert.equal(versionFromReleaseUrl('https://github.com/x/y/releases'), null);
});

test('macDownloadUrl picks the DMG for the CPU', () => {
  assert.match(macDownloadUrl('1.2.0', 'arm64'), /desktop-v1\.2\.0\/PracticeRecorder-Mac-arm64-1\.2\.0\.dmg$/);
  assert.match(macDownloadUrl('1.2.0', 'x64'), /PracticeRecorder-Mac-x64-1\.2\.0\.dmg$/);
});

test('shouldAutoCheck limits automatic checks to once a day', () => {
  const day = 24 * 60 * 60 * 1000;
  assert.equal(shouldAutoCheck(undefined, 1000), true);
  assert.equal(shouldAutoCheck(1000, 1000 + day - 1), false);
  assert.equal(shouldAutoCheck(1000, 1000 + day), true);
  assert.equal(shouldAutoCheck(5000, 1000), true); // 시계가 뒤로 갔으면 다시 확인
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const configure = require('../app.config.js');
const base = require('../app.json').expo;

test('APK builds allow system installation while Play builds omit its permission', () => {
  const apk = configure({ config: base });
  assert.ok(apk.android.permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES'));
  assert.equal(apk.extra.appUpdates.apkEnabled, true);
  process.env.JULESME_DISTRIBUTION = 'play';
  try {
    const play = configure({ config: base });
    assert.equal(play.extra.appUpdates.apkEnabled, false);
    assert.ok(!play.android.permissions.includes('android.permission.REQUEST_INSTALL_PACKAGES'));
    assert.ok(play.android.blockedPermissions.includes('android.permission.REQUEST_INSTALL_PACKAGES'));
  } finally { delete process.env.JULESME_DISTRIBUTION; }
});

test('OTA is disabled without a real endpoint and configured with a stable channel when supplied', () => {
  assert.equal(configure({ config: base }).updates.enabled, false);
  process.env.JULESME_EAS_PROJECT_ID = '12345678-1234-1234-1234-123456789abc';
  try {
    const configured = configure({ config: base });
    assert.equal(configured.updates.url, 'https://u.expo.dev/12345678-1234-1234-1234-123456789abc');
    assert.equal(configured.updates.enabled, true);
    assert.equal(configured.updates.checkAutomatically, 'NEVER');
    assert.equal(configured.updates.requestHeaders['expo-channel-name'], 'github-production');
    assert.equal(configured.extra.eas.projectId, process.env.JULESME_EAS_PROJECT_ID);
  } finally { delete process.env.JULESME_EAS_PROJECT_ID; }
});

test('invalid update endpoints fail the build instead of silently disabling protection', () => {
  process.env.JULESME_UPDATES_URL = 'http://example.com';
  try { assert.throws(() => configure({ config: base }), /HTTPS/); }
  finally { delete process.env.JULESME_UPDATES_URL; }
});

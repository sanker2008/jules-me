const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeReleaseTag,
  validateReleaseMetadata,
} = require('./release-guard.cjs');

const packageJson = { version: '1.1.9' };
const appJson = {
  expo: {
    version: '1.1.9',
    ios: { buildNumber: '19' },
    android: { package: 'com.sanomni.julesme', versionCode: 19 },
  },
};

test('accepts matching package, Expo, build metadata, and v-prefixed tag', () => {
  assert.equal(normalizeReleaseTag('v1.1.9'), '1.1.9');
  assert.doesNotThrow(() => validateReleaseMetadata({
    packageJson,
    appJson,
    tag: 'v1.1.9',
  }));
});

test('rejects a tag that does not match the packaged application version', () => {
  assert.throws(
    () => validateReleaseMetadata({ packageJson, appJson, tag: '1.1.8' }),
    /tag version 1\.1\.8 does not match package version 1\.1\.9/,
  );
});

test('rejects divergent package and Expo versions', () => {
  assert.throws(
    () => validateReleaseMetadata({
      packageJson,
      appJson: { ...appJson, expo: { ...appJson.expo, version: '1.1.8' } },
    }),
    /Expo version 1\.1\.8 does not match package version 1\.1\.9/,
  );
});

test('rejects missing or invalid native build metadata', () => {
  assert.throws(
    () => validateReleaseMetadata({
      packageJson,
      appJson: {
        expo: {
          ...appJson.expo,
          ios: { buildNumber: '' },
          android: { versionCode: 0 },
        },
      },
    }),
    /iOS buildNumber must be a positive integer string/,
  );
});

test('rejects an anonymous Android application id', () => {
  assert.throws(
    () => validateReleaseMetadata({
      packageJson,
      appJson: {
        expo: {
          ...appJson.expo,
          android: { ...appJson.expo.android, package: 'com.anonymous.julesMe' },
        },
      },
    }),
    /Android package must be com\.sanomni\.julesme/,
  );
});

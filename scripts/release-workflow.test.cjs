const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/release-apk.yml'),
  'utf8',
);

test('protects every restored keystore with owner-only permissions', () => {
  const permissionCommands = workflow.match(/chmod 600 release\.keystore/g) ?? [];
  assert.equal(permissionCommands.length, 2);
});

test('strictly verifies AAB integrity and reads its signer certificate', () => {
  assert.match(workflow, /jarsigner -verify -strict -certs[^\n]+"\$aab"/);
  assert.match(workflow, /keytool -printcert -jarfile "\$aab"/);
});

test('rejects the debug certificate and optionally pins the AAB signer SHA-256', () => {
  const debugFingerprint = 'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C';
  const fingerprintOccurrences = workflow.split(debugFingerprint).length - 1;

  assert.equal(fingerprintOccurrences, 2);
  assert.match(workflow, /AAB signer certificate does not match ANDROID_SIGNING_CERT_SHA256/);
});

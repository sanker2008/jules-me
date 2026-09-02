const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(
  path.resolve(__dirname, '../.github/workflows/release-apk.yml'),
  'utf8',
);

test('runs both Android package builds in the protected release environment', () => {
  const protectedBuildJobs = workflow.match(/^    environment: android-release$/gm) ?? [];
  assert.equal(protectedBuildJobs.length, 2);
});

test('uses separate app-signing and upload keystores with owner-only permissions', () => {
  assert.match(workflow, /ANDROID_APP_SIGNING_KEYSTORE_BASE64/);
  assert.match(workflow, /ANDROID_APP_SIGNING_KEYSTORE_PASSWORD/);
  assert.match(workflow, /ANDROID_APP_SIGNING_KEY_ALIAS/);
  assert.match(workflow, /ANDROID_APP_SIGNING_KEY_PASSWORD/);
  assert.match(workflow, /ANDROID_UPLOAD_KEYSTORE_BASE64/);
  assert.match(workflow, /ANDROID_UPLOAD_KEYSTORE_PASSWORD/);
  assert.match(workflow, /ANDROID_UPLOAD_KEY_ALIAS/);
  assert.match(workflow, /ANDROID_UPLOAD_KEY_PASSWORD/);
  assert.match(workflow, /chmod 600 app-signing\.keystore/);
  assert.match(workflow, /chmod 600 upload\.keystore/);
  assert.doesNotMatch(workflow, /\$\{\{ secrets\.ANDROID_KEYSTORE_/);
});

test('strictly verifies AAB integrity and reads its signer certificate', () => {
  assert.match(workflow, /jarsigner -verify -strict -certs -keystore upload\.keystore[^\n]+"\$aab"/);
  assert.match(workflow, /keytool -printcert -jarfile "\$aab"/);
});

test('reads both legacy and signature-scheme-qualified APK certificate output', () => {
  const { extractCertificateSha256 } = require('./extract-apksigner-sha256.cjs');
  const fingerprint = 'C6091B65048D3141BE07C40A6B92BC328B64F9650B293F62DDA2F997DF7973A8';

  assert.equal(
    extractCertificateSha256(`Signer #1 certificate SHA-256 digest: ${fingerprint.toLowerCase()}`),
    fingerprint,
  );
  assert.equal(
    extractCertificateSha256(`V2 Signer: certificate SHA-256 digest: ${fingerprint.toLowerCase()}`),
    fingerprint,
  );
  assert.equal(
    extractCertificateSha256(`V2 Signer: public key SHA-256 digest: ${fingerprint.toLowerCase()}`),
    '',
  );
});

test('rejects the debug certificate and pins each package to the intended signer', () => {
  const debugFingerprint = 'FAC61745DC0903786FB9EDE62A962B399F7348F0BB6F899B8332667591033B9C';
  const fingerprintOccurrences = workflow.split(debugFingerprint).length - 1;

  assert.equal(fingerprintOccurrences, 2);
  assert.match(workflow, /secrets\.ANDROID_APP_SIGNING_CERT_SHA256/);
  assert.match(workflow, /APK signer certificate does not match ANDROID_APP_SIGNING_CERT_SHA256/);
  assert.match(workflow, /secrets\.ANDROID_UPLOAD_CERT_SHA256/);
  assert.match(workflow, /AAB signer certificate does not match ANDROID_UPLOAD_CERT_SHA256/);
  assert.match(workflow, /node scripts\/extract-apksigner-sha256\.cjs/);
  assert.doesNotMatch(workflow, /sed -n 's\/\^Signer #1 certificate SHA-256 digest:/);
});

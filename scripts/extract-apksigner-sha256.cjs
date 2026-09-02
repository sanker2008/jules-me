#!/usr/bin/env node

const fs = require('node:fs');

function extractCertificateSha256(output) {
  const match = output.match(/^.*certificate SHA-256 digest:\s*([0-9a-f:]+)\s*$/im);
  if (!match) {
    return '';
  }

  const fingerprint = match[1].replaceAll(':', '').toUpperCase();
  return /^[0-9A-F]{64}$/.test(fingerprint) ? fingerprint : '';
}

if (require.main === module) {
  process.stdout.write(extractCertificateSha256(fs.readFileSync(0, 'utf8')));
}

module.exports = {
  extractCertificateSha256,
};

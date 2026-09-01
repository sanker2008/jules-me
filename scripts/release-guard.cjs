#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function normalizeReleaseTag(tag) {
  return tag.replace(/^v/, '');
}

function validateReleaseMetadata({ packageJson, appJson, tag }) {
  const packageVersion = packageJson?.version;
  const expoVersion = appJson?.expo?.version;
  const iosBuildNumber = appJson?.expo?.ios?.buildNumber;
  const androidVersionCode = appJson?.expo?.android?.versionCode;
  const androidPackage = appJson?.expo?.android?.package;

  if (typeof packageVersion !== 'string' || !SEMVER_PATTERN.test(packageVersion)) {
    throw new Error(`package version ${String(packageVersion)} must use x.y.z format`);
  }

  if (expoVersion !== packageVersion) {
    throw new Error(`Expo version ${String(expoVersion)} does not match package version ${packageVersion}`);
  }

  if (typeof iosBuildNumber !== 'string' || !/^[1-9]\d*$/.test(iosBuildNumber)) {
    throw new Error('iOS buildNumber must be a positive integer string');
  }

  if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
    throw new Error('Android versionCode must be a positive integer');
  }

  if (androidPackage !== 'com.sanomni.julesme') {
    throw new Error('Android package must be com.sanomni.julesme');
  }

  if (tag) {
    const tagVersion = normalizeReleaseTag(tag);
    if (tagVersion !== packageVersion) {
      throw new Error(`tag version ${tagVersion} does not match package version ${packageVersion}`);
    }
  }
}

function run() {
  const repositoryRoot = path.resolve(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
  const appJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'app.json'), 'utf8'));
  const tag = process.env.GITHUB_REF?.startsWith('refs/tags/')
    ? process.env.GITHUB_REF_NAME
    : undefined;

  validateReleaseMetadata({ packageJson, appJson, tag });
  process.stdout.write(`Release metadata is consistent for ${packageJson.version}.\n`);
}

module.exports = {
  normalizeReleaseTag,
  validateReleaseMetadata,
};

if (require.main === module) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

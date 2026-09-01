const RELEASE_SIGNING_MARKER = '// JULESME_RELEASE_SIGNING';

function configureAndroidReleaseSigning(buildGradle) {
  if (buildGradle.includes(RELEASE_SIGNING_MARKER)) {
    return buildGradle;
  }

  const signingConfigsPattern = /(\n\s*signingConfigs\s*\{\s*\n)(\s*)(debug\s*\{)/;
  const signingConfigsMatch = buildGradle.match(signingConfigsPattern);
  const releaseBuildTypePattern = /(\n\s*release\s*\{\s*\n)((?:\s*\/\/[^\n]*\n)*)(\s*)signingConfig signingConfigs\.debug/;

  if (!signingConfigsMatch || !releaseBuildTypePattern.test(buildGradle)) {
    throw new Error('could not locate Expo Android signing configuration');
  }

  const indentation = signingConfigsMatch[2];
  const releaseSigningConfig = `${indentation}release {
${indentation}    ${RELEASE_SIGNING_MARKER}
${indentation}    def keystorePath = System.getenv('ANDROID_KEYSTORE_PATH')
${indentation}    def keystorePassword = System.getenv('ANDROID_KEYSTORE_PASSWORD')
${indentation}    def releaseKeyAlias = System.getenv('ANDROID_KEY_ALIAS')
${indentation}    def releaseKeyPassword = System.getenv('ANDROID_KEY_PASSWORD')
${indentation}    def releaseTaskRequested = gradle.startParameter.taskNames.any { taskName -> taskName.toLowerCase().contains('release') }
${indentation}    def signingValuesMissing = [keystorePath, keystorePassword, releaseKeyAlias, releaseKeyPassword].any { value -> value == null || value.isEmpty() }
${indentation}    if (releaseTaskRequested && signingValuesMissing) {
${indentation}        throw new GradleException('Android release signing environment is incomplete')
${indentation}    }
${indentation}    if (!signingValuesMissing) {
${indentation}        storeFile file(keystorePath)
${indentation}        storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
${indentation}        keyAlias System.getenv('ANDROID_KEY_ALIAS')
${indentation}        keyPassword System.getenv('ANDROID_KEY_PASSWORD')
${indentation}    }
${indentation}}
${indentation}`;

  const withReleaseSigningConfig = buildGradle.replace(
    signingConfigsPattern,
    `$1${releaseSigningConfig}$3`,
  );

  return withReleaseSigningConfig.replace(
    releaseBuildTypePattern,
    '$1$2$3signingConfig signingConfigs.release',
  );
}

module.exports = { configureAndroidReleaseSigning };

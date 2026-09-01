const assert = require('node:assert/strict');
const test = require('node:test');

const { configureAndroidReleaseSigning } = require('./android-release-signing.cjs');

const generatedBuildGradle = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableProguardInReleaseBuilds = (findProperty('android.enableProguardInReleaseBuilds') ?: false).toBoolean()
        }
    }
}
`;

test('adds an environment-backed release signing config and removes debug signing from release', () => {
  const configured = configureAndroidReleaseSigning(generatedBuildGradle);

  assert.match(configured, /release \{[\s\S]*?def keystorePath = System\.getenv\('ANDROID_KEYSTORE_PATH'\)/);
  assert.match(configured, /gradle\.startParameter\.taskNames\.any \{ taskName -> taskName\.toLowerCase\(\)\.contains\('release'\) \}/);
  assert.match(configured, /if \(releaseTaskRequested && signingValuesMissing\)/);
  assert.match(configured, /if \(!signingValuesMissing\) \{[\s\S]*?storeFile file\(keystorePath\)/);
  assert.match(configured, /storePassword System\.getenv\('ANDROID_KEYSTORE_PASSWORD'\)/);
  assert.match(configured, /keyAlias System\.getenv\('ANDROID_KEY_ALIAS'\)/);
  assert.match(configured, /keyPassword System\.getenv\('ANDROID_KEY_PASSWORD'\)/);
  assert.match(configured, /buildTypes \{[\s\S]*?release \{\s+(?:\/\/[^\n]*\s+)*signingConfig signingConfigs\.release/);
  assert.doesNotMatch(configured, /release \{\s+(?:\/\/[^\n]*\s+)*signingConfig signingConfigs\.debug/);
});

test('keeps local debug configuration possible without release signing environment variables', () => {
  const configured = configureAndroidReleaseSigning(generatedBuildGradle);

  assert.doesNotMatch(
    configured,
    /if \(\[keystorePath, keystorePassword, releaseKeyAlias, releaseKeyPassword\]\.any[^)]*\) \{\s*throw/,
  );
  assert.match(configured, /if \(releaseTaskRequested && signingValuesMissing\) \{\s*throw new GradleException/);
});

test('is idempotent when Expo evaluates the config plugin more than once', () => {
  const configured = configureAndroidReleaseSigning(generatedBuildGradle);
  assert.equal(configureAndroidReleaseSigning(configured), configured);
});

test('fails closed if the expected Expo Gradle structure is absent', () => {
  assert.throws(
    () => configureAndroidReleaseSigning('android { }'),
    /could not locate Expo Android signing configuration/,
  );
});

const { withAppBuildGradle } = require('expo/config-plugins');
const { configureAndroidReleaseSigning } = require('./android-release-signing.cjs');

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== 'groovy') {
      throw new Error('JulesMe Android release signing supports Groovy build.gradle only');
    }

    modConfig.modResults.contents = configureAndroidReleaseSigning(
      modConfig.modResults.contents,
    );
    return modConfig;
  });
};

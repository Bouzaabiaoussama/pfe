const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

const withMinSdk = (config) => {
  config = withProjectBuildGradle(config, ({ modResults, ...config }) => {
    modResults.contents = modResults.contents.replace(
      /minSdkVersion\s*=\s*\d+/g,
      'minSdkVersion = 26'
    );
    return { modResults, ...config };
  });

  config = withAppBuildGradle(config, ({ modResults, ...config }) => {
    modResults.contents = modResults.contents.replace(
      /minSdkVersion\s+\d+/g,
      'minSdkVersion 26'
    );
    return { modResults, ...config };
  });

  return config;
};

module.exports = withMinSdk;
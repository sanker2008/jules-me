// These public settings must be identical when building a binary and publishing its OTA updates.
module.exports = ({ config }) => {
  const distribution = process.env.JULESME_DISTRIBUTION || 'github';
  if (!['github', 'play'].includes(distribution)) throw new Error('Unknown JULESME_DISTRIBUTION');
  const apkEnabled = distribution === 'github';
  const projectId = process.env.JULESME_EAS_PROJECT_ID || config.extra?.eas?.projectId;
  if (projectId && !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(projectId)) {
    throw new Error('JULESME_EAS_PROJECT_ID must be a UUID');
  }
  const updateUrl = process.env.JULESME_UPDATES_URL || config.updates?.url
    || (projectId ? `https://u.expo.dev/${projectId}` : undefined);
  if (updateUrl) {
    const url = new URL(updateUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error('Updates URL must use HTTPS without credentials or a fragment');
    }
  }
  const permission = 'android.permission.REQUEST_INSTALL_PACKAGES';
  const permissions = (config.android?.permissions || []).filter(value => value !== permission);
  return {
    ...config,
    android: {
      ...config.android,
      permissions: apkEnabled ? [...permissions, permission] : permissions,
      blockedPermissions: [...(config.android?.blockedPermissions || []).filter(value => value !== permission),
        ...(apkEnabled ? [] : [permission])],
    },
    updates: {
      ...config.updates,
      enabled: Boolean(updateUrl),
      ...(updateUrl ? { url: updateUrl } : {}),
      checkAutomatically: 'NEVER',
      requestHeaders: {
        ...config.updates?.requestHeaders,
        'expo-channel-name': process.env.JULESME_UPDATE_CHANNEL || `${distribution}-production`,
      },
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { ...config.extra?.eas, projectId } } : {}),
      appUpdates: { apkEnabled },
    },
  };
};

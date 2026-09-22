import React, { useState } from 'react';
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createTranslator, useAppLanguage } from '../i18n';
import { useTheme } from '../hooks/use-theme';
import { useAppUpdates } from '../hooks/use-app-updates';
import { RELEASES_URL } from '../utils/app-updates';
import { GradientButton } from './gradient-button';

export function AppUpdateCard() {
  const colors = useTheme();
  const { language } = useAppLanguage();
  const t = createTranslator(language);
  const update = useAppUpdates();
  const [linkFailed, setLinkFailed] = useState(false);
  const busy = update.action !== null;
  const textStyle = [styles.body, { color: colors.textSecondary }];
  const open = async (url: string) => {
    setLinkFailed(false);
    try { await Linking.openURL(url); } catch { setLinkFailed(true); }
  };
  const restart = () => Alert.alert(t('applyUpdate'), t('updateReloadConfirm'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('applyUpdate'), onPress: () => { void update.restart(); } },
  ]);

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{t('appUpdates')}</Text>
      <Text style={textStyle}>{t(Platform.OS === 'web' ? 'updateDescriptionWeb'
        : update.canInstallApk ? 'updateDescriptionApk' : 'updateDescriptionStore')}</Text>

      {update.releaseStatus === 'current' && <Text accessibilityLiveRegion="polite" style={textStyle}>{t('updateApkCurrent')}</Text>}
      {update.releaseStatus === 'error' && <Text accessibilityRole="alert" style={[styles.body, { color: colors.statusFailedText }]}>{t('updateApkError')}</Text>}
      {update.release && (
        <View style={[styles.release, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.subtitle, { color: colors.text }]}>{t('updateNewVersion')} · v{update.release.version}</Text>
          {!!update.release.notes && <Text selectable numberOfLines={8} style={textStyle}>{update.release.notes}</Text>}
          {update.canInstallApk && (update.release.apk ? (
            <>
              <Text style={textStyle}>{update.release.apk.name} · {(update.release.apk.size / 1024 / 1024).toFixed(1)} MB</Text>
              {update.apkUri && <Text style={textStyle}>{t('updateApkReady')}</Text>}
              <GradientButton
                title={t(update.apkUri ? 'updateInstallApk' : 'updateDownloadApk')}
                disabled={busy}
                onPress={() => { void (update.apkUri ? update.install() : update.fetchApk()); }}
              />
            </>
          ) : <Text style={textStyle}>{t('updateNoApk')}</Text>)}
        </View>
      )}

      {update.action === 'downloading' && (
        <View style={styles.stack}>
          <Text accessibilityLiveRegion="polite" style={textStyle}>{t('updateDownloading')} {Math.round(update.progress * 100)}%</Text>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(update.progress * 100) }} style={[styles.track, { backgroundColor: colors.backgroundElement }]}>
            <View style={[styles.fill, { width: `${Math.round(update.progress * 100)}%`, backgroundColor: colors.accent }]} />
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={update.cancelDownload} style={styles.link}>
            <Text style={{ color: colors.brand }}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {Platform.OS !== 'web' && (
        <View style={styles.stack}>
          <Text style={[styles.subtitle, { color: colors.text }]}>{t('updateOtaLabel')}</Text>
          <Text accessibilityLiveRegion="polite" style={textStyle}>{t(!update.otaEnabled ? 'updateOtaDisabled'
            : update.otaReady ? 'updateReady' : update.otaStatus === 'error' ? 'updateOtaError'
              : update.otaStatus === 'available' ? 'updateOtaAvailable' : update.otaStatus === 'current' ? 'updateOtaCurrent' : 'updateDefaultDescription')}</Text>
          {update.otaEnabled && (update.otaReady || update.otaStatus === 'available') && (
            <GradientButton disabled={busy} title={t(update.otaReady ? 'applyUpdate' : 'updateDownloadOta')}
              onPress={() => { if (update.otaReady) restart(); else void update.fetchOta(); }} />
          )}
        </View>
      )}

      {update.feedback && <Text accessibilityLiveRegion="polite" style={textStyle}>{t(update.feedback)}</Text>}
      {update.feedback === 'updateInstallPermission' && <GradientButton disabled={busy} title={t('updatePermissionButton')} onPress={() => { void update.grantPermission(); }} />}
      {(update.releaseEnabled || update.otaEnabled) && (
        <GradientButton title={t('checkAppUpdate')} disabled={busy} loading={busy}
          loadingText={t(update.action === 'checking' ? 'updateChecking' : 'updateWorking')}
          onPress={() => { void update.check(); }} />
      )}
      {Platform.OS === 'android' && !update.releaseEnabled && (
        <TouchableOpacity accessibilityRole="link" style={styles.link} onPress={() => { void open('https://play.google.com/store/apps/details?id=com.sanomni.julesme'); }}>
          <Text style={{ color: colors.brand }}>{t('updateOpenStore')}</Text>
        </TouchableOpacity>
      )}
      {update.releaseEnabled && <TouchableOpacity accessibilityRole="link" style={styles.link} onPress={() => { void open(update.release?.url ?? RELEASES_URL); }}>
        <Text style={{ color: colors.brand }}>{t('updateViewRelease')}</Text>
      </TouchableOpacity>}
      {linkFailed && <Text accessibilityRole="alert" style={textStyle}>{t('updateGenericError')}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 18, gap: 12 },
  title: { fontSize: 16, fontWeight: '800' },
  subtitle: { fontSize: 14, fontWeight: '700' },
  body: { fontSize: 13, lineHeight: 20 },
  release: { padding: 16, borderRadius: 8, gap: 12 },
  stack: { gap: 8 },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
});

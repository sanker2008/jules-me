import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { AppRelease, checkRelease } from '../utils/app-updates';
import { canInstallApk, downloadApk, installApk, openInstallPermission } from '../services/apk-update';

type SourceStatus = 'idle' | 'current' | 'available' | 'error';
type Action = 'checking' | 'downloading' | 'installing' | 'fetching' | 'restarting' | null;
export type UpdateFeedback = 'updateDownloadError' | 'updateInstallError' | 'updateInstallPermission'
  | 'updateInstallerOpened' | 'updateDownloadCancelled' | 'updateOtaError' | null;

export function useAppUpdates() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [releaseStatus, setReleaseStatus] = useState<SourceStatus>('idle');
  const [otaStatus, setOtaStatus] = useState<SourceStatus>('idle');
  const [action, setAction] = useState<Action>(null);
  const [feedback, setFeedback] = useState<UpdateFeedback>(null);
  const [progress, setProgress] = useState(0);
  const [apkUri, setApkUri] = useState<string | null>(null);
  const [downloadedOta, setDownloadedOta] = useState(false);
  const { isUpdatePending } = Updates.useUpdates();
  const mounted = useRef(true);
  const busy = useRef(false);
  const downloadController = useRef<AbortController | null>(null);
  const otaEnabled = Platform.OS !== 'web' && Updates.isEnabled;
  const releaseEnabled = canInstallApk || Platform.OS === 'web';
  const version = Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; downloadController.current?.abort(); };
  }, []);

  async function run(nextAction: Action, work: () => Promise<void>, error: UpdateFeedback) {
    if (busy.current) return;
    busy.current = true;
    setAction(nextAction);
    setFeedback(null);
    try { await work(); }
    catch { if (mounted.current) setFeedback(error); }
    finally {
      busy.current = false;
      if (mounted.current) setAction(null);
    }
  }

  async function check() {
    await run('checking', async () => {
      // Keep successful results from either source even when the other is offline.
      await Promise.all([
        releaseEnabled ? (async () => {
          try {
            const next = await checkRelease(version, Device.supportedCpuArchitectures);
            if (!mounted.current) return;
            setRelease(next);
            setReleaseStatus(next ? 'available' : 'current');
            setApkUri(null);
          } catch { if (mounted.current) setReleaseStatus('error'); }
        })() : Promise.resolve(),
        otaEnabled ? (async () => {
          try {
            const next = await Updates.checkForUpdateAsync();
            if (mounted.current) setOtaStatus(next.isAvailable || next.isRollBackToEmbedded ? 'available' : 'current');
          } catch { if (mounted.current) setOtaStatus('error'); }
        })() : Promise.resolve(),
      ]);
    }, null);
  }

  async function fetchApk() {
    const apk = release?.apk;
    if (!apk || !canInstallApk) return;
    await run('downloading', async () => {
      const controller = new AbortController();
      downloadController.current = controller;
      setProgress(0);
      try {
        const uri = await downloadApk(apk, controller.signal, value => {
          if (mounted.current) setProgress(value);
        });
        if (mounted.current) setApkUri(uri);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        if (mounted.current) setFeedback('updateDownloadCancelled');
      } finally { downloadController.current = null; }
    }, 'updateDownloadError');
  }

  async function install() {
    if (!apkUri) return;
    await run('installing', async () => {
      const result = await installApk(apkUri);
      if (mounted.current) setFeedback(result === 'permission' ? 'updateInstallPermission' : 'updateInstallerOpened');
    }, 'updateInstallError');
  }

  async function grantPermission() {
    await run('installing', async () => {
      await openInstallPermission();
      if (mounted.current) setFeedback('updateInstallPermission');
    }, 'updateInstallError');
  }

  async function fetchOta() {
    await run('fetching', async () => {
      const result = await Updates.fetchUpdateAsync();
      if (!result.isNew && !result.isRollBackToEmbedded) throw new Error('Update was not downloaded');
      if (mounted.current) setDownloadedOta(true);
    }, 'updateOtaError');
  }

  async function restart() {
    await run('restarting', () => Updates.reloadAsync(), 'updateOtaError');
  }

  return {
    release, releaseStatus, otaStatus, action, feedback, progress, apkUri,
    otaReady: downloadedOta || isUpdatePending, otaEnabled, releaseEnabled,
    canInstallApk, check, fetchApk, install, grantPermission, fetchOta, restart,
    cancelDownload: () => downloadController.current?.abort(),
  };
}

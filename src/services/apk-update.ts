import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as IntentLauncher from 'expo-intent-launcher';
import { ApkAsset, MAX_APK_BYTES, verifyApk } from '../utils/app-updates';

export const canInstallApk = Platform.OS === 'android'
  && Application.applicationId === 'com.sanomni.julesme'
  && Constants.expoConfig?.extra?.appUpdates?.apkEnabled === true;

let downloading = false;

/** The APK stays in private cache; only the system installer receives read access. */
export async function downloadApk(asset: ApkAsset, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<string> {
  // Also guard across settings-screen unmounts while a previous cancellation is settling.
  if (downloading) throw new Error('Another APK download is still running');
  downloading = true;
  try { return await downloadVerifiedApk(asset, signal, onProgress); }
  finally { downloading = false; }
}

async function downloadVerifiedApk(asset: ApkAsset, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<string> {
  if (!canInstallApk || !FileSystem.cacheDirectory) throw new Error('APK updates unavailable');
  const directory = `${FileSystem.cacheDirectory}app-updates/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  // Keep at most one update. Never remove the user's documents or preferences.
  for (const name of await FileSystem.readDirectoryAsync(directory)) {
    await FileSystem.deleteAsync(`${directory}${name}`, { idempotent: true });
  }
  const uri = `${directory}${asset.name}`;
  let oversized = false;
  const download = FileSystem.createDownloadResumable(asset.url, uri, {}, progress => {
    if (progress.totalBytesWritten > asset.size || progress.totalBytesWritten > MAX_APK_BYTES) {
      oversized = true;
      void download.cancelAsync().catch(() => {});
    }
    onProgress(Math.min(1, progress.totalBytesWritten / asset.size));
  });
  const cancel = () => { void download.cancelAsync().catch(() => {}); };
  signal.addEventListener('abort', cancel);
  // A stalled connection must not leave the update button busy indefinitely.
  const timeout = setTimeout(cancel, 5 * 60 * 1000);
  try {
    if (signal.aborted) throw new Error('Download cancelled');
    const result = await download.downloadAsync();
    if (signal.aborted || oversized || !result || result.status !== 200) throw new Error('Download failed');
    const file = new File(uri);
    if (file.size !== asset.size) throw new Error('APK size mismatch');
    const hash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
    const sha256 = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    verifyApk(asset, file.size, sha256);
    if (signal.aborted) throw new Error('Download cancelled');
    return uri;
  } catch (error) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}

export async function installApk(uri: string): Promise<'permission' | 'opened'> {
  if (!canInstallApk || !FileSystem.cacheDirectory || !uri.startsWith(`${FileSystem.cacheDirectory}app-updates/`)) {
    throw new Error('APK updates unavailable');
  }
  if (!(await Device.isSideLoadingEnabledAsync())) return 'permission';
  const contentUri = await FileSystem.getContentUriAsync(uri);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
  // Returning from the installer also covers cancellation; never report installation success here.
  return 'opened';
}

export async function openInstallPermission(): Promise<void> {
  if (!canInstallApk) throw new Error('APK updates unavailable');
  await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
    data: `package:${Application.applicationId}`,
  });
}

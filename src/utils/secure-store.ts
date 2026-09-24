import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_KEY_KEY = 'JULES_API_KEY';

/**
 * On Android, expo-secure-store encrypts values with an AES key held in
 * Android Keystore.  When a sideloaded APK upgrade causes the Keystore key
 * to become invalid (device-specific behavior), the encrypted SharedPreferences
 * entry is still present but can no longer be decrypted — so getItemAsync
 * either throws or returns null.
 *
 * To survive this, we keep a plaintext backup in the app-private
 * `files/` directory (Context.getFilesDir()).  This directory persists
 * across APK upgrades as long as the package name and signing key are
 * unchanged.  Because the API key is already transmitted in cleartext HTTP
 * headers, storing it in a private-mode file adds no additional risk.
 *
 * Read priority:  SecureStore → file backup.
 * Write:          SecureStore + file backup (best-effort for each).
 */

// ── File-based backup (Android only) ────────────────────────────

let _backupDir: string | undefined;

function getBackupDir(): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  if (_backupDir) return _backupDir;
  try {
    // expo-file-system's documentDirectory points to the app's private
    // files directory which survives APK upgrades.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    if (FileSystem.documentDirectory) {
      _backupDir = FileSystem.documentDirectory;
    }
  } catch {
    // expo-file-system might not be installed — fall back to SecureStore only.
  }
  return _backupDir;
}

const BACKUP_FILENAME = '.api-key';

async function writeBackup(key: string): Promise<void> {
  const dir = getBackupDir();
  if (!dir) return;
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    await FileSystem.writeAsStringAsync(`${dir}${BACKUP_FILENAME}`, key);
  } catch {
    // Best-effort; never let backup failures disrupt the main flow.
  }
}

async function readBackup(): Promise<string | null> {
  const dir = getBackupDir();
  if (!dir) return null;
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const uri = `${dir}${BACKUP_FILENAME}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return null;
    return await FileSystem.readAsStringAsync(uri);
  } catch {
    return null;
  }
}

async function deleteBackup(): Promise<void> {
  const dir = getBackupDir();
  if (!dir) return;
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    await FileSystem.deleteAsync(`${dir}${BACKUP_FILENAME}`, { idempotent: true });
  } catch {
    // Ignore.
  }
}

// ── Public API ───────────────────────────────────────────────────

export async function saveApiKey(key: string) {
  try {
    if (Platform.OS === 'web') {
      if (!key) {
        localStorage.removeItem(API_KEY_KEY);
        return;
      }
      localStorage.setItem(API_KEY_KEY, key);
      return;
    }
    if (!key) {
      await SecureStore.deleteItemAsync(API_KEY_KEY);
      await deleteBackup();
      return;
    }
    await SecureStore.setItemAsync(API_KEY_KEY, key);
    // Write the file backup after SecureStore succeeds.
    await writeBackup(key);
  } catch (e) {
    console.error('Failed to save API key:', e);
  }
}

export async function getApiKey() {
  try {
    if (Platform.OS === 'web') {
      return localStorage.getItem(API_KEY_KEY);
    }

    // Primary: try SecureStore.
    let value: string | null = null;
    try {
      value = await SecureStore.getItemAsync(API_KEY_KEY);
    } catch (secureStoreError) {
      console.warn('SecureStore read failed (Keystore key may be invalid after APK upgrade):', secureStoreError);
    }

    if (value) return value;

    // Fallback: try file backup.
    const backup = await readBackup();
    if (backup) {
      // Re-persist into SecureStore so the next read is fast.
      try {
        await SecureStore.setItemAsync(API_KEY_KEY, backup);
      } catch {
        // If SecureStore is truly broken we'll keep using the backup.
      }
      return backup;
    }

    return null;
  } catch (e) {
    console.error('Failed to read API key:', e);
    return null;
  }
}

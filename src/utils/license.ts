import * as SecureStore from 'expo-secure-store';

import type { ProState } from '../types/pro';
import {
  activateLicenseWithDependencies,
  createFreeProState,
  isSafeHttpsUrl,
  type ProLicenseActivationResult,
  resolveStoredProState,
} from './license-state';

export const PRO_STORAGE_KEY = 'julesme_pro_license_v1';
const DEVICE_ID_STORAGE_KEY = 'julesme_device_id_v1';
const configuredLicenseEndpoint = process.env.EXPO_PUBLIC_LICENSE_VERIFY_ENDPOINT?.trim();
export const LICENSE_VERIFY_ENDPOINT = isSafeHttpsUrl(configuredLicenseEndpoint) ? configuredLicenseEndpoint : '';
export const PRO_PURCHASE_URL = process.env.EXPO_PUBLIC_PRO_PURCHASE_URL?.trim() ?? '';
export const IS_PRO_ACTIVATION_AVAILABLE = isSafeHttpsUrl(LICENSE_VERIFY_ENDPOINT);
export const IS_PRO_PURCHASE_AVAILABLE = isSafeHttpsUrl(PRO_PURCHASE_URL);

const isWeb = process.env.EXPO_OS === 'web';

function getWebStorage(): Storage | null {
  if (!isWeb || typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage;
}

async function getStoredValue(key: string): Promise<string | null> {
  const webStorage = getWebStorage();
  if (webStorage) return webStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function setStoredValue(key: string, value: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function removeStoredValue(key: string): Promise<void> {
  const webStorage = getWebStorage();
  if (webStorage) {
    webStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function getOrCreatePersistentDeviceId(): Promise<string> {
  const savedDeviceId = await getStoredValue(DEVICE_ID_STORAGE_KEY);
  if (savedDeviceId) return savedDeviceId;

  const deviceId = `${process.env.EXPO_OS ?? 'native'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await setStoredValue(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    return await getOrCreatePersistentDeviceId();
  } catch (error) {
    console.warn('Failed to persist the JulesMe device identifier:', error);
    return `native-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export async function loadSavedProState(): Promise<ProState> {
  const deviceId = await getOrCreateDeviceId();

  try {
    const raw = await getStoredValue(PRO_STORAGE_KEY);
    if (!raw) return createFreeProState(deviceId);

    const resolved = resolveStoredProState(JSON.parse(raw), deviceId);
    if (resolved.shouldClearStorage) {
      await removeStoredValue(PRO_STORAGE_KEY);
    }
    return resolved.state;
  } catch (error) {
    console.warn('Failed to read the JulesMe Pro state:', error);
    try {
      await removeStoredValue(PRO_STORAGE_KEY);
    } catch {
      // The safe Free fallback above is still valid when storage is unavailable.
    }
    return createFreeProState(deviceId);
  }
}

export async function activateLicenseKey(licenseKey: string): Promise<ProLicenseActivationResult> {
  return activateLicenseWithDependencies(licenseKey, {
    endpoint: LICENSE_VERIFY_ENDPOINT,
    fetchImpl: fetch,
    getDeviceId: getOrCreatePersistentDeviceId,
    persistState: state => setStoredValue(PRO_STORAGE_KEY, JSON.stringify(state)),
    platform: process.env.EXPO_OS ?? 'native',
  });
}

export async function clearSavedProState(): Promise<void> {
  await removeStoredValue(PRO_STORAGE_KEY);
}

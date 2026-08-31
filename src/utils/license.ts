import * as SecureStore from 'expo-secure-store';

import type { LicenseActivationResult, LicensePayload, ProState } from '../types/pro';
import {
  createFreeProState,
  DEFAULT_MAX_DEVICES,
  normalizeLicenseKey,
  resolveStoredProState,
} from './license-state';

export const PRO_STORAGE_KEY = 'julesme_pro_license_v1';
const DEVICE_ID_STORAGE_KEY = 'julesme_device_id_v1';
export const LICENSE_VERIFY_ENDPOINT = process.env.EXPO_PUBLIC_LICENSE_VERIFY_ENDPOINT?.trim()
  || 'https://api.julesme.com/v1/license/verify';

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

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const savedDeviceId = await getStoredValue(DEVICE_ID_STORAGE_KEY);
    if (savedDeviceId) return savedDeviceId;

    const deviceId = `${process.env.EXPO_OS ?? 'native'}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await setStoredValue(DEVICE_ID_STORAGE_KEY, deviceId);
    return deviceId;
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

function parseLicensePayload(value: unknown): LicensePayload | null {
  if (!value || typeof value !== 'object') return null;

  const license = value as Record<string, unknown>;
  const expiresAt = license.expiresAt;
  const maxDevices = license.maxDevices;
  const tier = license.tier === 'pro_monthly' || license.tier === 'pro_lifetime'
    ? license.tier
    : typeof expiresAt === 'number'
      ? 'pro_monthly'
      : 'pro_lifetime';

  if (
    typeof license.key !== 'string'
    || !normalizeLicenseKey(license.key)
    || typeof license.issuedAt !== 'number'
    || !Number.isFinite(license.issuedAt)
    || (expiresAt !== null && (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)))
    || (tier === 'pro_monthly' && typeof expiresAt !== 'number')
    || (tier === 'pro_lifetime' && expiresAt !== null)
    || (license.email !== undefined && typeof license.email !== 'string')
    || (maxDevices !== undefined && (typeof maxDevices !== 'number' || !Number.isInteger(maxDevices) || maxDevices <= 0))
  ) {
    return null;
  }

  return {
    key: normalizeLicenseKey(license.key),
    ...(typeof license.email === 'string' ? { email: license.email } : {}),
    tier,
    issuedAt: license.issuedAt,
    expiresAt,
    maxDevices: typeof maxDevices === 'number' ? maxDevices : DEFAULT_MAX_DEVICES,
  };
}

async function readResponseBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function activateLicenseKey(licenseKey: string): Promise<LicenseActivationResult> {
  const key = normalizeLicenseKey(licenseKey);
  if (!key) return { success: false, error: 'empty_key' };

  const deviceId = await getOrCreateDeviceId();

  try {
    const response = await fetch(LICENSE_VERIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceId, platform: process.env.EXPO_OS ?? 'native' }),
    });
    const data = await readResponseBody(response);

    if (!response.ok || data?.valid !== true) {
      const message = typeof data?.message === 'string' ? data.message : undefined;
      return { success: false, error: 'invalid_license', message };
    }

    const license = parseLicensePayload(data.license);
    if (!license) return { success: false, error: 'invalid_response' };
    if (license.expiresAt !== null && license.expiresAt <= Date.now()) {
      return { success: false, error: 'expired_license' };
    }

    const state: ProState = {
      isPro: true,
      tier: license.tier,
      license,
      deviceId,
      activatedAt: Date.now(),
    };
    await setStoredValue(PRO_STORAGE_KEY, JSON.stringify(state));
    return { success: true, state };
  } catch (error) {
    console.warn('Failed to verify the JulesMe Pro license:', error);
    return { success: false, error: 'network' };
  }
}

export async function clearSavedProState(): Promise<void> {
  await removeStoredValue(PRO_STORAGE_KEY);
}

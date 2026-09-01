import type { LicensePayload, ProState } from '../types/pro';

export const DEFAULT_LICENSE_TIMEOUT_MS = 10_000;

export type ProLicenseActivationError =
  | 'empty_key'
  | 'invalid_license'
  | 'expired_license'
  | 'invalid_response'
  | 'network'
  | 'timeout'
  | 'storage'
  | 'service_unavailable';

export type ProLicenseActivationResult =
  | { success: true; state: ProState }
  | { success: false; error: ProLicenseActivationError };

interface LicenseActivationDependencies {
  endpoint: string;
  fetchImpl: typeof fetch;
  getDeviceId: () => Promise<string>;
  persistState: (state: ProState) => Promise<void>;
  now?: () => number;
  platform: string;
  timeoutMs?: number;
}

export function createFreeProState(deviceId: string): ProState {
  return { isPro: false, tier: 'free', deviceId, license: null, activatedAt: null };
}

export function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase();
}

export function isSafeHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function maskLicenseKey(value: string): string {
  const key = normalizeLicenseKey(value);
  const parts = key.split('-').filter(Boolean);

  if (parts.length < 2) return '****';
  return `${parts.slice(0, 2).join('-')}-****-${parts.at(-1)}`;
}

export function parseLicensePayload(value: unknown, expectedKey: string): LicensePayload | null {
  if (!value || typeof value !== 'object') return null;

  const license = value as Record<string, unknown>;
  const normalizedExpectedKey = normalizeLicenseKey(expectedKey);
  const normalizedResponseKey = typeof license.key === 'string' ? normalizeLicenseKey(license.key) : '';
  const tier = license.tier;
  const expiresAt = license.expiresAt;
  const hasValidExpiry = tier === 'pro_lifetime'
    ? expiresAt === null
    : tier === 'pro_monthly' && typeof expiresAt === 'number' && Number.isFinite(expiresAt);

  if (
    !normalizedExpectedKey
    || normalizedResponseKey !== normalizedExpectedKey
    || (tier !== 'pro_monthly' && tier !== 'pro_lifetime')
    || typeof license.issuedAt !== 'number'
    || !Number.isFinite(license.issuedAt)
    || typeof license.maxDevices !== 'number'
    || !Number.isInteger(license.maxDevices)
    || license.maxDevices <= 0
    || !hasValidExpiry
    || (license.email !== undefined && typeof license.email !== 'string')
  ) {
    return null;
  }

  return {
    key: normalizedResponseKey,
    ...(typeof license.email === 'string' ? { email: license.email } : {}),
    tier,
    issuedAt: license.issuedAt,
    expiresAt: expiresAt as number | null,
    maxDevices: license.maxDevices,
  };
}

function isValidLicensePayload(value: unknown): value is LicensePayload {
  if (!value || typeof value !== 'object') return false;
  const key = (value as Partial<LicensePayload>).key;
  return typeof key === 'string' && parseLicensePayload(value, key) !== null;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}

async function readResponseBody(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function activateLicenseWithDependencies(
  licenseKey: string,
  dependencies: LicenseActivationDependencies,
): Promise<ProLicenseActivationResult> {
  const key = normalizeLicenseKey(licenseKey);
  if (!key) return { success: false, error: 'empty_key' };
  if (!dependencies.endpoint.trim()) return { success: false, error: 'service_unavailable' };

  let deviceId: string;
  try {
    deviceId = await dependencies.getDeviceId();
  } catch {
    return { success: false, error: 'storage' };
  }

  const controller = new AbortController();
  const timeoutMs = typeof dependencies.timeoutMs === 'number'
    && Number.isFinite(dependencies.timeoutMs)
    && dependencies.timeoutMs > 0
    ? dependencies.timeoutMs
    : DEFAULT_LICENSE_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let data: Record<string, unknown> | null;

  try {
    response = await dependencies.fetchImpl(dependencies.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, deviceId, platform: dependencies.platform }),
      signal: controller.signal,
    });
    data = await readResponseBody(response);
  } catch (error) {
    if (controller.signal.aborted || isAbortError(error)) {
      return { success: false, error: 'timeout' };
    }
    return { success: false, error: 'network' };
  } finally {
    clearTimeout(timeout);
  }

  if (!data) return { success: false, error: 'invalid_response' };
  if (!response.ok) {
    return {
      success: false,
      error: response.status >= 400 && response.status < 500 ? 'invalid_license' : 'invalid_response',
    };
  }
  if (data.valid === false) return { success: false, error: 'invalid_license' };
  if (data.valid !== true) return { success: false, error: 'invalid_response' };

  const license = parseLicensePayload(data.license, key);
  if (!license) return { success: false, error: 'invalid_response' };

  const currentTime = dependencies.now?.() ?? Date.now();
  if (license.expiresAt !== null && license.expiresAt <= currentTime) {
    return { success: false, error: 'expired_license' };
  }

  const state: ProState = {
    isPro: true,
    tier: license.tier,
    license,
    deviceId,
    activatedAt: currentTime,
  };

  try {
    await dependencies.persistState(state);
  } catch {
    return { success: false, error: 'storage' };
  }

  return { success: true, state };
}

function isValidProState(value: unknown): value is ProState {
  if (!value || typeof value !== 'object') return false;

  const state = value as Partial<ProState>;
  return state.isPro === true
    && (state.tier === 'pro_monthly' || state.tier === 'pro_lifetime')
    && isValidLicensePayload(state.license)
    && state.license.tier === state.tier
    && (state.activatedAt === undefined || state.activatedAt === null || (typeof state.activatedAt === 'number' && Number.isFinite(state.activatedAt)));
}

export function resolveStoredProState(
  savedState: unknown,
  deviceId: string,
  now = Date.now(),
): { state: ProState; shouldClearStorage: boolean } {
  if (!isValidProState(savedState)) {
    return { state: createFreeProState(deviceId), shouldClearStorage: true };
  }

  const license = savedState.license;
  if (!license) {
    return { state: createFreeProState(deviceId), shouldClearStorage: true };
  }

  if (license.expiresAt !== null && license.expiresAt <= now) {
    return { state: createFreeProState(deviceId), shouldClearStorage: true };
  }

  return {
    state: { ...savedState, deviceId },
    shouldClearStorage: false,
  };
}

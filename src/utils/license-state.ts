import type { LicensePayload, ProState } from '../types/pro';

export const DEFAULT_MAX_DEVICES = 3;

export function createFreeProState(deviceId: string): ProState {
  return { isPro: false, tier: 'free', deviceId, license: null, activatedAt: null };
}

export function normalizeLicenseKey(value: string): string {
  return value.trim().toUpperCase();
}

export function maskLicenseKey(value: string): string {
  const key = normalizeLicenseKey(value);
  const parts = key.split('-').filter(Boolean);

  if (parts.length < 2) return '****';
  return `${parts.slice(0, 2).join('-')}-****-${parts.at(-1)}`;
}

function isValidLicensePayload(value: unknown): value is LicensePayload {
  if (!value || typeof value !== 'object') return false;

  const license = value as Partial<LicensePayload>;
  const hasValidExpiry = license.tier === 'pro_lifetime'
    ? license.expiresAt === null
    : typeof license.expiresAt === 'number' && Number.isFinite(license.expiresAt);

  return typeof license.key === 'string'
    && Boolean(normalizeLicenseKey(license.key))
    && (license.tier === 'pro_monthly' || license.tier === 'pro_lifetime')
    && typeof license.issuedAt === 'number'
    && Number.isFinite(license.issuedAt)
    && typeof license.maxDevices === 'number'
    && Number.isInteger(license.maxDevices)
    && license.maxDevices > 0
    && hasValidExpiry
    && (license.email === undefined || typeof license.email === 'string');
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

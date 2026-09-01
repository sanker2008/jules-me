import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activateLicenseWithDependencies,
  createFreeProState,
  isSafeHttpsUrl,
  maskLicenseKey,
  normalizeLicenseKey,
  parseLicensePayload,
  resolveStoredProState,
} from '../src/utils/license-state';
import type { ProState } from '../src/types/pro';

const now = Date.UTC(2026, 7, 28, 12, 0, 0);

test('normalizes license keys and masks only the public suffix', () => {
  assert.equal(normalizeLicenseKey('  jules-pro-8899-abcd-efgh  '), 'JULES-PRO-8899-ABCD-EFGH');
  assert.equal(normalizeLicenseKey('   '), '');
  assert.equal(maskLicenseKey('JULES-PRO-8899-ABCD-EFGH'), 'JULES-PRO-****-EFGH');
  assert.equal(maskLicenseKey('ABCD'), '****');
});

test('accepts only HTTPS service and purchase destinations', () => {
  assert.equal(isSafeHttpsUrl('https://license.example.test/v1/verify'), true);
  assert.equal(isSafeHttpsUrl('http://license.example.test/v1/verify'), false);
  assert.equal(isSafeHttpsUrl('javascript:alert(1)'), false);
  assert.equal(isSafeHttpsUrl('not a URL'), false);
  assert.equal(isSafeHttpsUrl(undefined), false);
});

test('falls back to Free when a saved monthly license has expired', () => {
  const expiredState: ProState = {
    isPro: true,
    tier: 'pro_monthly',
    deviceId: 'android-device-1',
    activatedAt: now - 31 * 24 * 60 * 60 * 1000,
    license: {
      key: 'JULES-PRO-8899-ABCD-EFGH',
      tier: 'pro_monthly',
      issuedAt: now - 31 * 24 * 60 * 60 * 1000,
      expiresAt: now - 1,
      maxDevices: 3,
    },
  };

  assert.deepEqual(resolveStoredProState(expiredState, 'android-device-1', now), {
    state: createFreeProState('android-device-1'),
    shouldClearStorage: true,
  });
});

test('keeps an unexpired monthly license and normalizes its device identity', () => {
  const monthlyState: ProState = {
    isPro: true,
    tier: 'pro_monthly',
    deviceId: 'stale-device-id',
    activatedAt: now - 10,
    license: {
      key: 'JULES-PRO-8899-ABCD-EFGH',
      tier: 'pro_monthly',
      issuedAt: now - 10,
      expiresAt: now + 1,
      maxDevices: 3,
    },
  };

  assert.deepEqual(resolveStoredProState(monthlyState, 'ios-device-1', now), {
    state: { ...monthlyState, deviceId: 'ios-device-1' },
    shouldClearStorage: false,
  });
});

test('keeps a valid perpetual license without an expiry date', () => {
  const lifetimeState: ProState = {
    isPro: true,
    tier: 'pro_lifetime',
    deviceId: 'android-device-1',
    activatedAt: now,
    license: {
      key: 'JULES-PRO-8899-ABCD-EFGH',
      tier: 'pro_lifetime',
      issuedAt: now,
      expiresAt: null,
      maxDevices: 3,
    },
  };

  assert.deepEqual(resolveStoredProState(lifetimeState, 'android-device-1', now), {
    state: lifetimeState,
    shouldClearStorage: false,
  });
});

test('rejects malformed cached license data instead of granting Pro access', () => {
  const malformedState = {
    isPro: true,
    tier: 'pro_lifetime',
    deviceId: 'android-device-1',
    license: { key: '', tier: 'pro_lifetime', expiresAt: null },
  } as unknown as ProState;

  assert.deepEqual(resolveStoredProState(malformedState, 'android-device-1', now), {
    state: createFreeProState('android-device-1'),
    shouldClearStorage: true,
  });
});

test('rejects cached licenses with inconsistent tiers or invalid device limits', () => {
  const cachedState = {
    isPro: true,
    tier: 'pro_lifetime',
    deviceId: 'android-device-1',
    activatedAt: now,
    license: {
      key: 'JULES-PRO-8899-ABCD-EFGH',
      tier: 'pro_monthly',
      issuedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      maxDevices: 0,
    },
  } as const;

  assert.deepEqual(resolveStoredProState(cachedState, 'android-device-1', now), {
    state: createFreeProState('android-device-1'),
    shouldClearStorage: true,
  });
});

test('requires every license contract field and the submitted License Key', () => {
  const expectedKey = 'JULES-PRO-8899-ABCD-EFGH';
  const validLicense = {
    key: expectedKey,
    tier: 'pro_lifetime',
    issuedAt: now,
    expiresAt: null,
    maxDevices: 3,
  };

  assert.deepEqual(parseLicensePayload(validLicense, expectedKey), validLicense);
  assert.equal(parseLicensePayload({ ...validLicense, key: 'JULES-PRO-OTHER-KEY' }, expectedKey), null);

  const { tier: _tier, ...missingTier } = validLicense;
  assert.equal(parseLicensePayload(missingTier, expectedKey), null);

  const { maxDevices: _maxDevices, ...missingMaxDevices } = validLicense;
  assert.equal(parseLicensePayload(missingMaxDevices, expectedKey), null);
});

test('classifies an activation request timeout separately from network failure', async () => {
  const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError')));
  })) as typeof fetch;

  const result = await activateLicenseWithDependencies('JULES-PRO-8899-ABCD-EFGH', {
    endpoint: 'https://license.example.test/v1/verify',
    fetchImpl,
    getDeviceId: async () => 'test-device',
    persistState: async () => undefined,
    now: () => now,
    platform: 'test',
    timeoutMs: 5,
  });

  assert.deepEqual(result, { success: false, error: 'timeout' });
});

test('classifies a failed fetch as a network error', async () => {
  const result = await activateLicenseWithDependencies('JULES-PRO-8899-ABCD-EFGH', {
    endpoint: 'https://license.example.test/v1/verify',
    fetchImpl: (async () => {
      throw new TypeError('connection refused');
    }) as typeof fetch,
    getDeviceId: async () => 'test-device',
    persistState: async () => undefined,
    now: () => now,
    platform: 'test',
    timeoutMs: 100,
  });

  assert.deepEqual(result, { success: false, error: 'network' });
});

test('classifies a malformed service payload as an invalid response', async () => {
  const result = await activateLicenseWithDependencies('JULES-PRO-8899-ABCD-EFGH', {
    endpoint: 'https://license.example.test/v1/verify',
    fetchImpl: (async () => new Response(JSON.stringify({ valid: true, license: { tier: 'pro_lifetime' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch,
    getDeviceId: async () => 'test-device',
    persistState: async () => undefined,
    now: () => now,
    platform: 'test',
    timeoutMs: 100,
  });

  assert.deepEqual(result, { success: false, error: 'invalid_response' });
});

test('classifies secure storage failure after successful verification', async () => {
  const key = 'JULES-PRO-8899-ABCD-EFGH';
  const fetchImpl = (async () => new Response(JSON.stringify({
    valid: true,
    license: {
      key,
      tier: 'pro_lifetime',
      issuedAt: now,
      expiresAt: null,
      maxDevices: 3,
    },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;

  const result = await activateLicenseWithDependencies(key, {
    endpoint: 'https://license.example.test/v1/verify',
    fetchImpl,
    getDeviceId: async () => 'test-device',
    persistState: async () => {
      throw new Error('SecureStore unavailable');
    },
    now: () => now,
    platform: 'test',
    timeoutMs: 100,
  });

  assert.deepEqual(result, { success: false, error: 'storage' });
});

test('does not call a dead default service when no license endpoint is configured', async () => {
  let fetchCalled = false;

  const result = await activateLicenseWithDependencies('JULES-PRO-8899-ABCD-EFGH', {
    endpoint: '',
    fetchImpl: (async () => {
      fetchCalled = true;
      throw new Error('unexpected request');
    }) as typeof fetch,
    getDeviceId: async () => 'test-device',
    persistState: async () => undefined,
    now: () => now,
    platform: 'test',
    timeoutMs: 100,
  });

  assert.equal(fetchCalled, false);
  assert.deepEqual(result, { success: false, error: 'service_unavailable' });
});

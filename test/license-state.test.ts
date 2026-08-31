import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createFreeProState,
  maskLicenseKey,
  normalizeLicenseKey,
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

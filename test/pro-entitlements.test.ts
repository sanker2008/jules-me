import assert from 'node:assert/strict';
import test from 'node:test';

import type { ProState } from '../src/types/pro';
import { createFreeProState } from '../src/utils/license-state';
import { canAttachProImage } from '../src/utils/pro-entitlements';

const now = Date.UTC(2026, 8, 8);
const monthly: ProState = {
  isPro: true,
  tier: 'pro_monthly',
  deviceId: 'test-device',
  license: {
    key: 'TEST-PRO-IMAGE',
    tier: 'pro_monthly',
    issuedAt: now - 1000,
    expiresAt: now + 1000,
    maxDevices: 3,
  },
};

test('Free and deactivated users cannot attach images', () => {
  assert.equal(canAttachProImage(createFreeProState('test-device'), now), false);
  assert.equal(canAttachProImage({ ...monthly, isPro: false }, now), false);
});

test('monthly image entitlement expires even while the cached Pro flag stays true', () => {
  assert.equal(canAttachProImage(monthly, now), true);
  assert.equal(canAttachProImage(monthly, now + 1000), false);
  assert.equal(canAttachProImage(monthly, now + 2000), false);
});

test('lifetime image entitlement requires a complete valid license', () => {
  const lifetime: ProState = {
    ...monthly,
    tier: 'pro_lifetime',
    license: { ...monthly.license!, tier: 'pro_lifetime', expiresAt: null },
  };
  assert.equal(canAttachProImage(lifetime, now), true);
  assert.equal(canAttachProImage({ ...lifetime, license: null }, now), false);
  assert.equal(canAttachProImage({ ...lifetime, license: monthly.license }, now), false);
});

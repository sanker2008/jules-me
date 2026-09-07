import assert from 'node:assert/strict';
import test from 'node:test';

import { goBackOrHome } from '../src/utils/navigation';

test('goes back when navigation history is available', () => {
  const calls: string[] = [];

  goBackOrHome({
    canGoBack: () => true,
    back: () => { calls.push('back'); },
    replace: path => { calls.push(`replace:${path}`); },
  });

  assert.deepEqual(calls, ['back']);
});

test('returns to the home route when a deep link has no history', () => {
  const calls: string[] = [];

  goBackOrHome({
    canGoBack: () => false,
    back: () => { calls.push('back'); },
    replace: path => { calls.push(`replace:${path}`); },
  });

  assert.deepEqual(calls, ['replace:/']);
});

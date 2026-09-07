import assert from 'node:assert/strict';
import test from 'node:test';

import { validateAndPersistApiKey } from '../src/utils/api-key-settings';

test('persists a trimmed API Key only after Jules accepts it', async () => {
  const validated: string[] = [];
  const persisted: string[] = [];

  const savedKey = await validateAndPersistApiKey(
    '  valid-key  ',
    async key => { validated.push(key); },
    async key => { persisted.push(key); },
  );

  assert.equal(savedKey, 'valid-key');
  assert.deepEqual(validated, ['valid-key']);
  assert.deepEqual(persisted, ['valid-key']);
});

test('does not persist an API Key when Jules rejects validation', async () => {
  const persisted: string[] = [];

  await assert.rejects(
    validateAndPersistApiKey(
      'invalid-key',
      async () => { throw new Error('Unauthorized'); },
      async key => { persisted.push(key); },
    ),
    /Unauthorized/,
  );

  assert.deepEqual(persisted, []);
});

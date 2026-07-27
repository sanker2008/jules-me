import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createImageAttachment,
  encodeJulesResourceId,
  encodeJulesResourcePath,
  getSingleRouteParam,
  isTrustedPullRequestUrl,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from '../src/utils/jules-guards';

test('normalizes only a single non-empty route parameter', () => {
  assert.equal(getSingleRouteParam(' session-123 '), 'session-123');
  assert.equal(getSingleRouteParam(['session-123', 'other']), undefined);
  assert.equal(getSingleRouteParam('   '), undefined);
});

test('encodes only valid Jules resource identifiers and paths', () => {
  assert.equal(encodeJulesResourceId('session_123-abc'), 'session_123-abc');
  assert.equal(encodeJulesResourcePath('sources/repository_123'), 'sources/repository_123');
  assert.throws(() => encodeJulesResourceId('../sessions'), /Invalid Jules resource identifier/);
  assert.throws(() => encodeJulesResourcePath('sources/../sessions'), /Invalid Jules resource path/);
});

test('opens only GitHub HTTPS pull-request destinations', () => {
  assert.equal(isTrustedPullRequestUrl('https://github.com/org/repo/pull/1'), true);
  assert.equal(isTrustedPullRequestUrl('https://www.github.com/org/repo/pull/1'), true);
  assert.equal(isTrustedPullRequestUrl('http://github.com/org/repo/pull/1'), false);
  assert.equal(isTrustedPullRequestUrl('https://github.com.evil.example/org/repo/pull/1'), false);
  assert.equal(isTrustedPullRequestUrl('https://github.com/org/repo/issues/1'), false);
});

test('validates image payload data, media type, and byte size', () => {
  const valid = createImageAttachment({
    uri: 'file:///tmp/task.png',
    base64: 'aGVsbG8=',
    mimeType: 'image/png',
    fileSize: 5,
  });
  assert.deepEqual(valid, {
    attachment: { uri: 'file:///tmp/task.png', data: 'aGVsbG8=', mimeType: 'image/png' },
  });
  assert.deepEqual(createImageAttachment({ uri: 'file:///tmp/task.png', mimeType: 'image/png' }), { error: 'missing-data' });
  assert.deepEqual(createImageAttachment({ uri: 'file:///tmp/task.svg', base64: 'aGVsbG8=', mimeType: 'image/svg+xml' }), { error: 'unsupported-type' });
  assert.deepEqual(createImageAttachment({ uri: 'file:///tmp/task.jpg', base64: 'aGVsbG8=', mimeType: 'image/jpeg', fileSize: MAX_IMAGE_ATTACHMENT_BYTES + 1 }), { error: 'too-large' });
});
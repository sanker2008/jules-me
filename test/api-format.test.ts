import assert from 'node:assert/strict';
import test from 'node:test';

import { formatPromptWithImage } from '../src/services/api';

test('formatPromptWithImage returns original prompt when no image provided', () => {
  assert.equal(formatPromptWithImage('Hello world'), 'Hello world');
  assert.equal(formatPromptWithImage('Hello world', undefined), 'Hello world');
  assert.equal(formatPromptWithImage('Hello world', { data: '', mimeType: 'image/png' }), 'Hello world');
});

test('formatPromptWithImage embeds base64 data URI into prompt string', () => {
  const image = {
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/png',
  };

  const formattedWithPrompt = formatPromptWithImage('Analyze this picture', image);
  assert.ok(formattedWithPrompt.startsWith('Analyze this picture\n\n[User Attached Image]\ndata:image/png;base64,'));
  assert.ok(formattedWithPrompt.includes(image.data));

  const formattedNoPrompt = formatPromptWithImage('', image);
  assert.ok(formattedNoPrompt.startsWith('[User Attached Image]\ndata:image/png;base64,'));
});

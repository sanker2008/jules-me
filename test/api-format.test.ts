import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRequestPollingController,
  formatPromptWithImage,
  getSession,
  getSessionSnapshot,
  JULES_API_REQUEST_TIMEOUT_MS,
  JulesApiError,
} from '../src/services/api';

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

test('request polling waits for completion, does not overlap, and aborts on stop', async () => {
  const scheduled: (() => void)[] = [];
  const cleared: unknown[] = [];
  const pending: { resolve: (keepPolling: boolean) => void; signal: AbortSignal }[] = [];
  let calls = 0;

  const controller = createRequestPollingController({
    intervalMs: 5_000,
    poll: signal => {
      calls += 1;
      return new Promise<boolean>(resolve => pending.push({ resolve, signal }));
    },
    schedule: callback => {
      scheduled.push(callback);
      return callback;
    },
    cancelSchedule: handle => {
      cleared.push(handle);
    },
  });

  controller.start();
  controller.start();
  assert.equal(calls, 1, 'restarting an active poller must not overlap the current request');
  assert.equal(scheduled.length, 0, 'the next poll must not be scheduled before the request settles');

  pending[0].resolve(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(scheduled.length, 1, 'a successful request schedules exactly one delayed follow-up');

  controller.stop();
  assert.deepEqual(cleared, [scheduled[0]], 'stopping must clear a scheduled follow-up');

  controller.start();
  assert.equal(calls, 2);
  controller.stop();
  assert.equal(pending[1].signal.aborted, true, 'stopping must abort an in-flight request');
});

test('session snapshot fetches only the current activity page', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];
  globalThis.fetch = (async input => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.includes('/activities?')) {
      return new Response(JSON.stringify({
        activities: [{ id: 'activity-1', name: 'activities/activity-1', createTime: '2026-08-31T00:00:00Z', originator: 'agent' }],
        nextPageToken: 'older-page',
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: 'session-1',
      name: 'sessions/session-1',
      prompt: 'test',
      sourceContext: { source: 'sources/repo' },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const snapshot = await getSessionSnapshot('api-key', 'session-1');
    assert.equal(requestedUrls.length, 2);
    assert.equal(requestedUrls.filter(url => url.includes('/activities?')).length, 1);
    assert.match(requestedUrls.find(url => url.includes('/activities?')) ?? '', /pageSize=100/);
    assert.equal(snapshot.activityPage.nextPageToken, 'older-page');
    assert.equal(snapshot.activityPage.activities.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('session snapshot requests only activities newer than the last synced timestamp', async () => {
  const originalFetch = globalThis.fetch;
  let activitiesUrl: URL | undefined;
  globalThis.fetch = (async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/activities')) activitiesUrl = url;
    return new Response(JSON.stringify(
      url.pathname.endsWith('/activities')
        ? { activities: [] }
        : {
            id: 'session-1',
            name: 'sessions/session-1',
            prompt: 'test',
            sourceContext: { source: 'sources/repo' },
          },
    ), { status: 200 });
  }) as typeof fetch;

  try {
    await getSessionSnapshot('api-key', 'session-1', {
      activityCreatedAfter: '2026-08-31T01:02:03.000Z',
    });
    assert.equal(
      activitiesUrl?.searchParams.get('filter'),
      'create_time > "2026-08-31T01:02:03.000Z"',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('incremental session snapshot drains every page of new activities', async () => {
  const originalFetch = globalThis.fetch;
  let activityRequests = 0;
  globalThis.fetch = (async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/activities')) {
      activityRequests += 1;
      const pageToken = url.searchParams.get('pageToken');
      return new Response(JSON.stringify(pageToken
        ? {
            activities: [{ id: 'activity-2', name: 'activities/activity-2', createTime: '2026-08-31T01:02:05Z', originator: 'agent' }],
          }
        : {
            activities: [{ id: 'activity-1', name: 'activities/activity-1', createTime: '2026-08-31T01:02:04Z', originator: 'agent' }],
            nextPageToken: 'incremental-page-2',
          }), { status: 200 });
    }
    return new Response(JSON.stringify({
      id: 'session-1',
      name: 'sessions/session-1',
      prompt: 'test',
      sourceContext: { source: 'sources/repo' },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const snapshot = await getSessionSnapshot('api-key', 'session-1', {
      activityCreatedAfter: '2026-08-31T01:02:03Z',
    });
    assert.equal(activityRequests, 2);
    assert.deepEqual(snapshot.activityPage.activities.map(activity => activity.id), [
      'activity-1',
      'activity-2',
    ]);
    assert.equal(snapshot.activityPage.nextPageToken, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Jules requests time out and abort the underlying fetch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalFetch = globalThis.fetch;
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = ((_input, init) => new Promise<Response>((_resolve, reject) => {
    requestSignal = init?.signal ?? undefined;
    requestSignal?.addEventListener('abort', () => reject(requestSignal?.reason), { once: true });
  })) as typeof fetch;

  try {
    const result = getSession('api-key', 'session-1');
    await Promise.resolve();
    t.mock.timers.tick(JULES_API_REQUEST_TIMEOUT_MS);
    await assert.rejects(result, (error: unknown) => {
      assert.ok(error instanceof JulesApiError);
      assert.match(error.message, /timed out/i);
      return true;
    });
    assert.equal(requestSignal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

test('Jules requests clear their timeout after a completed response', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalFetch = globalThis.fetch;
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = (async (_input, init) => {
    requestSignal = init?.signal ?? undefined;
    return new Response(JSON.stringify({
      id: 'session-1',
      name: 'sessions/session-1',
      prompt: 'test',
      sourceContext: { source: 'sources/repo' },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    await getSession('api-key', 'session-1');
    t.mock.timers.tick(JULES_API_REQUEST_TIMEOUT_MS);
    assert.equal(requestSignal?.aborted, false, 'a settled request must not be aborted later');
  } finally {
    globalThis.fetch = originalFetch;
    t.mock.timers.reset();
  }
});

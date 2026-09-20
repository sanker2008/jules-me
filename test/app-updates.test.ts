import assert from 'node:assert/strict';
import test from 'node:test';
import { compareVersions, parseRelease, checkRelease, verifyApk } from '../src/utils/app-updates';

const asset = (abi = 'arm64-v8a') => ({
  name: `JulesMe-v1.2.0-${abi}.apk`,
  browser_download_url: `https://github.com/sanker2008/jules-me/releases/download/v1.2.0/JulesMe-v1.2.0-${abi}.apk`,
  size: 1024,
  digest: `sha256:${'ab'.repeat(32)}`,
});
const release = () => ({ tag_name: 'v1.2.0', draft: false, prerelease: false, body: 'Fixes', assets: [asset()] });

test('compares numeric versions and rejects ambiguous versions', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('v1.2.0', '1.2.0'), 0);
  assert.equal(compareVersions('1.1.19', '1.2.0'), -1);
  for (const bad of ['1.2', '1.2.0-beta', '01.2.0', 'nonsense']) {
    assert.throws(() => compareVersions(bad, '1.0.0'));
  }
});

test('selects the preferred supported ABI and never offers a downgrade', () => {
  const data = { ...release(), assets: [asset('armeabi-v7a'), asset()] };
  assert.equal(parseRelease(data, '1.1.19', ['arm64-v8a', 'armeabi-v7a'])?.apk?.name, asset().name);
  assert.equal(parseRelease(data, '1.2.0', ['arm64-v8a']), null);
  assert.equal(parseRelease(data, '2.0.0', ['arm64-v8a']), null);
  assert.equal(parseRelease(data, '1.0.0', ['x86'])?.apk, null);
  assert.equal(parseRelease(data, '1.0.0', null)?.apk, null);
});

test('rejects drafts, prereleases and malformed release metadata', () => {
  for (const value of [null, {}, { ...release(), draft: true }, { ...release(), prerelease: true }]) {
    assert.throws(() => parseRelease(value, '1.0.0', ['arm64-v8a']));
  }
});

test('never accepts an APK from a different host, repo, tag, or with missing integrity metadata', () => {
  for (const change of [
    { browser_download_url: 'https://evil.example/update.apk' },
    { browser_download_url: asset().browser_download_url.replace('sanker2008', 'someone') },
    { browser_download_url: asset().browser_download_url.replace('/v1.2.0/', '/v1.1.0/') },
    { browser_download_url: asset().browser_download_url + '?redirect=evil' },
    { digest: null }, { digest: 'sha256:abc' }, { size: -1 }, { size: 1e10 },
    { name: 'JulesMe-v1.2.0.aab' },
  ]) {
    assert.equal(parseRelease({ ...release(), assets: [{ ...asset(), ...change }] }, '1.0.0', ['arm64-v8a'])?.apk, null);
  }
});

test('checks HTTP errors instead of claiming the installed app is current', async () => {
  for (const status of [403, 404, 429, 500]) {
    await assert.rejects(checkRelease('1.0.0', [], async () => new Response('{}', { status })));
  }
  const result = await checkRelease('1.0.0', ['arm64-v8a'], async () => Response.json(release()));
  assert.equal(result?.version, '1.2.0');
});

test('rejects incomplete or modified APK bytes before installation', () => {
  const apk = parseRelease(release(), '1.0.0', ['arm64-v8a'])!.apk!;
  assert.doesNotThrow(() => verifyApk(apk, 1024, 'ab'.repeat(32)));
  assert.throws(() => verifyApk(apk, 1023, 'ab'.repeat(32)));
  assert.throws(() => verifyApk(apk, 1024, 'cd'.repeat(32)));
});

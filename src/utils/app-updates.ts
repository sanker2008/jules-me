export const RELEASES_URL = 'https://github.com/sanker2008/jules-me/releases';
const RELEASE_API = 'https://api.github.com/repos/sanker2008/jules-me/releases/latest';
// Bound memory used when hashing downloaded APKs. Current split APKs are about 23 MB.
export const MAX_APK_BYTES = 100 * 1024 * 1024;

export interface ApkAsset {
  name: string;
  url: string;
  size: number;
  sha256: string;
}

export interface AppRelease {
  version: string;
  notes: string;
  url: string;
  apk: ApkAsset | null;
}

function versionParts(version: string): number[] {
  if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Invalid release version');
  }
  const parts = version.replace(/^v/, '').split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid release version');
  return parts;
}

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

export function parseRelease(value: unknown, currentVersion: string, architectures: string[] | null): AppRelease | null {
  const data = record(value);
  if (typeof data.tag_name !== 'string' || data.draft !== false || data.prerelease !== false || !Array.isArray(data.assets)) {
    throw new Error('Invalid stable release');
  }
  if (compareVersions(data.tag_name, currentVersion) <= 0) return null;
  const version = data.tag_name.replace(/^v/, '');
  let apk: ApkAsset | null = null;
  for (const abi of architectures ?? []) {
    if (!['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86'].includes(abi)) continue;
    const name = `JulesMe-v${version}-${abi}.apk`;
    const url = `${RELEASES_URL}/download/${data.tag_name}/${name}`;
    const found = data.assets.map(record).find(asset => asset.name === name
      && asset.browser_download_url === url
      && typeof asset.size === 'number' && Number.isSafeInteger(asset.size)
      && asset.size > 0 && asset.size <= MAX_APK_BYTES
      && typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/.test(asset.digest));
    if (found) {
      apk = { name, url, size: found.size as number, sha256: (found.digest as string).slice(7) };
      break;
    }
  }
  return { version, notes: typeof data.body === 'string' ? data.body.slice(0, 12000) : '', url: `${RELEASES_URL}/tag/${data.tag_name}`, apk };
}

export async function checkRelease(
  currentVersion: string,
  architectures: string[] | null,
  request: typeof fetch = fetch,
): Promise<AppRelease | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await request(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Release check failed: ${response.status}`);
    return parseRelease(await response.json(), currentVersion, architectures);
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyApk(asset: ApkAsset, size: number, sha256: string): void {
  if (size !== asset.size || sha256 !== asset.sha256) throw new Error('APK integrity check failed');
}

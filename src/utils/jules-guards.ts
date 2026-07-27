export type RouteParam = string | string[] | undefined;

export type ImageCandidate = {
  uri: string;
  base64?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type ImageAttachment = {
  uri: string;
  data: string;
  mimeType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp';
};

export type ImageAttachmentResult =
  | { attachment: ImageAttachment; error?: never }
  | { attachment?: never; error: 'missing-data' | 'too-large' | 'unsupported-type' };

export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const supportedImageMimeTypes = new Set<ImageAttachment['mimeType']>([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const resourceIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/;

function inferImageMimeType(uri: string): ImageAttachment['mimeType'] | undefined {
  const extension = uri.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'gif': return 'image/gif';
    case 'jpeg':
    case 'jpg': return 'image/jpeg';
    case 'png': return 'image/png';
    case 'webp': return 'image/webp';
    default: return undefined;
  }
}

function estimateBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

export function getSingleRouteParam(value: RouteParam): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

export function encodeJulesResourceId(value: string): string {
  const normalized = value.trim();
  if (!resourceIdPattern.test(normalized)) throw new Error('Invalid Jules resource identifier.');
  return encodeURIComponent(normalized);
}

export function encodeJulesResourcePath(value: string): string {
  const segments = value.split('/');
  if (segments.length === 0 || segments.some(segment => !resourceIdPattern.test(segment))) {
    throw new Error('Invalid Jules resource path.');
  }
  return segments.map(encodeURIComponent).join('/');
}

export function isTrustedPullRequestUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname === 'github.com' || url.hostname === 'www.github.com')
      && /^\/[^/]+\/[^/]+\/pull\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function createImageAttachment(candidate: ImageCandidate): ImageAttachmentResult {
  const data = candidate.base64?.replace(/\s/g, '');
  if (!data) return { error: 'missing-data' };

  const resolvedMimeType = (candidate.mimeType?.toLowerCase() || inferImageMimeType(candidate.uri));
  if (!resolvedMimeType || !supportedImageMimeTypes.has(resolvedMimeType as ImageAttachment['mimeType'])) {
    return { error: 'unsupported-type' };
  }

  const byteSize = candidate.fileSize ?? estimateBase64Bytes(data);
  if (byteSize > MAX_IMAGE_ATTACHMENT_BYTES) return { error: 'too-large' };

  return {
    attachment: {
      uri: candidate.uri,
      data,
      mimeType: resolvedMimeType as ImageAttachment['mimeType'],
    },
  };
}
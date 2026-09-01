/**
 * Jules REST API client.
 *
 * Every function in this module makes a request to the live Jules API. There
 * are deliberately no fixtures, mock responses, or local fallbacks here:
 * callers either receive the server response or a typed request error.
 */

import { encodeJulesResourceId, encodeJulesResourcePath } from '../utils/jules-guards';

const BASE_URL = 'https://jules.googleapis.com/v1alpha';
export const JULES_API_REQUEST_TIMEOUT_MS = 15_000;

export class JulesApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'JulesApiError';
  }
}

function getResourceId(value: string, label: string): string {
  try {
    return encodeJulesResourceId(value);
  } catch {
    throw new JulesApiError(`Invalid Jules ${label} identifier.`);
  }
}

function getResourcePath(value: string): string {
  try {
    return encodeJulesResourcePath(value);
  } catch {
    throw new JulesApiError('Invalid Jules resource path.');
  }
}
export interface GitHubBranch {
  displayName: string;
}

export interface Source {
  name: string;
  id: string;
  githubRepo?: {
    owner: string;
    repo: string;
    isPrivate?: boolean;
    defaultBranch?: GitHubBranch;
    branches?: GitHubBranch[];
  };
}

export interface SourceContext {
  source: string;
  githubRepoContext?: {
    startingBranch: string;
  };
}

export interface Session {
  name: string;
  id: string;
  title?: string;
  prompt: string;
  state?: string;
  createTime?: string;
  updateTime?: string;
  sourceContext: SourceContext;
  requirePlanApproval?: boolean;
  automationMode?: AutomationMode;
  url?: string;
  outputs?: SessionOutput[];
}

export type AutomationMode = 'AUTO_CREATE_PR' | 'AUTOMATION_MODE_UNSPECIFIED';

export interface PullRequest {
  url: string;
  title?: string;
  description?: string;
}

export interface SessionOutput {
  pullRequest?: PullRequest;
}

export interface GitPatch {
  unidiffPatch?: string;
  baseCommitId?: string;
  suggestedCommitMessage?: string;
}

export interface ChangeSet {
  source: string;
  gitPatch?: GitPatch;
}

export interface MediaArtifact {
  data: string;
  mimeType: string;
}

export interface BashOutput {
  command: string;
  output: string;
  exitCode: number;
}

export interface Artifact {
  changeSet?: ChangeSet;
  media?: MediaArtifact;
  bashOutput?: BashOutput;
}

export interface Activity {
  name: string;
  id: string;
  description?: string;
  createTime: string;
  originator: 'user' | 'agent' | 'system' | string;
  artifacts?: Artifact[];
  agentMessaged?: {
    agentMessage: string;
  };
  userMessaged?: {
    userMessage: string;
  };
  planGenerated?: {
    plan: {
      id: string;
      steps: {
        id: string;
        title: string;
        description?: string;
        index: number;
      }[];
    };
  };
  planApproved?: {
    planId: string;
  };
  progressUpdated?: {
    title: string;
    description?: string;
  };
  sessionCompleted?: Record<string, never>;
  sessionFailed?: {
    reason?: string;
  };
}

type PaginatedSources = {
  sources?: Source[];
  nextPageToken?: string;
};

type PaginatedSessions = {
  sessions?: Session[];
  nextPageToken?: string;
};

type PaginatedActivities = {
  activities?: Activity[];
  nextPageToken?: string;
};

function getErrorMessage(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    if (parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // Non-JSON error responses are expected for some network gateways.
  }

  return `Jules API request failed (${status}).`;
}

async function request<T>(
  path: string,
  apiKey: string,
  init: RequestInit = {},
): Promise<T> {
  const requestController = new AbortController();
  const externalSignal = init.signal;
  let didTimeout = false;

  const abortFromExternalSignal = () => {
    requestController.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternalSignal, { once: true });
  }

  const timeout = setTimeout(() => {
    didTimeout = true;
    requestController.abort(new Error('Jules API request timed out.'));
  }, JULES_API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      signal: requestController.signal,
      headers: {
        'X-Goog-Api-Key': apiKey,
        ...init.headers,
      },
    });

    if (!response.ok) {
      throw new JulesApiError(
        getErrorMessage(await response.text(), response.status),
        response.status,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (error instanceof JulesApiError) {
      throw error;
    }

    if (didTimeout) {
      throw new JulesApiError('The Jules API request timed out. Please try again.');
    }

    if (requestController.signal.aborted) {
      throw new JulesApiError('The Jules API request was cancelled.');
    }

    throw new JulesApiError(
      'Unable to reach the Jules API. Check your network connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abortFromExternalSignal);
  }
}

export interface RequestPollingOptions {
  intervalMs: number;
  poll: (signal: AbortSignal) => Promise<boolean | void>;
  onError?: (error: unknown) => void;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
}

/**
 * Runs one request immediately, then schedules the next request only after the
 * previous one has settled. Stopping also aborts the current request.
 */
export function createRequestPollingController({
  intervalMs,
  poll,
  onError,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
}: RequestPollingOptions) {
  let active = false;
  let scheduledHandle: unknown;
  let currentController: AbortController | null = null;
  let runSequence = 0;

  const clearScheduledRun = () => {
    if (scheduledHandle === undefined) return;
    cancelSchedule(scheduledHandle);
    scheduledHandle = undefined;
  };

  const run = async () => {
    if (!active || currentController) return;

    const requestController = new AbortController();
    const sequence = ++runSequence;
    currentController = requestController;
    let keepPolling = true;

    try {
      keepPolling = await poll(requestController.signal) !== false;
    } catch (error) {
      if (active && !requestController.signal.aborted) onError?.(error);
    } finally {
      if (currentController === requestController) currentController = null;

      if (!active || sequence !== runSequence || requestController.signal.aborted) return;
      if (!keepPolling) {
        active = false;
        return;
      }

      scheduledHandle = schedule(() => {
        scheduledHandle = undefined;
        void run();
      }, intervalMs);
    }
  };

  return {
    start() {
      if (active) return;
      active = true;
      void run();
    },
    stop() {
      active = false;
      runSequence += 1;
      clearScheduledRun();
      currentController?.abort();
      currentController = null;
    },
  };
}

function listPath(
  path: string,
  pageSize: number,
  pageToken?: string,
  filter?: string,
): string {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }
  if (filter) {
    params.set('filter', filter);
  }
  return `${path}?${params.toString()}`;
}

function getActivityCreatedAfterFilter(createdAfter?: string): string | undefined {
  if (!createdAfter) return undefined;

  const timestamp = new Date(createdAfter);
  if (Number.isNaN(timestamp.getTime())) {
    throw new JulesApiError('Invalid Jules activity timestamp.');
  }

  return `create_time > "${timestamp.toISOString()}"`;
}

export async function getSources(apiKey: string, pageToken?: string) {
  const result = await request<PaginatedSources>(
    listPath('/sources', 100, pageToken),
    apiKey,
  );

  return {
    sources: result.sources ?? [],
    nextPageToken: result.nextPageToken,
  };
}

export function getSource(apiKey: string, sourceName: string): Promise<Source> {
  return request<Source>(`/${getResourcePath(sourceName)}`, apiKey);
}

export async function getSessions(apiKey: string, pageToken?: string) {
  const result = await request<PaginatedSessions>(
    listPath('/sessions', 20, pageToken),
    apiKey,
  );

  return {
    sessions: result.sessions ?? [],
    nextPageToken: result.nextPageToken,
  };
}

export function getSession(
  apiKey: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Session> {
  return request<Session>(`/sessions/${getResourceId(sessionId, 'session')}`, apiKey, { signal });
}

export function formatPromptWithImage(
  prompt: string,
  image?: { data: string; mimeType: string },
): string {
  if (!image || !image.data) {
    return prompt;
  }
  const cleanData = image.data.replace(/\s/g, '');
  const dataUri = `data:${image.mimeType};base64,${cleanData}`;
  const imageAttachmentText = `[User Attached Image]\n${dataUri}`;
  return prompt ? `${prompt}\n\n${imageAttachmentText}` : imageAttachmentText;
}

export function createSession(
  apiKey: string,
  source: string,
  startingBranch: string,
  initialPrompt: string,
  options: {
    requirePlanApproval?: boolean;
    automationMode?: AutomationMode;
    title?: string;
    image?: { data: string; mimeType: string };
  } = {},
): Promise<Session> {
  const { requirePlanApproval = true, automationMode, title, image } = options;
  const finalPrompt = formatPromptWithImage(initialPrompt, image);

  return request<Session>('/sessions', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: finalPrompt,
      requirePlanApproval,
      ...(automationMode ? { automationMode } : {}),
      ...(title ? { title } : {}),
      sourceContext: {
        source,
        githubRepoContext: { startingBranch },
      },
    }),
  });
}

export async function sendMessageToJules(
  apiKey: string,
  sessionId: string,
  message: string,
  image?: { data: string; mimeType: string },
): Promise<void> {
  const finalPrompt = formatPromptWithImage(message, image);

  await request<void>(`/sessions/${getResourceId(sessionId, 'session')}:sendMessage`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: finalPrompt }),
  });
}

export async function pollActivities(
  apiKey: string,
  sessionId: string,
  pageToken?: string,
  options: { createdAfter?: string; pageSize?: number; signal?: AbortSignal } = {},
) {
  const { createdAfter, pageSize = 100, signal } = options;
  const result = await request<PaginatedActivities>(
    listPath(
      `/sessions/${getResourceId(sessionId, 'session')}/activities`,
      pageSize,
      pageToken,
      getActivityCreatedAfterFilter(createdAfter),
    ),
    apiKey,
    { signal },
  );

  return {
    activities: result.activities ?? [],
    nextPageToken: result.nextPageToken,
  };
}

async function pollNewActivities(
  apiKey: string,
  sessionId: string,
  createdAfter: string,
  pageSize: number,
  signal?: AbortSignal,
) {
  const activities: Activity[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;

  do {
    const page = await pollActivities(apiKey, sessionId, pageToken, {
      createdAfter,
      pageSize,
      signal,
    });
    activities.push(...page.activities);
    pageToken = page.nextPageToken;

    if (pageToken) {
      if (seenPageTokens.has(pageToken)) {
        throw new JulesApiError('The Jules API returned an invalid activity page token.');
      }
      seenPageTokens.add(pageToken);
    }
  } while (pageToken && !signal?.aborted);

  return { activities, nextPageToken: pageToken };
}

export function getSessionSnapshot(
  apiKey: string,
  sessionId: string,
  options: {
    activityCreatedAfter?: string;
    activityPageSize?: number;
    signal?: AbortSignal;
  } = {},
) {
  const { activityCreatedAfter, activityPageSize = 100, signal } = options;
  const activityRequest = activityCreatedAfter
    ? pollNewActivities(
        apiKey,
        sessionId,
        activityCreatedAfter,
        activityPageSize,
        signal,
      )
    : pollActivities(apiKey, sessionId, undefined, {
        pageSize: activityPageSize,
        signal,
      });

  return Promise.all([
    getSession(apiKey, sessionId, signal),
    activityRequest,
  ]).then(([session, activityPage]) => ({ session, activityPage }));
}

export function getActivity(
  apiKey: string,
  sessionId: string,
  activityId: string,
): Promise<Activity> {
  return request<Activity>(`/sessions/${getResourceId(sessionId, 'session')}/activities/${getResourceId(activityId, 'activity')}`, apiKey);
}

export async function approvePlan(apiKey: string, sessionId: string): Promise<void> {
  await request<void>(`/sessions/${getResourceId(sessionId, 'session')}:approvePlan`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

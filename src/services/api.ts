/**
 * Jules REST API client.
 *
 * Every function in this module makes a request to the live Jules API. There
 * are deliberately no fixtures, mock responses, or local fallbacks here:
 * callers either receive the server response or a typed request error.
 */

const BASE_URL = 'https://jules.googleapis.com/v1alpha';

export class JulesApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'JulesApiError';
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
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
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

    throw new JulesApiError(
      'Unable to reach the Jules API. Check your network connection and try again.',
    );
  }
}

function listPath(path: string, pageSize: number, pageToken?: string): string {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  if (pageToken) {
    params.set('pageToken', pageToken);
  }
  return `${path}?${params.toString()}`;
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
  return request<Source>(`/${sourceName}`, apiKey);
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

export function getSession(apiKey: string, sessionId: string): Promise<Session> {
  return request<Session>(`/sessions/${sessionId}`, apiKey);
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
  } = {},
): Promise<Session> {
  const { requirePlanApproval = true, automationMode, title } = options;
  return request<Session>('/sessions', apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: initialPrompt,
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
): Promise<void> {
  await request<void>(`/sessions/${sessionId}:sendMessage`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: message }),
  });
}

export async function pollActivities(
  apiKey: string,
  sessionId: string,
  pageToken?: string,
) {
  const result = await request<PaginatedActivities>(
    listPath(`/sessions/${sessionId}/activities`, 100, pageToken),
    apiKey,
  );

  return {
    activities: result.activities ?? [],
    nextPageToken: result.nextPageToken,
  };
}

export function getActivity(
  apiKey: string,
  sessionId: string,
  activityId: string,
): Promise<Activity> {
  return request<Activity>(`/sessions/${sessionId}/activities/${activityId}`, apiKey);
}

export async function approvePlan(apiKey: string, sessionId: string): Promise<void> {
  await request<void>(`/sessions/${sessionId}:approvePlan`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

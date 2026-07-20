// src/services/api.ts

/**
 * Real API service communicating with Jules API.
 */

const BASE_URL = 'https://jules.googleapis.com/v1alpha';

export interface Source {
  name: string;
  id?: string;
  githubRepo?: {
    owner: string;
    repo: string;
  };
}

export interface Session {
  name: string;
  title?: string;
  prompt?: string;
  state?: string;
  createTime?: string;
  updateTime?: string;
  sourceContext?: {
    source: string;
  };
}

export interface Activity {
  id: string;
  createTime: string;
  originator: string;
  planApproved?: boolean;
  progressUpdated?: {
    title: string;
    description?: string;
  };
  planGenerated?: boolean;
  sessionCompleted?: boolean;
}

export const getSources = async (apiKey: string, pageToken?: string): Promise<{ sources: Source[], nextPageToken?: string }> => {
  try {
    let url = `${BASE_URL}/sources`;
    if (pageToken) {
      url += `?pageToken=${pageToken}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch sources: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("getSources error:", error);
    throw error;
  }
};

export const getSource = async (apiKey: string, sourceId: string): Promise<Source> => {
  try {
    const response = await fetch(`${BASE_URL}/${sourceId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch source: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("getSource error:", error);
    throw error;
  }
};

export const getSessions = async (apiKey: string, pageToken?: string): Promise<{ sessions: Session[], nextPageToken?: string }> => {
  try {
    let url = `${BASE_URL}/sessions?pageSize=20`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch sessions: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("getSessions error:", error);
    throw error;
  }
};

export const getSession = async (apiKey: string, sessionId: string): Promise<Session> => {
  try {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch session: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("getSession error:", error);
    throw error;
  }
};

export const createSession = async (apiKey: string, source: string, initialPrompt: string): Promise<Session> => {
  try {
    const body: any = {
      prompt: initialPrompt,
    };
    
    // Make source optional
    if (source && source.trim() !== '') {
        body.sourceContext = {
          source: source,
          githubRepoContext: {
            startingBranch: "main"
          }
        };
    }

    const response = await fetch(`${BASE_URL}/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create session: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("createSession error:", error);
    throw error;
  }
};

export const sendMessageToJules = async (apiKey: string, sessionId: string, message: string): Promise<boolean> => {
  try {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}:sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({
        prompt: message,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to send message: ${response.status} ${errorText}`);
    }
    
    // The response body is typically empty for sendMessage, agent replies in next activity.
    return true; 
  } catch (error) {
    console.error("sendMessageToJules error:", error);
    throw error;
  }
};

export const pollActivities = async (apiKey: string, sessionId: string, pageToken?: string): Promise<{ activities: Activity[], nextPageToken?: string }> => {
  try {
    let url = `${BASE_URL}/sessions/${sessionId}/activities?pageSize=50`;
    if (pageToken) {
      url += `&pageToken=${pageToken}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to poll activities: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("pollActivities error:", error);
    throw error;
  }
};

export const getActivity = async (apiKey: string, sessionId: string, activityId: string): Promise<Activity> => {
  try {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}/activities/${activityId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': apiKey,
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch activity: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("getActivity error:", error);
    throw error;
  }
};

export const approvePlan = async (apiKey: string, sessionId: string): Promise<any> => {
  try {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}:approvePlan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to approve plan: ${response.status} ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("approvePlan error:", error);
    throw error;
  }
};

// src/services/api.js

/**
 * Real API service communicating with Jules API.
 */

const BASE_URL = 'https://jules.googleapis.com/v1alpha';

export const getSources = async (apiKey) => {
  try {
    const response = await fetch(`${BASE_URL}/sources`, {
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

export const getSessions = async (apiKey) => {
  try {
    const response = await fetch(`${BASE_URL}/sessions?pageSize=20`, {
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

export const createSession = async (apiKey, source, initialPrompt) => {
  try {
    const body = {
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

export const sendMessageToJules = async (apiKey, sessionId, message) => {
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

export const pollActivities = async (apiKey, sessionId) => {
  try {
    const response = await fetch(`${BASE_URL}/sessions/${sessionId}/activities?pageSize=50`, {
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

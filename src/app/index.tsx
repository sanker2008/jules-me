import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView,
  ActivityIndicator,
  ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { getSources, getSessions, Source, Session } from '../services/api';
import { getApiKey, saveApiKey } from '../utils/secure-store';

export default function MenuScreen() {
  const router = useRouter();

  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKeyState] = useState('');
  
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesNextPageToken, setSourcesNextPageToken] = useState<string | undefined>();
  const [isLoadingMoreSources, setIsLoadingMoreSources] = useState(false);

  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [sessionsNextPageToken, setSessionsNextPageToken] = useState<string | undefined>();
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);
  
  const [isLoadingMenuData, setIsLoadingMenuData] = useState(false);

  const fetchMenuData = async (keyToUse: string = apiKey) => {
    if (!keyToUse) {
      alert('Please configure your Jules API Key in Settings (⚙️) first.');
      return;
    }
    setIsLoadingMenuData(true);
    try {
      const sourcesResult = await getSources(keyToUse);
      if (sourcesResult && sourcesResult.sources) {
        setSources(sourcesResult.sources);
        setSourcesNextPageToken(sourcesResult.nextPageToken);
      } else {
        setSources([]);
        setSourcesNextPageToken(undefined);
      }
      
      const sessionsResult = await getSessions(keyToUse);
      if (sessionsResult && sessionsResult.sessions) {
        setRecentSessions(sessionsResult.sessions);
        setSessionsNextPageToken(sessionsResult.nextPageToken);
      } else {
        setRecentSessions([]);
        setSessionsNextPageToken(undefined);
      }
    } catch (error) {
      console.error("Error fetching menu data:", error);
      alert('Failed to fetch data. Please check your API Key.');
    } finally {
      setIsLoadingMenuData(false);
    }
  };

  const loadMoreSources = async () => {
    if (!apiKey || !sourcesNextPageToken) return;
    setIsLoadingMoreSources(true);
    try {
      const result = await getSources(apiKey, sourcesNextPageToken);
      if (result && result.sources) {
        setSources(prev => [...prev, ...result.sources]);
        setSourcesNextPageToken(result.nextPageToken);
      }
    } catch (error) {
      console.error("Error loading more sources:", error);
    } finally {
      setIsLoadingMoreSources(false);
    }
  };

  const loadMoreSessions = async () => {
    if (!apiKey || !sessionsNextPageToken) return;
    setIsLoadingMoreSessions(true);
    try {
      const result = await getSessions(apiKey, sessionsNextPageToken);
      if (result && result.sessions) {
        setRecentSessions(prev => [...prev, ...result.sessions]);
        setSessionsNextPageToken(result.nextPageToken);
      }
    } catch (error) {
      console.error("Error loading more sessions:", error);
    } finally {
      setIsLoadingMoreSessions(false);
    }
  };

  useEffect(() => {
    const loadKey = async () => {
      const key = await getApiKey();
      if (key) {
        setApiKeyState(key);
        fetchMenuData(key);
      }
    };
    loadKey();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveApiKey = async () => {
    await saveApiKey(apiKey);
    setShowSettings(false);
    if (apiKey) fetchMenuData(apiKey);
  };

  const startEmptySession = () => {
    router.push('/chat');
  };

  const startSessionWithCodebase = (sourceName: string) => {
    router.push({ pathname: '/chat', params: { sourceId: sourceName } });
  };

  const resumeSession = (existingSession: Session) => {
    const extractedId = existingSession.name.split('/')[1];
    const sourceId = existingSession.sourceContext?.source || '';
    router.push({ pathname: '/chat', params: { sessionId: extractedId, sourceId: sourceId } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.menuContainer}>
          <View style={styles.menuHeader}>
            <Text style={styles.menuTitle}>Jules Workspace</Text>
            <View style={styles.menuActions}>
               <TouchableOpacity onPress={() => fetchMenuData(apiKey)} style={styles.iconButton}>
                   <Text style={styles.iconText}>🔄</Text>
               </TouchableOpacity>
               <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.iconButton}>
                   <Text style={styles.iconText}>⚙️</Text>
               </TouchableOpacity>
            </View>
          </View>

          {isLoadingMenuData ? (
             <ActivityIndicator size="large" color="#007AFF" style={{marginTop: 50}}/>
          ) : (
             <ScrollView style={styles.menuScroll} contentContainerStyle={{ paddingBottom: 100 }}>
                <TouchableOpacity style={styles.emptySessionCard} onPress={startEmptySession}>
                    <Text style={styles.emptySessionTitle}>+ Start Empty Session</Text>
                    <Text style={styles.emptySessionSub}>No codebase bound</Text>
                </TouchableOpacity>

                <Text style={styles.sectionHeader}>Your Codebases</Text>
                {sources.length === 0 ? <Text style={styles.emptyText}>No codebases found.</Text> : null}
                {sources.map(src => (
                    <TouchableOpacity
                       key={src.name}
                       style={styles.menuItem}
                       onPress={() => startSessionWithCodebase(src.name)}
                    >
                       <Text style={styles.menuItemTitle}>
                           {src.id || src.name}
                       </Text>
                       {src.githubRepo ? (
                           <Text style={styles.menuItemSub}>{src.githubRepo.owner}/{src.githubRepo.repo}</Text>
                       ) : (
                           <Text style={styles.menuItemSub}>Create session</Text>
                       )}
                    </TouchableOpacity>
                ))}

                {sourcesNextPageToken ? (
                    <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreSources} disabled={isLoadingMoreSources}>
                        <Text style={styles.loadMoreText}>{isLoadingMoreSources ? 'Loading...' : 'Load More'}</Text>
                    </TouchableOpacity>
                ) : null}

                <Text style={styles.sectionHeader}>Recent Sessions</Text>
                {recentSessions.length === 0 ? <Text style={styles.emptyText}>No recent sessions.</Text> : null}
                {recentSessions.map(sess => (
                    <TouchableOpacity
                       key={sess.name}
                       style={styles.menuItem}
                       onPress={() => resumeSession(sess)}
                    >
                       <Text style={styles.menuItemTitle} numberOfLines={1}>{sess.title || sess.prompt || 'Untitled Session'}</Text>
                       {sess.sourceContext?.source && (
                           <Text style={styles.menuItemSub} numberOfLines={1}>
                               Repo: {sess.sourceContext.source.split('/').pop()}
                           </Text>
                       )}
                       <Text style={styles.menuItemTime}>
                          {sess.createTime ? new Date(sess.createTime).toLocaleString() : ''}
                          {sess.state ? ` • ${sess.state}` : ''}
                          {` • ID: ${sess.name.split('/')[1]}`}
                       </Text>
                    </TouchableOpacity>
                ))}

                {sessionsNextPageToken ? (
                    <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreSessions} disabled={isLoadingMoreSessions}>
                        <Text style={styles.loadMoreText}>{isLoadingMoreSessions ? 'Loading...' : 'Load More'}</Text>
                    </TouchableOpacity>
                ) : null}
             </ScrollView>
          )}
      </View>

      {showSettings && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowSettings(false)}
          />
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Global Settings</Text>
            
            <Text style={styles.label}>Jules API Key:</Text>
            <TextInput
              style={styles.modalInput}
              value={apiKey}
              onChangeText={setApiKeyState}
              placeholder="Enter your API Key"
              secureTextEntry
            />

            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowSettings(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleSaveApiKey}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  menuContainer: { flex: 1, backgroundColor: '#ffffff' },
  menuHeader: {
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  menuTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  menuActions: { flexDirection: 'row' },
  iconButton: { padding: 10, marginLeft: 5 },
  iconText: { fontSize: 20 },
  menuScroll: { flex: 1, padding: 15 },
  emptySessionCard: {
      backgroundColor: '#f0f8ff',
      padding: 20,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#cce0ff',
      marginBottom: 20,
      alignItems: 'center',
  },
  emptySessionTitle: { fontSize: 18, fontWeight: 'bold', color: '#007AFF' },
  emptySessionSub: { fontSize: 14, color: '#666', marginTop: 5 },
  sectionHeader: { fontSize: 16, fontWeight: 'bold', color: '#888', marginTop: 10, marginBottom: 10, textTransform: 'uppercase' },
  menuItem: {
      backgroundColor: '#f9f9f9',
      padding: 15,
      borderRadius: 10,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: '#ececec',
  },
  menuItemTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  menuItemSub: { fontSize: 14, color: '#666', marginTop: 4 },
  menuItemTime: { fontSize: 12, color: '#999', marginTop: 8 },
  emptyText: { color: '#999', fontStyle: 'italic', marginBottom: 20, paddingHorizontal: 5 },
  loadMoreButton: { padding: 10, alignItems: 'center', marginBottom: 20 },
  loadMoreText: { color: '#007AFF', fontWeight: 'bold' },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalView: {
    width: '85%',
    maxWidth: 500,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, alignSelf: 'center' },
  label: { fontSize: 16, fontWeight: 'bold', marginTop: 10, marginBottom: 8 },
  modalInput: { width: '100%', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 15, fontSize: 16 },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 25,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#e0e0e0',
    marginRight: 10,
  },
  cancelButtonText: {
    color: '#333333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    marginLeft: 10,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

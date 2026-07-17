import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView,
  ActivityIndicator,
  Modal,
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
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
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
      } else {
        setSources([]);
      }
      
      const sessionsResult = await getSessions(keyToUse);
      if (sessionsResult && sessionsResult.sessions) {
        setRecentSessions(sessionsResult.sessions);
      } else {
        setRecentSessions([]);
      }
    } catch (error) {
      console.error("Error fetching menu data:", error);
      alert('Failed to fetch data. Please check your API Key.');
    } finally {
      setIsLoadingMenuData(false);
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
             <ScrollView style={styles.menuScroll}>
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
                           {src.githubRepo ? `${src.githubRepo.owner}/${src.githubRepo.repo}` : src.id}
                       </Text>
                       <Text style={styles.menuItemSub}>Create session</Text>
                    </TouchableOpacity>
                ))}

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
                       <Text style={styles.menuItemTime}>ID: {sess.name.split('/')[1]}</Text>
                    </TouchableOpacity>
                ))}
             </ScrollView>
          )}
      </View>

      <Modal
        animationType="fade"
        transparent={true}
        visible={showSettings}
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
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

            <TouchableOpacity
              style={[styles.sendButton, {marginTop: 25, width: '100%'}]}
              onPress={handleSaveApiKey}
            >
              <Text style={styles.sendButtonText}>Save & Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalView: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 25, alignItems: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, alignSelf: 'center' },
  label: { fontSize: 16, fontWeight: 'bold', marginTop: 10, marginBottom: 8 },
  modalInput: { width: '100%', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 15, fontSize: 16 },
  sendButton: { backgroundColor: '#007AFF', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
});

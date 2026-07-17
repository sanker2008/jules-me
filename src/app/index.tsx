import React, { useState, useRef, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  KeyboardAvoidingView, 
  Platform,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  ScrollView,
  BackHandler
} from 'react-native';
import { createSession, sendMessageToJules, pollActivities, getSources, getSessions } from '../services/api';

export default function App() {
  // Navigation State
  const [currentView, setCurrentView] = useState('MENU'); // 'MENU' | 'CHAT'

  // Settings state (Global API Key)
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState('');
  
  // Data State for Menu
  const [sources, setSources] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [isLoadingMenuData, setIsLoadingMenuData] = useState(false);

  // Chat State
  const [sessionId, setSessionId] = useState(null); // The active Jules session ID
  const [selectedSourceId, setSelectedSourceId] = useState(''); // Target repo if creating new session
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const flatListRef = useRef(null);
  const [pollIntervalId, setPollIntervalId] = useState(null);

  // Android Back button handler
  useEffect(() => {
    const backAction = () => {
      if (currentView === 'CHAT') {
        goToMenu();
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [currentView]);

  // Cleanup polling
  useEffect(() => {
    return () => {
      if (pollIntervalId) clearInterval(pollIntervalId);
    };
  }, [pollIntervalId]);

  // -----------------------------------------
  // Menu Actions
  // -----------------------------------------
  const fetchMenuData = async () => {
    if (!apiKey) {
      alert('Please configure your Jules API Key in Settings (⚙️) first.');
      return;
    }
    setIsLoadingMenuData(true);
    try {
      // Fetch Sources
      const sourcesResult = await getSources(apiKey);
      if (sourcesResult && sourcesResult.sources) {
        setSources(sourcesResult.sources);
      } else {
        setSources([]);
      }
      
      // Fetch Recent Sessions
      const sessionsResult = await getSessions(apiKey);
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

  const startEmptySession = () => {
    setSessionId(null);
    setSelectedSourceId(''); // No codebase
    setMessages([]);
    setInputText('');
    if (pollIntervalId) clearInterval(pollIntervalId);
    setCurrentView('CHAT');
  };

  const startSessionWithCodebase = (sourceName) => {
    setSessionId(null);
    setSelectedSourceId(sourceName);
    setMessages([]);
    setInputText('');
    if (pollIntervalId) clearInterval(pollIntervalId);
    setCurrentView('CHAT');
  };

  const resumeSession = async (existingSession) => {
    if (pollIntervalId) clearInterval(pollIntervalId);
    const extractedId = existingSession.name.split('/')[1];
    setSessionId(extractedId);
    setSelectedSourceId(existingSession.sourceContext?.source || '');
    setInputText('');
    setMessages([{
        id: 'loading_hist',
        text: 'Loading history...',
        sender: 'jules',
        timestamp: new Date().toISOString()
    }]);
    setCurrentView('CHAT');
    
    // Load history and start polling
    try {
        const result = await pollActivities(apiKey, extractedId);
        parseHistoricalActivities(result.activities || []);
        startPolling(apiKey, extractedId);
    } catch (e) {
        console.error(e);
        setMessages([{
            id: 'err',
            text: 'Failed to load history.',
            sender: 'jules',
            timestamp: new Date().toISOString()
        }]);
    }
  };

  const goToMenu = () => {
    if (pollIntervalId) clearInterval(pollIntervalId);
    setCurrentView('MENU');
    // Refresh list when going back
    if (apiKey) fetchMenuData();
  };


  // -----------------------------------------
  // Chat Actions
  // -----------------------------------------

  const parseHistoricalActivities = (activitiesList) => {
      // Sort oldest to newest
      const sorted = [...activitiesList].sort((a,b) => new Date(a.createTime) - new Date(b.createTime));
      
      const newMessages = [];
      sorted.forEach(act => {
          if (act.originator === 'user') {
             // We don't have the user text in activity (except prompt in session), 
             // but if they approved plan we can show a placeholder.
             if (act.planApproved) {
                 newMessages.push({
                     id: act.id,
                     text: '[Plan Approved]',
                     sender: 'user',
                     timestamp: act.createTime
                 });
             }
          } else {
             // Agent messages
             let replyText = null;
             if (act.progressUpdated) {
                 replyText = `**${act.progressUpdated.title}**\n${act.progressUpdated.description || ''}`;
             } else if (act.planGenerated) {
                 replyText = "Generated a new execution plan.";
             } else if (act.sessionCompleted) {
                 replyText = "✅ Session completed successfully!";
             }

             if (replyText) {
                 newMessages.push({
                     id: act.id,
                     activityId: act.id,
                     text: replyText,
                     sender: 'jules',
                     timestamp: act.createTime
                 });
             }
          }
      });
      
      if (newMessages.length === 0) {
          newMessages.push({
              id: 'empty_hist',
              text: 'Session restored.',
              sender: 'jules',
              timestamp: new Date().toISOString()
          });
      }
      setMessages(newMessages);
  };

  const handleSend = async () => {
    if (inputText.trim() === '') return;
    
    if (!apiKey) {
      alert('Please configure API Key in settings (⚙️) first.');
      return;
    }

    const newUserMsg = {
      id: Date.now().toString(),
      text: inputText,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prevMessages => [...prevMessages, newUserMsg]);
    setInputText('');
    setIsTyping(true);

    try {
      if (!sessionId) {
        // Create new session
        const session = await createSession(apiKey, selectedSourceId, newUserMsg.text);
        if (session && session.name) {
            const extractedId = session.name.split('/')[1];
            setSessionId(extractedId);
            
            const contextText = selectedSourceId ? `bound to ${selectedSourceId.split('/').pop()}` : `without codebase`;
            setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              text: `Started session ${contextText}. I am analyzing your request...`,
              sender: 'jules',
              timestamp: new Date().toISOString()
            }]);

            // Immediately start polling for this new session
            startPolling(apiKey, extractedId);
        } else {
             throw new Error('Failed to create session');
        }
      } else {
        // Send message to existing session
        await sendMessageToJules(apiKey, sessionId, newUserMsg.text);
      }
    } catch (error) {
      console.error("Error communicating with Jules API:", error);
      const errorMsg = {
        id: Date.now().toString(),
        text: 'Sorry, I encountered an error communicating with the API. Please try again.',
        sender: 'jules',
        timestamp: new Date().toISOString()
      };
      setMessages(prevMessages => [...prevMessages, errorMsg]);
      setIsTyping(false);
    }
  };

  const startPolling = (currentApiKey, currentSessionId) => {
    if (pollIntervalId) clearInterval(pollIntervalId);

    const intervalId = setInterval(async () => {
        try {
            const result = await pollActivities(currentApiKey, currentSessionId);
            if (result && result.activities && result.activities.length > 0) {
               // Get the latest agent activity
               // To accurately reflect the chat, we should parse the latest we haven't seen.
               // For simplicity, we just look at the absolute latest agent activity
               const agentActivities = result.activities.filter(a => a.originator === 'agent');
               if (agentActivities.length > 0) {
                   const latest = agentActivities[0];
                   
                   let replyText = null;
                   let isCompleted = false;

                   if (latest.progressUpdated) {
                       replyText = `**${latest.progressUpdated.title}**\n${latest.progressUpdated.description || ''}`;
                   } else if (latest.planGenerated) {
                       replyText = "Generated a new execution plan.";
                   } else if (latest.sessionCompleted) {
                       replyText = "✅ Session completed successfully!";
                       isCompleted = true;
                   }

                   if (replyText) {
                     setMessages(prevMessages => {
                         // Avoid adding duplicate activity messages
                         const lastMsg = prevMessages[prevMessages.length - 1];
                         if (lastMsg && lastMsg.sender === 'jules' && lastMsg.activityId === latest.id) {
                             return prevMessages;
                         }
                         
                         return [...prevMessages, {
                             id: Date.now().toString(),
                             activityId: latest.id,
                             text: replyText,
                             sender: 'jules',
                             timestamp: new Date().toISOString()
                         }];
                     });
                   }
                   
                   setIsTyping(false);

                   if (isCompleted) {
                     clearInterval(intervalId);
                     setPollIntervalId(null);
                   }
               }
            }
        } catch(e) {
             console.error("Polling error", e);
             clearInterval(intervalId);
             setPollIntervalId(null);
             setIsTyping(false);
        }
    }, 5000); // poll every 5 seconds

    setPollIntervalId(intervalId);
  }


  // -----------------------------------------
  // Renderers
  // -----------------------------------------

  const renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.julesBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userText : styles.julesText]}>
          {item.text}
        </Text>
      </View>
    );
  };

  const renderMenuView = () => (
    <View style={styles.menuContainer}>
        <View style={styles.menuHeader}>
          <Text style={styles.menuTitle}>Jules Workspace</Text>
          <View style={styles.menuActions}>
             <TouchableOpacity onPress={fetchMenuData} style={styles.iconButton}>
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
              {/* Start Empty */}
              <TouchableOpacity style={styles.emptySessionCard} onPress={startEmptySession}>
                  <Text style={styles.emptySessionTitle}>+ Start Empty Session</Text>
                  <Text style={styles.emptySessionSub}>No codebase bound</Text>
              </TouchableOpacity>

              {/* Codebases */}
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

              {/* Recent Sessions */}
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
  );

  const renderChatView = () => (
    <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={goToMenu} style={styles.backButton}>
            <Text style={styles.backButtonText}>{"< Menu"}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
             {sessionId ? `Session ${sessionId.substring(0,6)}...` : (selectedSourceId ? selectedSourceId.split('/').pop() : 'Empty Session')}
          </Text>
          <View style={{width: 50}} /> {/* spacer for flex balance */}
        </View>

        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={() => (
              <View style={styles.emptyChatContainer}>
                  <Text style={styles.emptyChatText}>
                     {selectedSourceId ? `Ready to modify ${selectedSourceId.split('/').pop()}` : `Ready to chat with Jules`}
                  </Text>
              </View>
          )}
        />

        {isTyping && sessionId && (
          <View style={styles.typingIndicator}>
            <Text style={styles.typingText}>Jules is processing...</Text>
            <ActivityIndicator size="small" color="#007AFF" style={{marginLeft: 5}}/>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={!sessionId ? "Type your prompt to start..." : "Ask Jules something else..."}
            placeholderTextColor="#999"
            multiline
            maxLength={1000}
          />
          <TouchableOpacity 
            style={[styles.sendButton, (!inputText.trim()) && styles.sendButtonDisabled]} 
            onPress={handleSend}
            disabled={!inputText.trim() || isTyping}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView style={styles.container}>
      {currentView === 'MENU' ? renderMenuView() : renderChatView()}

      {/* Global API Key Settings Modal */}
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
              onChangeText={setApiKey}
              placeholder="Enter your API Key"
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.sendButton, {marginTop: 25, width: '100%'}]}
              onPress={() => {
                  setShowSettings(false);
                  if (apiKey && currentView === 'MENU') fetchMenuData();
              }}
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
  keyboardView: { flex: 1 },
  // Menu Styles
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
  
  // Chat Header Styles
  header: {
    height: 60,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
  },
  backButton: { padding: 8 },
  backButtonText: { color: '#007AFF', fontWeight: '600', fontSize: 16 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', maxWidth: 200, textAlign: 'center' },

  // Chat Messages
  messageList: { paddingHorizontal: 15, paddingVertical: 20, flexGrow: 1, justifyContent: 'flex-end' },
  emptyChatContainer: { alignItems: 'center', marginVertical: 40 },
  emptyChatText: { color: '#999', fontStyle: 'italic' },
  messageBubble: { maxWidth: '85%', padding: 12, borderRadius: 20, marginBottom: 12 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  julesBubble: { alignSelf: 'flex-start', backgroundColor: '#ffffff', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e0e0e0' },
  messageText: { fontSize: 16, lineHeight: 22 },
  userText: { color: '#ffffff' },
  julesText: { color: '#333333' },
  typingIndicator: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 10 },
  typingText: { fontSize: 14, color: '#666', fontStyle: 'italic' },
  
  // Input Container
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e0e0e0', alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, fontSize: 16, color: '#333' },
  sendButton: { marginLeft: 10, marginBottom: 5, backgroundColor: '#007AFF', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#b3d4ff' },
  sendButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalView: { width: '85%', backgroundColor: 'white', borderRadius: 20, padding: 25, alignItems: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 20, alignSelf: 'center' },
  label: { fontSize: 16, fontWeight: 'bold', marginTop: 10, marginBottom: 8 },
  modalInput: { width: '100%', backgroundColor: '#f0f0f0', borderRadius: 10, padding: 15, fontSize: 16 }
});

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
  ActivityIndicator
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { createSession, sendMessageToJules, pollActivities, Activity, approvePlan } from '../services/api';
import { getApiKey } from '../utils/secure-store';

interface Message {
  id: string;
  activityId?: string;
  text: string;
  sender: 'user' | 'jules';
  timestamp: string;
  planGenerated?: boolean;
  planApproved?: boolean;
}

export default function ChatScreen() {
  const { sessionId: initialSessionId, sourceId } = useLocalSearchParams<{ sessionId?: string; sourceId?: string }>();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [apiKey, setApiKey] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const [pollIntervalId, setPollIntervalId] = useState<any>(null);

  const parseHistoricalActivities = (activitiesList: Activity[]) => {
      const sorted = [...activitiesList].sort((a,b) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime());

      const newMessages: Message[] = [];
      sorted.forEach(act => {
          if (act.originator === 'user') {
             if (act.planApproved) {
                 newMessages.push({
                     id: act.id,
                     activityId: act.id,
                     text: '',
                     sender: 'user',
                     timestamp: act.createTime,
                     planApproved: true
                 });
             }
          } else {
             let replyText = null;
             let planGenerated = false;
             if (act.progressUpdated) {
                 replyText = `**${act.progressUpdated.title}**\n${act.progressUpdated.description || ''}`;
             } else if (act.planGenerated) {
                 replyText = "Generated a new execution plan.";
                 planGenerated = true;
             } else if (act.sessionCompleted) {
                 replyText = "✅ Session completed successfully!";
             }

             if (replyText) {
                 newMessages.push({
                     id: act.id,
                     activityId: act.id,
                     text: replyText,
                     sender: 'jules',
                     timestamp: act.createTime,
                     planGenerated
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

  const startPolling = (currentApiKey: string, currentSessionId: string) => {
    if (pollIntervalId) clearInterval(pollIntervalId);

    const intervalId = setInterval(async () => {
        try {
            const result = await pollActivities(currentApiKey, currentSessionId);
            if (result && result.activities && result.activities.length > 0) {
               const agentActivities = result.activities.filter(a => a.originator === 'agent');
               if (agentActivities.length > 0) {
                   const latest = agentActivities[0];

                   let replyText = null;
                   let isCompleted = false;
                   let planGenerated = false;

                   if (latest.progressUpdated) {
                       replyText = `**${latest.progressUpdated.title}**\n${latest.progressUpdated.description || ''}`;
                   } else if (latest.planGenerated) {
                       replyText = "Generated a new execution plan.";
                       planGenerated = true;
                   } else if (latest.sessionCompleted) {
                       replyText = "✅ Session completed successfully!";
                       isCompleted = true;
                   }

                   if (replyText) {
                     setMessages(prevMessages => {
                         const lastMsg = prevMessages[prevMessages.length - 1];
                         if (lastMsg && lastMsg.sender === 'jules' && lastMsg.activityId === latest.id) {
                             return prevMessages;
                         }

                         return [...prevMessages, {
                             id: Date.now().toString(),
                             activityId: latest.id,
                             text: replyText,
                             sender: 'jules',
                             timestamp: new Date().toISOString(),
                             planGenerated
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
    }, 5000);

    setPollIntervalId(intervalId);
  };

  useEffect(() => {
    const loadKeyAndInit = async () => {
      const key = await getApiKey();
      setApiKey(key);

      if (key && initialSessionId) {
        // Load initial history
        setMessages([{
            id: 'loading_hist',
            text: 'Loading history...',
            sender: 'jules',
            timestamp: new Date().toISOString()
        }]);
        try {
            const result = await pollActivities(key, initialSessionId);
            parseHistoricalActivities(result.activities || []);
            startPolling(key, initialSessionId);
        } catch (e) {
            console.error(e);
            setMessages([{
                id: 'err',
                text: 'Failed to load history.',
                sender: 'jules',
                timestamp: new Date().toISOString()
            }]);
        }
      }
    };
    loadKeyAndInit();

    return () => {
      if (pollIntervalId) clearInterval(pollIntervalId);
    };
  }, [initialSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (inputText.trim() === '') return;

    if (!apiKey) {
      alert('Please configure API Key in settings first.');
      return;
    }

    const newUserMsg: Message = {
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
        const session = await createSession(apiKey, sourceId || '', newUserMsg.text);
        if (session && session.name) {
            const extractedId = session.name.split('/')[1];
            setSessionId(extractedId);

            const contextText = sourceId ? `bound to ${sourceId.split('/').pop()}` : `without codebase`;
            setMessages(prev => [...prev, {
              id: Date.now().toString() + Math.random(),
              text: `Started session ${contextText}. I am analyzing your request...`,
              sender: 'jules',
              timestamp: new Date().toISOString()
            }]);

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
      const errorMsg: Message = {
        id: Date.now().toString(),
        text: 'Sorry, I encountered an error communicating with the API. Please try again.',
        sender: 'jules',
        timestamp: new Date().toISOString()
      };
      setMessages(prevMessages => [...prevMessages, errorMsg]);
      setIsTyping(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!apiKey || !sessionId) return;
    setIsApproving(true);
    try {
      await approvePlan(apiKey, sessionId);
      setMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: '',
          sender: 'user',
          timestamp: new Date().toISOString(),
          planApproved: true
      }]);
    } catch (e) {
      console.error("Failed to approve plan", e);
      alert('Failed to approve plan.');
    } finally {
      setIsApproving(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.julesBubble]}>
        {item.text ? (
            <Text style={[styles.messageText, isUser ? styles.userText : styles.julesText]}>
              {item.text}
            </Text>
        ) : null}
        {item.planGenerated && (
            <TouchableOpacity 
                style={styles.approveButton}
                onPress={handleApprovePlan}
                disabled={isApproving}
            >
                {isApproving ? <ActivityIndicator size="small" color="#ffffff" /> : <Text style={styles.approveButtonText}>✅ Approve Plan</Text>}
            </TouchableOpacity>
        )}
        {item.planApproved && (
            <View style={[styles.approveButton, styles.approveButtonDisabled]}>
                <Text style={styles.approveButtonDisabledText}>Plan Approved ✓</Text>
            </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>{"< Menu"}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
             {sessionId ? `Session ${sessionId.substring(0,6)}...` : (sourceId ? sourceId.split('/').pop() : 'Empty Session')}
          </Text>
          <View style={{width: 50}} />
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
                     {sourceId ? `Ready to modify ${sourceId.split('/').pop()}` : `Ready to chat with Jules`}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  keyboardView: { flex: 1 },
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
  inputContainer: { flexDirection: 'row', padding: 10, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e0e0e0', alignItems: 'flex-end' },
  input: { flex: 1, minHeight: 40, maxHeight: 120, backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 15, paddingTop: 10, paddingBottom: 10, fontSize: 16, color: '#333' },
  sendButton: { marginLeft: 10, marginBottom: 5, backgroundColor: '#007AFF', borderRadius: 20, paddingVertical: 10, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#b3d4ff' },
  sendButtonText: { color: '#ffffff', fontSize: 16, fontWeight: 'bold' },
  approveButton: { marginTop: 10, backgroundColor: '#28a745', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  approveButtonDisabled: { backgroundColor: '#e0e0e0' },
  approveButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  approveButtonDisabledText: { color: '#888888', fontSize: 14, fontWeight: '600' },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Activity,
  approvePlan,
  Artifact,
  createSession,
  getSession,
  JulesApiError,
  pollActivities,
  Session,
  sendMessageToJules,
} from '../services/api';
import { createTranslator, useAppLanguage } from '../i18n';
import type { Translator } from '../i18n';
import { useTheme } from '../hooks/use-theme';
import {
  createImageAttachment,
  getSingleRouteParam,
  isTrustedPullRequestUrl,
} from '../utils/jules-guards';
import type { ImageAttachment, ImageAttachmentResult } from '../utils/jules-guards';
import { getApiKey } from '../utils/secure-store';

type TimelineKind = 'user' | 'agent' | 'plan' | 'progress' | 'approved' | 'completed' | 'failed' | 'system';

interface TimelineItem {
  id: string;
  activityId?: string;
  kind: TimelineKind;
  text?: string;
  title?: string;
  timestamp: string;
  plan?: NonNullable<Activity['planGenerated']>['plan'];
  artifacts?: Artifact[];
}

function getChatErrorMessage(error: unknown, t: Translator): string {
  if (error instanceof JulesApiError) {
    if (error.status === 401 || error.status === 403) {
      return t('chatAuthError');
    }
    return error.message;
  }

  return t('chatGenericError');
}

function getSessionStateLabel(state: string | undefined, t: Translator) {
  switch (state) {
    case 'QUEUED': return t('sessionQueued');
    case 'PLANNING': return t('sessionPlanning');
    case 'AWAITING_PLAN_APPROVAL': return t('sessionAwaitingPlan');
    case 'AWAITING_USER_FEEDBACK': return t('sessionAwaitingFeedback');
    case 'IN_PROGRESS': return t('sessionInProgress');
    case 'PAUSED': return t('sessionPaused');
    case 'COMPLETED': return t('sessionCompleted');
    case 'FAILED': return t('sessionFailed');
    default: return t('sessionSyncing');
  }
}

function isTerminalState(state?: string) {
  return state === 'COMPLETED' || state === 'FAILED';
}

function isWorkingState(state?: string) {
  return state === 'QUEUED' || state === 'PLANNING' || state === 'IN_PROGRESS';
}

function formatActivityTime(createTime: string, t: Translator): string {
  const date = new Date(createTime);
  if (Number.isNaN(date.getTime())) return t('unknownTime');

  const now = new Date();
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  if (isToday) return t('todayAt', time);
  if (date.getFullYear() === now.getFullYear()) return t('dateThisYear', date.getMonth() + 1, date.getDate(), time);
  return t('fullDate', date.getFullYear(), date.getMonth() + 1, date.getDate(), time);
}

function getPlanStepPreview(description?: string): string | null {
  if (!description) return null;

  return description
    .split('\n')
    .map(line => line.replace(/^[*•-]\s*/, '').trim())
    .find(Boolean)
    ?.replace(/`/g, '') || null;
}

function activityToTimelineItem(activity: Activity, t: Translator): TimelineItem | null {
  const base = {
    id: activity.id,
    activityId: activity.id,
    timestamp: activity.createTime,
    artifacts: activity.artifacts,
  };

  if (activity.userMessaged) {
    return { ...base, kind: 'user', text: activity.userMessaged.userMessage };
  }
  if (activity.agentMessaged) {
    return { ...base, kind: 'agent', text: activity.agentMessaged.agentMessage };
  }
  if (activity.planGenerated) {
    return { ...base, kind: 'plan', plan: activity.planGenerated.plan, title: t('planGenerated') };
  }
  if (activity.planApproved) {
    return { ...base, kind: 'approved', text: t('planApproved') };
  }
  if (activity.progressUpdated) {
    return {
      ...base,
      kind: 'progress',
      title: activity.progressUpdated.title,
      text: activity.progressUpdated.description,
    };
  }
  if (activity.sessionCompleted) {
    return { ...base, kind: 'completed', title: t('taskCompleted'), text: t('sessionCompletedText') };
  }
  if (activity.sessionFailed) {
    return {
      ...base,
      kind: 'failed',
      title: t('taskIncomplete'),
      text: activity.sessionFailed.reason || t('sessionFailedText'),
    };
  }
  if (activity.artifacts?.length) {
    return { ...base, kind: 'system', title: activity.description || t('newArtifact') };
  }
  return null;
}

function getImageAttachmentErrorMessage(
  error: NonNullable<ImageAttachmentResult['error']>,
  t: Translator,
): string {
  switch (error) {
    case 'too-large':
      return t('imageAttachmentTooLarge');
    case 'unsupported-type':
      return t('imageAttachmentUnsupportedType');
    case 'missing-data':
      return t('imageAttachmentMissingData');
  }
}

export default function ChatScreen() {
  const themeColors = useTheme();
  const { language } = useAppLanguage();
  const t = useMemo(() => createTranslator(language), [language]);
  const {
    sessionId: routeSessionId,
    sourceId: routeSourceId,
    startingBranch: routeStartingBranch,
  } = useLocalSearchParams<{
    sessionId?: string | string[];
    sourceId?: string | string[];
    startingBranch?: string | string[];
  }>();
  const router = useRouter();
  const initialSessionId = getSingleRouteParam(routeSessionId);
  const sourceId = getSingleRouteParam(routeSourceId);
  const startingBranch = getSingleRouteParam(routeStartingBranch);

  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<ImageAttachment | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [pollingTrigger, setPollingTrigger] = useState(0);
  const [isApproving, setIsApproving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activitiesNextPageToken, setActivitiesNextPageToken] = useState<string | undefined>();
  const [hasLoadedOlderActivities, setHasLoadedOlderActivities] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [expandedArtifacts, setExpandedArtifacts] = useState<Set<string>>(new Set());
  const [expandedPlanSteps, setExpandedPlanSteps] = useState<Set<string>>(new Set());
  const [isTimelineScrollable, setIsTimelineScrollable] = useState(false);
  const [scrollPosition, setScrollPosition] = useState<'top' | 'middle' | 'bottom'>('top');
  const flatListRef = useRef<FlatList<TimelineItem>>(null);
  const optimisticMessageSequence = useRef(0);
  const timelineContentHeight = useRef(0);
  const timelineViewportHeight = useRef(0);

  const updateTimelineScrollability = useCallback(() => {
    const scrollable = timelineContentHeight.current > timelineViewportHeight.current + 8;
    setIsTimelineScrollable(scrollable);
    if (!scrollable) setScrollPosition('top');
  }, []);

  const handleTimelineScroll = useCallback((offsetY: number, viewportHeight: number, contentHeight: number) => {
    const threshold = 8;
    const nextPosition = offsetY <= threshold
      ? 'top'
      : offsetY + viewportHeight >= contentHeight - threshold
        ? 'bottom'
        : 'middle';

    setScrollPosition(current => current === nextPosition ? current : nextPosition);
  }, []);

  const scrollTimelineToTop = useCallback(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const scrollTimelineToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const mergeActivities = useCallback((activities: Activity[]) => {
    const nextItems = activities
      .map(activity => activityToTimelineItem(activity, t))
      .filter((item): item is TimelineItem => item !== null)
      .sort((first, second) => new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime());

    if (nextItems.length === 0) return;

    setTimeline(current => {
      const seenActivityIds = new Set(current.map(item => item.activityId).filter(Boolean));
      const merged = [...current];

      nextItems.forEach(item => {
        if (seenActivityIds.has(item.activityId)) return;
        merged.push(item);
        seenActivityIds.add(item.activityId);
      });

      return merged.sort((first, second) => new Date(first.timestamp).getTime() - new Date(second.timestamp).getTime());
    });
  }, [t]);

  useEffect(() => {
    const loadKey = async () => {
      const key = await getApiKey();
      setApiKey(key);
      if (!key) setChatError(t('noApiKeySaved'));
    };
    void loadKey();
  }, [t]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setActivitiesNextPageToken(undefined);
      setHasLoadedOlderActivities(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [sessionId]);

  useEffect(() => {
    if (!apiKey || !sessionId) return;

    let disposed = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let requestInFlight = false;

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const syncSession = async () => {
      if (disposed || requestInFlight) return;
      requestInFlight = true;
      setIsRefreshing(true);
      try {
        const [sessionResult, activityResult] = await Promise.all([
          getSession(apiKey, sessionId),
          pollActivities(apiKey, sessionId),
        ]);
        if (disposed) return;
        setSession(sessionResult);
        mergeActivities(activityResult.activities);
        setPollingTrigger(prev => prev + 1);
        if (!hasLoadedOlderActivities) {
          setActivitiesNextPageToken(activityResult.nextPageToken);
        }
        setChatError(null);
        if (isTerminalState(sessionResult.state)) stopPolling();
      } catch (error) {
        if (!disposed) setChatError(getChatErrorMessage(error, t));
      } finally {
        requestInFlight = false;
        if (!disposed) setIsRefreshing(false);
      }
    };

    const startPolling = () => {
      if (timer || disposed) return;
      void syncSession();
      timer = setInterval(() => void syncSession(), 5000);
    };

    const appStateSubscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') startPolling();
      else stopPolling();
    });

    if (AppState.currentState === 'active') startPolling();

    return () => {
      disposed = true;
      stopPolling();
      appStateSubscription.remove();
    };
  }, [apiKey, hasLoadedOlderActivities, mergeActivities, sessionId, t, pollingTrigger]);

  const handleSend = async () => {
    const prompt = inputText.trim();
    if ((!prompt && !selectedImage) || isSending) return;
    if (!apiKey) {
      setChatError(t('noApiKeySaved'));
      return;
    }
    if (!sessionId && (!sourceId || !startingBranch)) {
      setChatError(t('chooseSourceBranchBeforeStart'));
      return;
    }

    const optimisticId = `local-${++optimisticMessageSequence.current}`;
    const imagePayload = selectedImage ? { data: selectedImage.data, mimeType: selectedImage.mimeType } : undefined;
    let optimisticText = prompt;
    if (selectedImage) {
      optimisticText = optimisticText ? `${optimisticText}\n[Image Attached]` : '[Image Attached]';
    }

    const optimisticItem: TimelineItem = {
      id: optimisticId,
      kind: 'user',
      text: optimisticText,
      timestamp: new Date().toISOString(),
    };

    setTimeline(current => [...current, optimisticItem]);
    setInputText('');
    setSelectedImage(null);
    setIsSending(true);
    setChatError(null);

    try {
      if (!sessionId) {
        const createdSession = await createSession(
          apiKey,
          sourceId as string,
          startingBranch as string,
          prompt || 'Analyze image input',
        );
        const nextSessionId = createdSession.id || createdSession.name.split('/').pop();
        if (!nextSessionId) throw new Error(t('missingSessionId'));
        setSessionId(nextSessionId);
        setSession(createdSession);
        router.setParams({ sessionId: nextSessionId });
      } else {
        await sendMessageToJules(apiKey, sessionId, prompt, imagePayload);
        const [sessionResult, activityResult] = await Promise.all([
          getSession(apiKey, sessionId),
          pollActivities(apiKey, sessionId),
        ]);
        setSession(sessionResult);
        mergeActivities(activityResult.activities);
        setPollingTrigger(prev => prev + 1);
      }
    } catch (error) {
      setTimeline(current => current.filter(item => item.id !== optimisticId));
      setChatError(getChatErrorMessage(error, t));
    } finally {
      setIsSending(false);
    }
  };

  const handleApprovePlan = async () => {
    if (!apiKey || !sessionId || isApproving) return;

    setIsApproving(true);
    setChatError(null);
    try {
      await approvePlan(apiKey, sessionId);
      const [sessionResult, activityResult] = await Promise.all([
        getSession(apiKey, sessionId),
        pollActivities(apiKey, sessionId),
      ]);
      setSession(sessionResult);
      mergeActivities(activityResult.activities);
    } catch (error) {
      setChatError(getChatErrorMessage(error, t));
    } finally {
      setIsApproving(false);
    }
  };

  const loadOlderActivities = async () => {
    if (!apiKey || !sessionId || !activitiesNextPageToken || isLoadingHistory) return;

    setIsLoadingHistory(true);
    try {
      const result = await pollActivities(apiKey, sessionId, activitiesNextPageToken);
      mergeActivities(result.activities);
      setActivitiesNextPageToken(result.nextPageToken);
      setHasLoadedOlderActivities(true);
    } catch (error) {
      setChatError(getChatErrorMessage(error, t));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const toggleArtifact = (artifactId: string) => {
    setExpandedArtifacts(current => {
      const next = new Set(current);
      if (next.has(artifactId)) next.delete(artifactId);
      else next.add(artifactId);
      return next;
    });
  };

  const togglePlanStep = (stepId: string) => {
    setExpandedPlanSteps(current => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  };

  const displaySource = (session?.sourceContext?.source || sourceId || 'Jules').split('/').pop() || 'Jules';
  const activeState = session?.state;
  const waitingForPlan = activeState === 'AWAITING_PLAN_APPROVAL';
  const waitingForFeedback = activeState === 'AWAITING_USER_FEEDBACK';
  const terminal = isTerminalState(activeState);
  const canSend = Boolean((inputText.trim() || selectedImage) && apiKey && (sessionId || (sourceId && startingBranch)) && !isSending);

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const imageAttachment = createImageAttachment(result.assets[0]);
        if (imageAttachment.error !== undefined) {
          setSelectedImage(null);
          setChatError(getImageAttachmentErrorMessage(imageAttachment.error, t));
          return;
        }

        setSelectedImage(imageAttachment.attachment);
        setChatError(null);
      }
    } catch {
      setChatError(t('imageSelectionFailed'));
    }
  };

  const pullRequests = useMemo(
    () => session?.outputs?.flatMap(output => output.pullRequest ? [output.pullRequest] : []) ?? [],
    [session?.outputs],
  );

  const deliveryMetrics = useMemo(() => {
    let changeSets = 0;
    let commands = 0;
    let successfulCommands = 0;

    timeline.forEach(item => {
      item.artifacts?.forEach(artifact => {
        if (artifact.changeSet) changeSets += 1;
        if (artifact.bashOutput) {
          commands += 1;
          if (artifact.bashOutput.exitCode === 0) successfulCommands += 1;
        }
      });
    });

    return { changeSets, commands, successfulCommands };
  }, [timeline]);

  const firstPullRequest = pullRequests[0];
  const headerStatusStyle = {
    bg: activeState === 'COMPLETED'
      ? themeColors.statusCompleteBg
      : activeState === 'FAILED'
        ? themeColors.statusFailedBg
        : waitingForPlan || waitingForFeedback
          ? themeColors.statusAttentionBg
          : themeColors.statusActiveBg,
    text: activeState === 'COMPLETED'
      ? themeColors.statusCompleteText
      : activeState === 'FAILED'
        ? themeColors.statusFailedText
        : waitingForPlan || waitingForFeedback
          ? themeColors.statusAttentionText
          : themeColors.statusActiveText,
  };

  useEffect(() => {
    if (!terminal) return;

    const scrollTimer = setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 0);

    return () => clearTimeout(scrollTimer);
  }, [terminal]);


  const handleOpenExternalLink = async (url: string) => {
    if (!isTrustedPullRequestUrl(url)) {
      setChatError(t('unableOpenLink'));
      return;
    }

    try {
      await Linking.openURL(url);
    } catch {
      setChatError(t('unableOpenLink'));
    }
  };

  const renderArtifact = (artifact: Artifact, itemId: string, index: number) => {
    const artifactId = `${itemId}-${index}`;
    const isExpanded = expandedArtifacts.has(artifactId);

    if (artifact.changeSet?.gitPatch) {
      const patch = artifact.changeSet.gitPatch;
      return (
        <View key={artifactId} style={[styles.artifactCard, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => toggleArtifact(artifactId)} style={styles.artifactHeader}>
            <View style={styles.artifactHeaderCopy}>
              <Text style={[styles.artifactTitle, { color: themeColors.text }]}>{t('codeChanges')}</Text>
              <Text style={[styles.artifactMeta, { color: themeColors.textSecondary }]}>{patch.suggestedCommitMessage || 'Git patch'}</Text>
            </View>
            <Text style={[styles.artifactToggle, { color: themeColors.brand }]}>{isExpanded ? t('collapse') : t('viewDiff')}</Text>
          </TouchableOpacity>
          {isExpanded && patch.unidiffPatch ? (
            <Text selectable style={styles.codeBlock}>{patch.unidiffPatch}</Text>
          ) : null}
        </View>
      );
    }

    if (artifact.bashOutput) {
      return (
        <View key={artifactId} style={[styles.artifactCard, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <TouchableOpacity accessibilityRole="button" onPress={() => toggleArtifact(artifactId)} style={styles.artifactHeader}>
            <View style={styles.artifactHeaderCopy}>
              <Text style={[styles.artifactTitle, { color: themeColors.text }]}>{t('commandOutput')}</Text>
              <Text style={[styles.artifactMeta, { color: themeColors.textSecondary }]} numberOfLines={1}>{artifact.bashOutput.command}</Text>
            </View>
            <Text style={[styles.exitCode, artifact.bashOutput.exitCode === 0 ? styles.exitCodeSuccess : styles.exitCodeError]}>
              {artifact.bashOutput.exitCode === 0 ? t('success') : t('exitCode', artifact.bashOutput.exitCode)}
            </Text>
          </TouchableOpacity>
          {isExpanded ? <Text selectable style={styles.codeBlock}>{artifact.bashOutput.output || t('noOutput')}</Text> : null}
        </View>
      );
    }

    if (artifact.media) {
      const isImage = artifact.media.mimeType.startsWith('image/');
      return (
        <View key={artifactId} style={[styles.artifactCard, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <Text style={[styles.artifactTitle, { color: themeColors.text }]}>{isImage ? t('generatedImage') : t('generatedMedia')}</Text>
          <Text style={[styles.artifactMeta, { color: themeColors.textSecondary }]}>{artifact.media.mimeType}</Text>
          {isImage ? (
            <Image
              style={styles.artifactImage}
              resizeMode="contain"
              source={{ uri: `data:${artifact.media.mimeType};base64,${artifact.media.data}` }}
            />
          ) : null}
        </View>
      );
    }

    return null;
  };

  const renderItem = ({ item }: { item: TimelineItem }) => {
    if (item.kind === 'user' || item.kind === 'agent') {
      const isUser = item.kind === 'user';
      return (
        <View style={[styles.messageBubble, isUser ? [styles.userBubble, { backgroundColor: themeColors.brand }] : [styles.agentBubble, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]]}>
          <Text style={[styles.messageText, isUser ? styles.userText : [styles.agentText, { color: themeColors.text }]]}>{item.text}</Text>
          {item.artifacts?.map((artifact, index) => renderArtifact(artifact, item.id, index))}
          <Text
            accessibilityLabel={t('activityTime', formatActivityTime(item.timestamp, t))}
            style={[styles.messageTime, isUser ? styles.userMessageTime : [styles.agentMessageTime, { color: themeColors.textSecondary }]]}
          >
            {formatActivityTime(item.timestamp, t)}
          </Text>
        </View>
      );
    }

    if (item.kind === 'plan') {
      const steps = item.plan?.steps || [];
      return (
        <View style={[styles.eventCard, styles.planCard, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <View style={styles.eventMetaRow}>
            <Text style={[styles.eventEyebrow, { color: themeColors.brand }]}>{t('planGenerated')}</Text>
            <Text style={[styles.eventTime, { color: themeColors.textSecondary }]}>{formatActivityTime(item.timestamp, t)}</Text>
          </View>
          <Text style={[styles.eventTitle, { color: themeColors.text }]}>{item.title}</Text>
          <Text style={[styles.planHint, { color: themeColors.textSecondary }]}>{t('planHint')}</Text>
          {steps.map((step, index) => {
            const stepId = `${item.id}-step-${index}`;
            const isStepExpanded = expandedPlanSteps.has(stepId);
            const previewText = getPlanStepPreview(step.description);

            return (
              <View key={stepId} style={styles.planStep}>
                <Text style={[styles.planIndex, { backgroundColor: themeColors.brandSubtle, color: themeColors.brand }]}>{index + 1}</Text>
                <View style={styles.planCopy}>
                  <Text style={[styles.planStepTitle, { color: themeColors.text }]}>{step.title || `${index + 1}`}</Text>
                  {previewText ? (
                    <Text style={[styles.planStepPreview, { color: themeColors.textSecondary }]} numberOfLines={isStepExpanded ? undefined : 2}>
                      {previewText}
                    </Text>
                  ) : null}
                  {step.description ? (
                    <TouchableOpacity accessibilityRole="button" onPress={() => togglePlanStep(stepId)} style={styles.planDetailButton}>
                      <Text style={[styles.planDetailButtonText, { color: themeColors.brand }]}>
                        {isStepExpanded ? t('collapseTechnicalDetails') : t('viewTechnicalDetails')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {isStepExpanded && step.description ? (
                    <Text style={[styles.planStepDescription, { backgroundColor: themeColors.chipBg, color: themeColors.text }]}>{step.description}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
          {waitingForPlan ? (
            <View style={styles.planActions}>
              <TouchableOpacity style={[styles.approveButton, { backgroundColor: themeColors.brand }]} onPress={handleApprovePlan} disabled={isApproving}>
                {isApproving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.approveButtonText}>{t('approveAndRun')}</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }

    const cardToneStyle = {
      progress: { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder },
      approved: { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder },
      completed: { backgroundColor: themeColors.statusCompleteBg, borderColor: themeColors.cardBorder },
      failed: { backgroundColor: themeColors.statusFailedBg, borderColor: themeColors.cardBorder },
      system: { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder },
    }[item.kind] || { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder };

    return (
      <View style={[styles.eventCard, cardToneStyle]}>
        <View style={styles.eventMetaRow}>
          <Text style={[styles.eventEyebrow, { color: themeColors.brand }]}>{item.kind.toUpperCase()}</Text>
          <Text style={[styles.eventTime, { color: themeColors.textSecondary }]}>{formatActivityTime(item.timestamp, t)}</Text>
        </View>
        {item.title ? <Text style={[styles.eventTitle, { color: themeColors.text }]}>{item.title}</Text> : null}
        {item.text ? <Text style={[styles.eventText, { color: themeColors.textSecondary }]}>{item.text}</Text> : null}
        {item.artifacts?.map((artifact, index) => renderArtifact(artifact, item.id, index))}
      </View>
    );
  };

  const listFooter = activitiesNextPageToken ? (
    <TouchableOpacity style={[styles.historyButton, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]} onPress={loadOlderActivities} disabled={isLoadingHistory}>
      {isLoadingHistory ? <ActivityIndicator size="small" color={themeColors.brand} /> : <Text style={[styles.historyButtonText, { color: themeColors.brand }]}>{t('loadOlderActivities')}</Text>}
    </TouchableOpacity>
  ) : null;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <View style={[styles.header, { backgroundColor: themeColors.topBar, borderBottomColor: themeColors.topBarBorder }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('back')}
            style={[styles.backButton, { backgroundColor: themeColors.brandSubtle }]}
            onPress={() => router.back()}
          >
            <Text style={[styles.backButtonText, { color: themeColors.brand }]}>‹</Text>
          </TouchableOpacity>
          <Image source={require('@/assets/images/jules-logo.png')} style={styles.headerLogo} />
          <View style={styles.headerCopy}>
            <Text style={[styles.headerContext, { color: themeColors.textSecondary }]} numberOfLines={1}>
              {displaySource} · {startingBranch || session?.sourceContext?.githubRepoContext?.startingBranch || t('selectedBranch')}
            </Text>
            <Text style={[styles.headerTitle, { color: themeColors.text }]} numberOfLines={1}>
              {session?.title || session?.prompt || t('workbench')}
            </Text>
          </View>
          <View style={[styles.statusChip, { backgroundColor: headerStatusStyle.bg }]}>
            <Text style={[styles.statusChipText, { color: headerStatusStyle.text }]}>{getSessionStateLabel(activeState, t)}</Text>
          </View>
        </View>

        {waitingForPlan || waitingForFeedback ? (
          <View style={[styles.attentionBanner, { backgroundColor: themeColors.statusAttentionBg, borderBottomColor: themeColors.cardBorder }]}>
            <Text style={[styles.attentionBannerText, { color: themeColors.statusAttentionText }]}>
              {waitingForPlan ? t('planReadyBanner') : t('feedbackBanner')}
            </Text>
          </View>
        ) : null}

        <FlatList
          ref={flatListRef}
          data={timeline}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.timelineContent}
          onContentSizeChange={(_, height) => {
            timelineContentHeight.current = height;
            updateTimelineScrollability();
          }}
          onLayout={event => {
            timelineViewportHeight.current = event.nativeEvent.layout.height;
            updateTimelineScrollability();
          }}
          onScroll={event => {
            handleTimelineScroll(
              event.nativeEvent.contentOffset.y,
              event.nativeEvent.layoutMeasurement.height,
              event.nativeEvent.contentSize.height,
            );
          }}
          scrollEventThrottle={16}
          ListHeaderComponent={(
            <View style={styles.listHeader}>
              {session?.prompt ? (
                <View style={[styles.taskSummary, { backgroundColor: themeColors.brandSubtle, borderColor: themeColors.chipBorder }]}>
                  <Text style={[styles.taskSummaryLabel, { color: themeColors.brand }]}>{t('taskGoal')}</Text>
                  <Text style={[styles.taskSummaryText, { color: themeColors.text }]}>{session.prompt}</Text>
                </View>
              ) : null}

              {terminal ? (
                <View style={[styles.deliveryCard, activeState === 'FAILED' && styles.deliveryCardFailed]}>
                  <Text style={[styles.deliveryEyebrow, activeState === 'FAILED' && styles.deliveryEyebrowFailed]}>
                    {activeState === 'COMPLETED' ? t('taskCompleted') : t('taskIncomplete')}
                  </Text>
                  <Text style={styles.deliveryTitle}>{activeState === 'COMPLETED' ? t('prCreatedDelivery') : t('failedDelivery')}</Text>
                  <Text style={styles.deliveryText}>
                    {activeState === 'COMPLETED' ? t('completedDelivery') : t('sessionFailedText')}
                  </Text>
                  {activeState === 'COMPLETED' ? (
                    <View style={styles.deliveryMetrics}>
                      <View style={styles.deliveryMetric}><Text style={styles.deliveryMetricText}>{t('changesCount', deliveryMetrics.changeSets)}</Text></View>
                      <View style={styles.deliveryMetric}><Text style={styles.deliveryMetricText}>{t('commandSuccessCount', deliveryMetrics.successfulCommands, deliveryMetrics.commands)}</Text></View>
                    </View>
                  ) : null}
                  {firstPullRequest ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('openPullRequest')}
                      style={styles.deliveryPrimaryAction}
                      onPress={() => void handleOpenExternalLink(firstPullRequest.url)}
                    >
                      <Text style={styles.deliveryPrimaryActionText}>{t('openPullRequest')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              {isRefreshing ? <ActivityIndicator color={themeColors.brand} /> : null}
              <Text style={[styles.emptyStateTitle, { color: themeColors.text }]}>{sessionId ? t('loadingSessionActivities') : t('describeTaskForJules')}</Text>
              <Text style={[styles.emptyStateText, { color: themeColors.textSecondary }]}>
                {sessionId ? t('activityPlaceholder') : t('taskRunsOn', displaySource, startingBranch || t('selectedBranch'))}
              </Text>
            </View>
          )}
          ListFooterComponent={listFooter}
        />

        {isTimelineScrollable ? (
          <View style={[styles.scrollControls, styles.scrollControlsWithComposer]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('scrollToTop')}
              accessibilityState={{ disabled: scrollPosition === 'top' }}
              disabled={scrollPosition === 'top'}
              onPress={scrollTimelineToTop}
              style={[styles.scrollControlButton, { backgroundColor: themeColors.brand }, scrollPosition === 'top' && styles.scrollControlButtonDisabled]}
            >
              <Text style={styles.scrollControlIcon}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('scrollToBottom')}
              accessibilityState={{ disabled: scrollPosition === 'bottom' }}
              disabled={scrollPosition === 'bottom'}
              onPress={scrollTimelineToBottom}
              style={[styles.scrollControlButton, { backgroundColor: themeColors.brand }, scrollPosition === 'bottom' && styles.scrollControlButtonDisabled]}
            >
              <Text style={styles.scrollControlIcon}>↓</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {chatError ? (
          <View style={styles.errorNotice}>
            <Text style={styles.errorNoticeText}>{chatError}</Text>
          </View>
        ) : null}

        {isWorkingState(activeState) ? (
          <View accessibilityLiveRegion="polite" style={[styles.workingIndicator, { backgroundColor: themeColors.brandSubtle }]}>
            <ActivityIndicator size="small" color={themeColors.brand} />
            <Text style={[styles.workingIndicatorText, { color: themeColors.brand }]}>{t('julesWorking')}</Text>
          </View>
        ) : null}

          <View style={[styles.composerContainer, { backgroundColor: themeColors.topBar, borderTopColor: themeColors.topBarBorder }]}>
            {selectedImage && (
              <View style={styles.imagePreviewContainer}>
                <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.imagePreviewRemove}
                  onPress={() => setSelectedImage(null)}
                >
                  <Text style={styles.imagePreviewRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.composerShell}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('attachImage')}
                style={[styles.attachButton, { backgroundColor: themeColors.composerBg, borderColor: themeColors.composerBorder }]}
                onPress={handlePickImage}
                disabled={isSending}
              >
                <Text style={[styles.attachButtonText, { color: themeColors.brand }]}>+</Text>
              </TouchableOpacity>
              <TextInput
                accessibilityLabel={t('sendMessageToJules')}
                style={[styles.composerInput, { backgroundColor: themeColors.composerBg, borderColor: themeColors.composerBorder, color: themeColors.text }]}
                value={inputText}
                onChangeText={setInputText}
                placeholder={waitingForPlan ? t('adjustPlanPlaceholder') : t('replyPlaceholder')}
                placeholderTextColor={themeColors.textMuted}
                multiline
                textAlignVertical="top"
                maxLength={2000}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('sendMessage')}
                disabled={!canSend}
                style={[styles.sendButton, { backgroundColor: themeColors.brand }, !canSend && styles.sendButtonDisabled]}
                onPress={handleSend}
              >
                {isSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.sendButtonText}>{t('send')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 14, borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { fontSize: 24, lineHeight: 26, fontWeight: '700', marginTop: -2 },
  headerLogo: { width: 28, height: 28, borderRadius: 14 },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  headerContext: { fontSize: 11, lineHeight: 15, fontWeight: '700' },
  headerTitle: { fontSize: 15, lineHeight: 20, fontWeight: '800' },
  statusChip: { minHeight: 30, maxWidth: 98, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  statusChipText: { fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  attentionBanner: { paddingHorizontal: 18, paddingVertical: 10, borderBottomWidth: 1 },
  attentionBannerText: { fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  timelineContent: { padding: 16, paddingBottom: 22, flexGrow: 1, gap: 12 },
  scrollControls: { position: 'absolute', right: 16, zIndex: 2, gap: 8 },
  scrollControlsWithComposer: { bottom: 94 },
  scrollControlsWithTerminalDock: { bottom: 84 },
  scrollControlButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#000000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4 },
  scrollControlButtonDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  scrollControlIcon: { color: '#FFFFFF', fontSize: 22, lineHeight: 26, fontWeight: '800' },
  listHeader: { gap: 12 },
  taskSummary: { borderRadius: 16, padding: 14, borderWidth: 1 },
  taskSummaryLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  taskSummaryText: { fontSize: 14, lineHeight: 21, marginTop: 5, fontWeight: '600' },
  emptyState: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 220, paddingHorizontal: 30, gap: 8 },
  emptyStateTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyStateText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  messageBubble: { maxWidth: '89%', borderRadius: 18, padding: 13, marginVertical: 2 },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  agentBubble: { alignSelf: 'flex-start', borderWidth: 1, borderBottomLeftRadius: 5 },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  agentText: { fontSize: 15, lineHeight: 22 },
  messageTime: { alignSelf: 'flex-end', marginTop: 7, fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  userMessageTime: { color: 'rgba(255,255,255,0.76)' },
  agentMessageTime: { fontSize: 11 },
  eventCard: { borderRadius: 17, padding: 15, borderWidth: 1, marginVertical: 2 },
  planCard: { borderWidth: 1 },
  deliveryCard: { borderRadius: 18, padding: 15, backgroundColor: '#EEFBF3', borderWidth: 1, borderColor: '#C8EFDA' },
  deliveryCardFailed: { backgroundColor: '#FFF5F5', borderColor: '#FFD9D7' },
  deliveryEyebrow: { color: '#176B3C', fontSize: 11, lineHeight: 15, letterSpacing: 0.7, fontWeight: '800' },
  deliveryEyebrowFailed: { color: '#AE3027' },
  deliveryTitle: { color: '#243B2D', fontSize: 20, lineHeight: 27, fontWeight: '900', marginTop: 3 },
  deliveryText: { color: '#4E6657', fontSize: 14, lineHeight: 20, marginTop: 5 },
  deliveryMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  deliveryMetric: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#FFFFFF' },
  deliveryMetricText: { color: '#43604D', fontSize: 11, lineHeight: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  deliveryPrimaryAction: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#25734A', marginTop: 14 },
  deliveryPrimaryActionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  eventMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  eventEyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  eventTime: { fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  eventTitle: { fontSize: 16, lineHeight: 22, fontWeight: '800', marginTop: 4 },
  eventText: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  planHint: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  planStep: { flexDirection: 'row', gap: 10, paddingTop: 13 },
  planIndex: { width: 23, height: 23, borderRadius: 12, textAlign: 'center', paddingTop: 3, overflow: 'hidden', fontSize: 12, fontWeight: '800' },
  planCopy: { flex: 1 },
  planStepTitle: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  planStepPreview: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  planDetailButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 2, paddingVertical: 4 },
  planDetailButtonText: { fontSize: 13, fontWeight: '800' },
  planStepDescription: { fontSize: 13, lineHeight: 20, marginTop: 3, padding: 10, borderRadius: 10 },
  planActions: { flexDirection: 'row', gap: 10, marginTop: 17 },
  approveButton: { minHeight: 44, flex: 1.2, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  approveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  artifactCard: { borderRadius: 12, borderWidth: 1, padding: 10, marginTop: 11 },
  artifactHeader: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  artifactHeaderCopy: { flex: 1 },
  artifactTitle: { fontSize: 13, fontWeight: '800' },
  artifactMeta: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  artifactToggle: { fontSize: 12, fontWeight: '800' },
  exitCode: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden', fontSize: 10, fontWeight: '800' },
  exitCodeSuccess: { color: '#197044', backgroundColor: '#DFF7E9' },
  exitCodeError: { color: '#B42318', backgroundColor: '#FFE5E3' },
  codeBlock: { marginTop: 10, maxHeight: 240, borderRadius: 8, overflow: 'hidden', backgroundColor: '#28243A', color: '#F4F2FF', padding: 10, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11, lineHeight: 16 },
  artifactImage: { width: '100%', height: 180, borderRadius: 8, marginTop: 10, backgroundColor: '#F4F2FA' },
  historyButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  historyButtonText: { fontSize: 13, fontWeight: '800' },
  errorNotice: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFF4F3', borderTopWidth: 1, borderTopColor: '#FFD7D2' },
  errorNoticeText: { color: '#AA3027', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  workingIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9 },
  workingIndicatorText: { fontSize: 12, fontWeight: '700' },
  composerContainer: { borderTopWidth: 1, flexDirection: 'column' },
  imagePreviewContainer: { paddingHorizontal: 13, paddingTop: 10, flexDirection: 'row' },
  imagePreview: { width: 60, height: 60, borderRadius: 8, backgroundColor: '#F4F2FA' },
  imagePreviewRemove: { position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.5)', width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  imagePreviewRemoveText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  composerShell: { flexDirection: 'row', alignItems: 'stretch', gap: 10, paddingHorizontal: 13, paddingVertical: 10 },
  attachButton: { width: 44, minHeight: 56, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  attachButtonText: { fontSize: 24, fontWeight: '400', marginTop: -4 },
  composerInput: { flex: 1, minHeight: 56, maxHeight: 120, borderRadius: 15, borderWidth: 1, paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10, fontSize: 15, lineHeight: 21 },
  sendButton: { width: 64, minHeight: 56, alignSelf: 'stretch', borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  terminalDock: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderTopWidth: 1 },
  terminalDockCopy: { flex: 1, minWidth: 0 },
  terminalDockTitle: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  terminalDockText: { fontSize: 11, lineHeight: 16, marginTop: 1 },
  terminalActionButton: { minWidth: 116, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13 },
  terminalActionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});

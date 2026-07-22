import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

export default function ChatScreen() {
  const { language } = useAppLanguage();
  const t = useMemo(() => createTranslator(language), [language]);
  const { sessionId: routeSessionId, sourceId, startingBranch } = useLocalSearchParams<{
    sessionId?: string;
    sourceId?: string;
    startingBranch?: string;
  }>();
  const router = useRouter();
  const initialSessionId = Array.isArray(routeSessionId) ? routeSessionId[0] : routeSessionId;

  const [sessionId, setSessionId] = useState<string | null>(initialSessionId || null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
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
  }, [apiKey, hasLoadedOlderActivities, mergeActivities, sessionId, t]);

  const handleSend = async () => {
    const prompt = inputText.trim();
    if (!prompt || isSending) return;
    if (!apiKey) {
      setChatError(t('noApiKeySaved'));
      return;
    }
    if (isTerminalState(session?.state)) return;
    if (!sessionId && (!sourceId || !startingBranch)) {
      setChatError(t('chooseSourceBranchBeforeStart'));
      return;
    }

    const optimisticId = `local-${Date.now()}`;
    setTimeline(current => [
      ...current,
      { id: optimisticId, kind: 'user', text: prompt, timestamp: new Date().toISOString() },
    ]);
    setInputText('');
    setChatError(null);
    setIsSending(true);

    try {
      if (!sessionId) {
        const created = await createSession(apiKey, sourceId!, startingBranch!, prompt);
        const createdId = created.id || created.name.split('/').pop();
        if (!createdId) throw new Error(t('missingSessionId'));
        setSession(created);
        setSessionId(createdId);
      } else {
        await sendMessageToJules(apiKey, sessionId, prompt);
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
      setSession(current => current ? { ...current, state: 'IN_PROGRESS' } : current);
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
      setHasLoadedOlderActivities(true);
      setActivitiesNextPageToken(result.nextPageToken);
    } catch (error) {
      setChatError(getChatErrorMessage(error, t));
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleAdjustPlan = () => {
    setInputText(t('adjustPlanPrompt'));
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
  const canSend = Boolean(inputText.trim() && apiKey && (sessionId || (sourceId && startingBranch)) && !isSending && !terminal);
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
  const headerStatusStyle = activeState === 'COMPLETED'
    ? styles.statusChipCompleted
    : activeState === 'FAILED'
      ? styles.statusChipFailed
      : waitingForPlan || waitingForFeedback
        ? styles.statusChipAttention
        : styles.statusChipActive;
  const headerStatusTextStyle = activeState === 'COMPLETED'
    ? styles.statusChipTextCompleted
    : activeState === 'FAILED'
      ? styles.statusChipTextFailed
      : waitingForPlan || waitingForFeedback
        ? styles.statusChipTextAttention
        : styles.statusChipTextActive;

  useEffect(() => {
    if (!terminal) return;

    const scrollTimer = setTimeout(() => {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 0);

    return () => clearTimeout(scrollTimer);
  }, [terminal]);

  const handleStartFollowUp = () => {
    router.replace({
      pathname: '/',
      params: {
        sourceId: session?.sourceContext?.source,
        startingBranch: session?.sourceContext?.githubRepoContext?.startingBranch,
      },
    });
  };

  const handleOpenExternalLink = async (url: string) => {
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
        <View key={artifactId} style={styles.artifactCard}>
          <TouchableOpacity accessibilityRole="button" onPress={() => toggleArtifact(artifactId)} style={styles.artifactHeader}>
            <View style={styles.artifactHeaderCopy}>
              <Text style={styles.artifactTitle}>{t('codeChanges')}</Text>
              <Text style={styles.artifactMeta}>{patch.suggestedCommitMessage || 'Git patch'}</Text>
            </View>
            <Text style={styles.artifactToggle}>{isExpanded ? t('collapse') : t('viewDiff')}</Text>
          </TouchableOpacity>
          {isExpanded && patch.unidiffPatch ? (
            <Text selectable style={styles.codeBlock}>{patch.unidiffPatch}</Text>
          ) : null}
        </View>
      );
    }

    if (artifact.bashOutput) {
      return (
        <View key={artifactId} style={styles.artifactCard}>
          <TouchableOpacity accessibilityRole="button" onPress={() => toggleArtifact(artifactId)} style={styles.artifactHeader}>
            <View style={styles.artifactHeaderCopy}>
              <Text style={styles.artifactTitle}>{t('commandOutput')}</Text>
              <Text style={styles.artifactMeta} numberOfLines={1}>{artifact.bashOutput.command}</Text>
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
        <View key={artifactId} style={styles.artifactCard}>
          <Text style={styles.artifactTitle}>{isImage ? t('generatedImage') : t('generatedMedia')}</Text>
          <Text style={styles.artifactMeta}>{artifact.media.mimeType}</Text>
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
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.agentText]}>{item.text}</Text>
          {item.artifacts?.map((artifact, index) => renderArtifact(artifact, item.id, index))}
          <Text
            accessibilityLabel={t('activityTime', formatActivityTime(item.timestamp, t))}
            style={[styles.messageTime, isUser ? styles.userMessageTime : styles.agentMessageTime]}
          >
            {formatActivityTime(item.timestamp, t)}
          </Text>
        </View>
      );
    }

    if (item.kind === 'plan') {
      const steps = item.plan?.steps.slice().sort((first, second) => first.index - second.index) ?? [];
      return (
        <View style={[styles.eventCard, styles.planCard]}>
          <View style={styles.eventMetaRow}>
            <Text style={styles.eventEyebrow}>{t('executionPlanSteps', steps.length)}</Text>
            <Text accessibilityLabel={t('activityTime', formatActivityTime(item.timestamp, t))} style={styles.eventTime}>
              {formatActivityTime(item.timestamp, t)}
            </Text>
          </View>
          <Text style={styles.eventTitle}>{item.title}</Text>
          <Text style={styles.planHint}>{t('planHint')}</Text>
          {steps.map((step, index) => {
            const stepKey = `${item.id}-${step.id}`;
            const isExpanded = expandedPlanSteps.has(stepKey);
            const preview = getPlanStepPreview(step.description);

            return (
              <View key={step.id} style={styles.planStep}>
                <Text style={styles.planIndex}>{index + 1}</Text>
                <View style={styles.planCopy}>
                  <Text style={styles.planStepTitle}>{step.title}</Text>
                  {preview && !isExpanded ? <Text selectable numberOfLines={2} style={styles.planStepPreview}>{preview}</Text> : null}
                  {step.description ? (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('stepDetailsLabel', isExpanded ? t('collapse') : t('view'), index + 1)}
                      accessibilityState={{ expanded: isExpanded }}
                      onPress={() => togglePlanStep(stepKey)}
                      style={styles.planDetailButton}
                    >
                      <Text style={styles.planDetailButtonText}>{isExpanded ? t('collapseTechnicalDetails') : t('viewTechnicalDetails')}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {isExpanded && step.description ? <Text selectable style={styles.planStepDescription}>{step.description}</Text> : null}
                </View>
              </View>
            );
          })}
          {waitingForPlan ? (
            <View style={styles.planActions}>
              <TouchableOpacity style={styles.adjustPlanButton} onPress={handleAdjustPlan}>
                <Text style={styles.adjustPlanButtonText}>{t('adjustPlan')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.approveButton} onPress={handleApprovePlan} disabled={isApproving}>
                {isApproving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={styles.approveButtonText}>{t('approveAndRun')}</Text>}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }

    const eventStyle = item.kind === 'failed' ? styles.failedCard : item.kind === 'completed' ? styles.completedCard : styles.progressCard;
    return (
      <View style={[styles.eventCard, eventStyle]}>
        <View style={styles.eventMetaRow}>
          <Text style={styles.eventEyebrow}>
            {item.kind === 'completed' ? t('completed') : item.kind === 'failed' ? t('needsAttention') : item.kind === 'approved' ? t('planApproved') : t('latestProgress')}
          </Text>
          <Text accessibilityLabel={t('activityTime', formatActivityTime(item.timestamp, t))} style={styles.eventTime}>
            {formatActivityTime(item.timestamp, t)}
          </Text>
        </View>
        {item.title ? <Text style={styles.eventTitle}>{item.title}</Text> : null}
        {item.text ? <Text style={styles.eventText}>{item.text}</Text> : null}
        {item.artifacts?.map((artifact, index) => renderArtifact(artifact, item.id, index))}
      </View>
    );
  };

  const listFooter = (
    <View>
      {activitiesNextPageToken ? (
        <TouchableOpacity style={styles.historyButton} onPress={loadOlderActivities} disabled={isLoadingHistory}>
          {isLoadingHistory ? <ActivityIndicator size="small" color="#5D4EC3" /> : <Text style={styles.historyButtonText}>{t('loadOlderActivities')}</Text>}
        </TouchableOpacity>
      ) : null}
      {pullRequests.map(pullRequest => (
        <TouchableOpacity
          key={pullRequest.url}
          accessibilityRole="link"
          style={styles.prCard}
          onPress={() => void handleOpenExternalLink(pullRequest.url)}
        >
          <View style={styles.prIcon}><Text style={styles.prIconText}>PR</Text></View>
          <View style={styles.prCopy}>
            <Text style={styles.prTitle}>{pullRequest.title || t('prTitle')}</Text>
            <Text style={styles.prDescription} numberOfLines={2}>{pullRequest.description || t('prDescription')}</Text>
          </View>
          <Text style={styles.prArrow}>↗</Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('backToHome')} onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>‹ JulesMe</Text>
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.headerContext}>{t('repository')}</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>{displaySource}</Text>
          </View>
          <View style={[styles.statusChip, headerStatusStyle]}>
            <Text style={[styles.statusChipText, headerStatusTextStyle]}>{getSessionStateLabel(activeState, t)}</Text>
          </View>
        </View>

        {waitingForPlan || waitingForFeedback ? (
          <View style={styles.attentionBanner}>
            <Text style={styles.attentionBannerText}>
              {waitingForPlan ? t('planReadyBanner') : t('feedbackBanner')}
            </Text>
          </View>
        ) : null}

        <FlatList
          ref={flatListRef}
          data={timeline}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.timelineContent}
          onContentSizeChange={(_, height) => {
            timelineContentHeight.current = height;
            updateTimelineScrollability();
            if (!terminal) flatListRef.current?.scrollToEnd({ animated: true });
          }}
          onLayout={event => {
            timelineViewportHeight.current = event.nativeEvent.layout.height;
            updateTimelineScrollability();
            if (!terminal) flatListRef.current?.scrollToEnd({ animated: false });
          }}
          onScroll={event => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            handleTimelineScroll(contentOffset.y, layoutMeasurement.height, contentSize.height);
          }}
          scrollEventThrottle={16}
          ListHeaderComponent={session?.prompt || terminal ? (
            <View style={styles.listHeader}>
              {session?.prompt ? (
                <View style={styles.taskSummary}>
                  <Text style={styles.taskSummaryLabel}>{t('taskGoal')}</Text>
                  <Text selectable style={styles.taskSummaryText}>{session.prompt}</Text>
                </View>
              ) : null}
              {terminal ? (
                <View style={[styles.deliveryCard, activeState === 'FAILED' && styles.deliveryCardFailed]}>
                  <Text style={[styles.deliveryEyebrow, activeState === 'FAILED' && styles.deliveryEyebrowFailed]}>
                    {activeState === 'COMPLETED' ? t('deliveryResult') : t('needsAttention')}
                  </Text>
                  <Text style={styles.deliveryTitle}>{activeState === 'COMPLETED' ? t('taskCompleted') : t('taskIncomplete')}</Text>
                  <Text style={styles.deliveryText}>
                    {activeState === 'COMPLETED'
                      ? firstPullRequest ? t('prCreatedDelivery') : t('completedDelivery')
                      : t('failedDelivery')}
                  </Text>
                  <View style={styles.deliveryMetrics}>
                    <View style={styles.deliveryMetric}><Text style={styles.deliveryMetricText}>{t('activityCount', timeline.length)}</Text></View>
                    {deliveryMetrics.changeSets ? <View style={styles.deliveryMetric}><Text style={styles.deliveryMetricText}>{t('changesCount', deliveryMetrics.changeSets)}</Text></View> : null}
                    {deliveryMetrics.commands ? <View style={styles.deliveryMetric}><Text style={styles.deliveryMetricText}>{t('commandSuccessCount', deliveryMetrics.successfulCommands, deliveryMetrics.commands)}</Text></View> : null}
                    {pullRequests.length ? <View style={styles.deliveryMetric}><Text style={styles.deliveryMetricText}>{t('prCount', pullRequests.length)}</Text></View> : null}
                  </View>
                  {firstPullRequest ? (
                    <TouchableOpacity
                      accessibilityRole="link"
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
          ) : null}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              {isRefreshing ? <ActivityIndicator color="#6656D7" /> : null}
              <Text style={styles.emptyStateTitle}>{sessionId ? t('loadingSessionActivities') : t('describeTaskForJules')}</Text>
              <Text style={styles.emptyStateText}>
                {sessionId ? t('activityPlaceholder') : t('taskRunsOn', displaySource, startingBranch || t('selectedBranch'))}
              </Text>
            </View>
          )}
          ListFooterComponent={listFooter}
        />

        {isTimelineScrollable ? (
          <View style={[styles.scrollControls, terminal ? styles.scrollControlsWithTerminalDock : styles.scrollControlsWithComposer]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('scrollToTop')}
              accessibilityState={{ disabled: scrollPosition === 'top' }}
              disabled={scrollPosition === 'top'}
              onPress={scrollTimelineToTop}
              style={[styles.scrollControlButton, scrollPosition === 'top' && styles.scrollControlButtonDisabled]}
            >
              <Text style={styles.scrollControlIcon}>↑</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('scrollToBottom')}
              accessibilityState={{ disabled: scrollPosition === 'bottom' }}
              disabled={scrollPosition === 'bottom'}
              onPress={scrollTimelineToBottom}
              style={[styles.scrollControlButton, scrollPosition === 'bottom' && styles.scrollControlButtonDisabled]}
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
          <View accessibilityLiveRegion="polite" style={styles.workingIndicator}>
            <ActivityIndicator size="small" color="#6656D7" />
            <Text style={styles.workingIndicatorText}>{t('julesWorking')}</Text>
          </View>
        ) : null}

        {terminal ? (
          <View style={styles.terminalDock}>
            <View style={styles.terminalDockCopy}>
              <Text style={styles.terminalDockTitle}>{activeState === 'COMPLETED' ? t('sessionEnded') : t('taskIncomplete')}</Text>
              <Text style={styles.terminalDockText}>{activeState === 'COMPLETED' ? t('continueSameRepository') : t('retrySameRepository')}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={activeState === 'COMPLETED' ? t('startFollowUp') : t('restartTask')}
              style={styles.terminalActionButton}
              onPress={handleStartFollowUp}
            >
              <Text style={styles.terminalActionButtonText}>{activeState === 'COMPLETED' ? t('startFollowUp') : t('restartTask')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.composerShell}>
            <TextInput
              accessibilityLabel={t('sendMessageToJules')}
              style={styles.composerInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder={waitingForPlan ? t('adjustPlanPlaceholder') : t('replyPlaceholder')}
              placeholderTextColor="#706A7C"
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('sendMessage')}
              disabled={!canSend}
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              onPress={handleSend}
            >
              {isSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.sendButtonText}>{t('send')}</Text>}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FC' },
  keyboardView: { flex: 1 },
  header: { minHeight: 72, paddingHorizontal: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E9E7F5', flexDirection: 'row', alignItems: 'center', gap: 8 },
  backButton: { minWidth: 96, minHeight: 44, justifyContent: 'center' },
  backButtonText: { color: '#5B4BC4', fontSize: 14, fontWeight: '800' },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: 2 },
  headerContext: { color: '#77718C', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  headerTitle: { color: '#302A48', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  statusChip: { minHeight: 30, maxWidth: 98, borderRadius: 999, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  statusChipActive: { backgroundColor: '#EEEAFE' },
  statusChipAttention: { backgroundColor: '#FFF1D6' },
  statusChipCompleted: { backgroundColor: '#DCF6E6' },
  statusChipFailed: { backgroundColor: '#FFE5E3' },
  statusChipText: { fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
  statusChipTextActive: { color: '#5D4EC3' },
  statusChipTextAttention: { color: '#875A00' },
  statusChipTextCompleted: { color: '#176B3C' },
  statusChipTextFailed: { color: '#AE3027' },
  attentionBanner: { backgroundColor: '#FFF2D7', borderBottomWidth: 1, borderBottomColor: '#FFE0A0', paddingHorizontal: 18, paddingVertical: 10 },
  attentionBannerText: { color: '#76520A', fontSize: 13, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
  timelineContent: { padding: 16, paddingBottom: 22, flexGrow: 1, gap: 12 },
  scrollControls: { position: 'absolute', right: 16, zIndex: 2, gap: 8 },
  scrollControlsWithComposer: { bottom: 94 },
  scrollControlsWithTerminalDock: { bottom: 84 },
  scrollControlButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6656D7', borderWidth: 1, borderColor: '#FFFFFF', shadowColor: '#31246F', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 4 }, shadowRadius: 10, elevation: 4 },
  scrollControlButtonDisabled: { backgroundColor: '#E5E1F7', shadowOpacity: 0, elevation: 0 },
  scrollControlIcon: { color: '#FFFFFF', fontSize: 22, lineHeight: 26, fontWeight: '800' },
  listHeader: { gap: 12 },
  taskSummary: { backgroundColor: '#EFEDFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#DCD7FF' },
  taskSummaryLabel: { color: '#6252C5', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  taskSummaryText: { color: '#38314F', fontSize: 14, lineHeight: 21, marginTop: 5, fontWeight: '600' },
  emptyState: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 220, paddingHorizontal: 30, gap: 8 },
  emptyStateTitle: { color: '#40394F', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyStateText: { color: '#7D778D', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  messageBubble: { maxWidth: '89%', borderRadius: 18, padding: 13, marginVertical: 2 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#6656D7', borderBottomRightRadius: 5 },
  agentBubble: { alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#EAE7F2', borderBottomLeftRadius: 5 },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#FFFFFF' },
  agentText: { color: '#393249' },
  messageTime: { alignSelf: 'flex-end', marginTop: 7, fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  userMessageTime: { color: 'rgba(255,255,255,0.76)' },
  agentMessageTime: { color: '#918A9E' },
  eventCard: { borderRadius: 17, padding: 15, borderWidth: 1, marginVertical: 2 },
  planCard: { backgroundColor: '#FFFFFF', borderColor: '#DDD7FF' },
  progressCard: { backgroundColor: '#F8F7FC', borderColor: '#EAE7F2' },
  completedCard: { backgroundColor: '#EEFBF3', borderColor: '#C8EFDA' },
  failedCard: { backgroundColor: '#FFF5F5', borderColor: '#FFD9D7' },
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
  eventEyebrow: { color: '#6A5BC7', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  eventTime: { color: '#918A9E', fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  eventTitle: { color: '#372F48', fontSize: 16, lineHeight: 22, fontWeight: '800', marginTop: 4 },
  eventText: { color: '#706A7C', fontSize: 14, lineHeight: 21, marginTop: 5 },
  planHint: { color: '#77718C', fontSize: 12, lineHeight: 18, marginTop: 4 },
  planStep: { flexDirection: 'row', gap: 10, paddingTop: 13 },
  planIndex: { width: 23, height: 23, borderRadius: 12, textAlign: 'center', paddingTop: 3, overflow: 'hidden', backgroundColor: '#ECE9FF', color: '#5F50BF', fontSize: 12, fontWeight: '800' },
  planCopy: { flex: 1 },
  planStepTitle: { color: '#39324D', fontSize: 14, lineHeight: 20, fontWeight: '800' },
  planStepPreview: { color: '#706A7C', fontSize: 13, lineHeight: 19, marginTop: 3 },
  planDetailButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 2, paddingVertical: 4 },
  planDetailButtonText: { color: '#5D4EC3', fontSize: 13, fontWeight: '800' },
  planStepDescription: { color: '#5D586A', fontSize: 13, lineHeight: 20, marginTop: 3, padding: 10, borderRadius: 10, backgroundColor: '#F6F5FA' },
  planActions: { flexDirection: 'row', gap: 10, marginTop: 17 },
  adjustPlanButton: { minHeight: 44, flex: 1, borderRadius: 12, borderWidth: 1, borderColor: '#D8D2FC', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F7FF' },
  adjustPlanButtonText: { color: '#5D4EC3', fontSize: 14, fontWeight: '800' },
  approveButton: { minHeight: 44, flex: 1.2, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6656D7' },
  approveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  artifactCard: { borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1, borderColor: '#E8E5F1', padding: 10, marginTop: 11 },
  artifactHeader: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  artifactHeaderCopy: { flex: 1 },
  artifactTitle: { color: '#4A435B', fontSize: 13, fontWeight: '800' },
  artifactMeta: { color: '#827B92', fontSize: 12, lineHeight: 17, marginTop: 2 },
  artifactToggle: { color: '#5D4EC3', fontSize: 12, fontWeight: '800' },
  exitCode: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 4, overflow: 'hidden', fontSize: 10, fontWeight: '800' },
  exitCodeSuccess: { color: '#197044', backgroundColor: '#DFF7E9' },
  exitCodeError: { color: '#B42318', backgroundColor: '#FFE5E3' },
  codeBlock: { marginTop: 10, maxHeight: 240, borderRadius: 8, overflow: 'hidden', backgroundColor: '#28243A', color: '#F4F2FF', padding: 10, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 11, lineHeight: 16 },
  artifactImage: { width: '100%', height: 180, borderRadius: 8, marginTop: 10, backgroundColor: '#F4F2FA' },
  prCard: { marginTop: 13, borderRadius: 17, padding: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D8D2FC', flexDirection: 'row', alignItems: 'center', gap: 11 },
  prIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#ECE9FF', alignItems: 'center', justifyContent: 'center' },
  prIconText: { color: '#5C4FC2', fontSize: 11, fontWeight: '900' },
  prCopy: { flex: 1 },
  prTitle: { color: '#3D3650', fontSize: 14, fontWeight: '800' },
  prDescription: { color: '#7B748A', fontSize: 12, lineHeight: 17, marginTop: 3 },
  prArrow: { color: '#5D4EC3', fontSize: 20, fontWeight: '800' },
  historyButton: { minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: '#DDD8F5', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF9FE', marginTop: 10 },
  historyButtonText: { color: '#5D4EC3', fontSize: 13, fontWeight: '800' },
  errorNotice: { paddingHorizontal: 18, paddingVertical: 10, backgroundColor: '#FFF4F3', borderTopWidth: 1, borderTopColor: '#FFD7D2' },
  errorNoticeText: { color: '#AA3027', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  workingIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9, backgroundColor: '#F1EFFF' },
  workingIndicatorText: { color: '#6255AD', fontSize: 12, fontWeight: '700' },
  composerShell: { flexDirection: 'row', alignItems: 'stretch', gap: 10, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9E6F1' },
  composerInput: { flex: 1, minHeight: 56, maxHeight: 120, borderRadius: 15, backgroundColor: '#F5F3FA', borderWidth: 1, borderColor: '#E5E2EC', paddingHorizontal: 13, paddingTop: 12, paddingBottom: 10, color: '#332D44', fontSize: 15, lineHeight: 21 },
  sendButton: { width: 64, minHeight: 56, alignSelf: 'stretch', borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6656D7' },
  sendButtonDisabled: { backgroundColor: '#D2CDEF' },
  sendButtonText: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  terminalDock: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E9E6F1' },
  terminalDockCopy: { flex: 1, minWidth: 0 },
  terminalDockTitle: { color: '#40394F', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  terminalDockText: { color: '#706A7C', fontSize: 11, lineHeight: 16, marginTop: 1 },
  terminalActionButton: { minWidth: 116, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 13, backgroundColor: '#6656D7' },
  terminalActionButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});

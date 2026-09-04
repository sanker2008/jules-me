import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createSession,
  getSessions,
  getSources,
  JulesApiError,
  Session,
  Source,
} from '../services/api';
import { createTranslator, useAppLanguage } from '../i18n';
import type { Translator } from '../i18n';
import { useTheme } from '../hooks/use-theme';
import { cleanPromptDisplay, getSingleRouteParam } from '../utils/jules-guards';
import { getApiKey } from '../utils/secure-store';

type PickerMode = 'source' | 'branch' | null;

function getRelativeTime(dateString: string | undefined, t: Translator): string {
  if (!dateString) return t('justUpdated');

  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return t('justUpdated');
  if (seconds < 60 * 60) return t('minutesAgo', Math.floor(seconds / 60));
  if (seconds < 60 * 60 * 24) return t('hoursAgo', Math.floor(seconds / 3600));
  if (seconds < 60 * 60 * 48) return t('yesterday');
  return date.toLocaleDateString();
}

function getWorkspaceErrorMessage(error: unknown, t: Translator): string {
  if (error instanceof JulesApiError) {
    if (error.status === 401 || error.status === 403) {
      return t('workspaceAuthError');
    }
    return error.message;
  }

  return t('workspaceGenericError');
}

function getSourceLabel(source: Source | undefined, t: Translator): string {
  if (!source) return t('chooseRepository');
  if (source.githubRepo) return `${source.githubRepo.owner}/${source.githubRepo.repo}`;
  return source.id || source.name;
}

function getSessionStatus(state: string | undefined, t: Translator) {
  switch (state) {
    case 'AWAITING_PLAN_APPROVAL':
      return { label: t('sessionAwaitingPlan'), tone: 'attention' as const };
    case 'AWAITING_USER_FEEDBACK':
      return { label: t('sessionAwaitingFeedback'), tone: 'attention' as const };
    case 'QUEUED':
      return { label: t('sessionQueued'), tone: 'active' as const };
    case 'PLANNING':
      return { label: t('sessionPlanning'), tone: 'active' as const };
    case 'IN_PROGRESS':
      return { label: t('sessionInProgress'), tone: 'active' as const };
    case 'PAUSED':
      return { label: t('sessionPaused'), tone: 'muted' as const };
    case 'COMPLETED':
      return { label: t('sessionCompleted'), tone: 'complete' as const };
    case 'FAILED':
      return { label: t('sessionFailed'), tone: 'failed' as const };
    default:
      return { label: t('sessionSyncing'), tone: 'muted' as const };
  }
}

function isActionRequired(session: Session) {
  return session.state === 'AWAITING_PLAN_APPROVAL' || session.state === 'AWAITING_USER_FEEDBACK';
}

function isActive(session: Session) {
  return ['QUEUED', 'PLANNING', 'IN_PROGRESS', 'PAUSED'].includes(session.state || '');
}

export default function TaskHomeScreen() {
  const router = useRouter();
  const themeColors = useTheme();
  const { language } = useAppLanguage();
  const t = useMemo(() => createTranslator(language), [language]);
  const taskTemplates = useMemo(() => [
    t('taskFixBug'),
    t('taskExplainError'),
    t('taskAddTests'),
  ], [t]);

  const {
    sourceId: routeSourceId,
    startingBranch: routeStartingBranch,
    draftPrompt: routeDraftPrompt,
  } = useLocalSearchParams<{
    sourceId?: string | string[];
    startingBranch?: string | string[];
    draftPrompt?: string | string[];
  }>();

  const sourceId = getSingleRouteParam(routeSourceId);
  const startingBranch = getSingleRouteParam(routeStartingBranch);
  const draftPrompt = getSingleRouteParam(routeDraftPrompt);
  const scrollRef = useRef<ScrollView>(null);

  const [savedApiKey, setSavedApiKey] = useState('');
  const [isFormExpanded, setIsFormExpanded] = useState(true);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);

  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesNextPageToken, setSourcesNextPageToken] = useState<string | undefined>();
  const [isLoadingMoreSources, setIsLoadingMoreSources] = useState(false);
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [sessionsNextPageToken, setSessionsNextPageToken] = useState<string | undefined>();
  const [isLoadingMoreSessions, setIsLoadingMoreSessions] = useState(false);

  const [selectedSourceName, setSelectedSourceName] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [taskPrompt, setTaskPrompt] = useState('');
  const [requirePlanApproval, setRequirePlanApproval] = useState(true);
  const [autoCreatePr, setAutoCreatePr] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [hasLoadedWorkspace, setHasLoadedWorkspace] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const selectedSource = useMemo(
    () => sources.find(source => source.name === selectedSourceName),
    [selectedSourceName, sources],
  );

  const availableBranches = useMemo(() => {
    const branches = selectedSource?.githubRepo?.branches?.map(branch => branch.displayName) ?? [];
    const defaultBranch = selectedSource?.githubRepo?.defaultBranch?.displayName;
    return Array.from(new Set(defaultBranch ? [defaultBranch, ...branches] : branches));
  }, [selectedSource]);

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return recentSessions;
    return recentSessions.filter(session => {
      const title = (session.title || '').toLowerCase();
      const prompt = (session.prompt || '').toLowerCase();
      const source = (session.sourceContext?.source || '').toLowerCase();
      return title.includes(query) || prompt.includes(query) || source.includes(query);
    });
  }, [recentSessions, searchQuery]);

  const sessionsByPriority = useMemo(() => ({
    needsAttention: filteredSessions.filter(isActionRequired),
    active: filteredSessions.filter(isActive),
    recent: filteredSessions.filter(session => !isActionRequired(session) && !isActive(session)),
  }), [filteredSessions]);

  const fetchWorkspace = useCallback(async (apiKey: string) => {
    if (!apiKey) return;

    setIsLoadingWorkspace(true);
    setWorkspaceError(null);
    try {
      const [sourcesResult, sessionsResult] = await Promise.all([
        getSources(apiKey),
        getSessions(apiKey),
      ]);
      setSources(sourcesResult.sources);
      setSourcesNextPageToken(sourcesResult.nextPageToken);
      setRecentSessions(sessionsResult.sessions);
      setSessionsNextPageToken(sessionsResult.nextPageToken);
      setHasLoadedWorkspace(true);
      setLastSyncedAt(new Date());
    } catch (error) {
      console.error('Failed to load Jules workspace:', error);
      setWorkspaceError(getWorkspaceErrorMessage(error, t));
    } finally {
      setIsLoadingWorkspace(false);
    }
  }, [t]);

  useEffect(() => {
    let disposed = false;
    void getApiKey().then(key => {
      if (disposed) return;
      if (!key) {
        setSavedApiKey('');
        setSources([]);
        setRecentSessions([]);
        setHasLoadedWorkspace(false);
        return;
      }
      setSavedApiKey(key);
      void fetchWorkspace(key);
    });
    return () => {
      disposed = true;
    };
  }, [fetchWorkspace]);

  useFocusEffect(
    useCallback(() => {
      let disposed = false;
      void getApiKey().then(key => {
        if (disposed) return;
        if (!key) {
          setSavedApiKey('');
          setSources([]);
          setRecentSessions([]);
          setHasLoadedWorkspace(false);
          return;
        }
        setSavedApiKey(key);
        void fetchWorkspace(key);
      });
      return () => {
        disposed = true;
      };
    }, [fetchWorkspace]),
  );

  useEffect(() => {
    if (!draftPrompt) return;
    const nextDraftPrompt = draftPrompt;
    const timer = setTimeout(() => setTaskPrompt(nextDraftPrompt), 0);
    return () => clearTimeout(timer);
  }, [draftPrompt]);

  useEffect(() => {
    if (!sourceId || sources.length === 0) return;
    const source = sources.find(candidate => candidate.name === sourceId);
    if (!source) return;

    const nextSourceName = source.name;
    const nextBranch = startingBranch || source.githubRepo?.defaultBranch?.displayName || null;
    const timer = setTimeout(() => {
      setSelectedSourceName(nextSourceName);
      setSelectedBranch(nextBranch);
    }, 0);
    return () => clearTimeout(timer);
  }, [sourceId, startingBranch, sources]);

  const refreshWorkspace = () => {
    if (!savedApiKey || isLoadingWorkspace) return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    void fetchWorkspace(savedApiKey);
  };

  const loadMoreSources = async () => {
    if (!savedApiKey || !sourcesNextPageToken || isLoadingMoreSources) return;
    setIsLoadingMoreSources(true);
    try {
      const result = await getSources(savedApiKey, sourcesNextPageToken);
      setSources(current => [...current, ...result.sources]);
      setSourcesNextPageToken(result.nextPageToken);
    } catch (error) {
      setWorkspaceError(getWorkspaceErrorMessage(error, t));
    } finally {
      setIsLoadingMoreSources(false);
    }
  };

  const loadMoreSessions = async () => {
    if (!savedApiKey || !sessionsNextPageToken || isLoadingMoreSessions) return;
    setIsLoadingMoreSessions(true);
    try {
      const result = await getSessions(savedApiKey, sessionsNextPageToken);
      setRecentSessions(current => [...current, ...result.sessions]);
      setSessionsNextPageToken(result.nextPageToken);
    } catch (error) {
      setWorkspaceError(getWorkspaceErrorMessage(error, t));
    } finally {
      setIsLoadingMoreSessions(false);
    }
  };

  const selectSource = (source: Source) => {
    const defaultBranch = source.githubRepo?.defaultBranch?.displayName;
    setSelectedSourceName(source.name);
    setSelectedBranch(defaultBranch || source.githubRepo?.branches?.[0]?.displayName || null);
    setPickerMode(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleStartTask = async () => {
    const prompt = taskPrompt.trim();
    if (!savedApiKey) {
      router.push('/settings' as any);
      return;
    }
    if (!selectedSource || !selectedBranch) {
      setWorkspaceError(t('selectBranchRequired'));
      setPickerMode('source');
      return;
    }
    if (!prompt) return;

    setIsStartingSession(true);
    setWorkspaceError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const session = await createSession(
        savedApiKey,
        selectedSource.name,
        selectedBranch,
        prompt,
        {
          requirePlanApproval,
          ...(autoCreatePr ? { automationMode: 'AUTO_CREATE_PR' } : {}),
        },
      );
      const sessionId = session.id || session.name.split('/').pop();
      if (!sessionId) throw new Error(t('missingSessionId'));

      setTaskPrompt('');
      router.push({ pathname: '/chat', params: { sessionId } });
    } catch (error) {
      console.error('Failed to create Jules session:', error);
      setWorkspaceError(getWorkspaceErrorMessage(error, t));
    } finally {
      setIsStartingSession(false);
    }
  };

  const resumeSession = (session: Session) => {
    const sessionId = session.id || session.name.split('/').pop();
    if (!sessionId) return;
    router.push({ pathname: '/chat', params: { sessionId } });
  };

  const renderSession = (session: Session) => {
    const status = getSessionStatus(session.state, t);
    const source = session.sourceContext?.source?.split('/').pop() || 'Jules';
    const title = session.title || cleanPromptDisplay(session.prompt) || t('untitledTask');

    const statusStyle = {
      attention: { bg: themeColors.statusAttentionBg, text: themeColors.statusAttentionText },
      active: { bg: themeColors.statusActiveBg, text: themeColors.statusActiveText },
      complete: { bg: themeColors.statusCompleteBg, text: themeColors.statusCompleteText },
      failed: { bg: themeColors.statusFailedBg, text: themeColors.statusFailedText },
      muted: { bg: themeColors.statusMutedBg, text: themeColors.statusMutedText },
    }[status.tone];

    return (
      <TouchableOpacity
        key={session.name}
        accessibilityRole="button"
        accessibilityLabel={t('openSession', title)}
        style={[styles.sessionCard, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}
        onPress={() => resumeSession(session)}
      >
        <View style={styles.sessionCardHeader}>
          <Text style={[styles.sessionTitle, { color: themeColors.text }]} numberOfLines={1}>{title}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{status.label}</Text>
          </View>
        </View>
        <Text style={[styles.sessionMeta, { color: themeColors.textSecondary }]} numberOfLines={1}>
          {source} · {getRelativeTime(session.updateTime || session.createTime, t)}
        </Text>
      </TouchableOpacity>
    );
  };

  const isFormDirty = Boolean(taskPrompt || selectedSourceName || selectedBranch);

  const handleClearForm = useCallback(() => {
    setTaskPrompt('');
    setSelectedSourceName(null);
    setSelectedBranch(null);
    setRequirePlanApproval(true);
    setAutoCreatePr(false);
  }, []);

  const canStartTask = Boolean(
    taskPrompt.trim() && selectedSource && selectedBranch && savedApiKey && !isStartingSession,
  );

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <View style={[styles.screen, { backgroundColor: themeColors.background }]}>
        <View style={[styles.topBar, { backgroundColor: themeColors.topBar, borderBottomColor: themeColors.topBarBorder }]}>
          <View style={styles.brandRow}>
            <Image source={require('@/assets/images/jules-logo.png')} style={styles.brandLogo} />
            <View>
              <Text style={[styles.brand, { color: themeColors.brand }]}>JulesMe</Text>
              <Text style={[styles.topBarSubtext, { color: themeColors.textSecondary }]}>
                {lastSyncedAt ? t('syncedAt', lastSyncedAt.toLocaleTimeString()) : t('workbench')}
              </Text>
            </View>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('refreshWorkspace')}
              disabled={!savedApiKey || isLoadingWorkspace}
              onPress={refreshWorkspace}
              style={[
                styles.iconButton,
                { backgroundColor: themeColors.brandSubtle },
                (!savedApiKey || isLoadingWorkspace) && styles.iconButtonDisabled,
              ]}
            >
              <Text style={[styles.iconButtonText, styles.refreshIconText, { color: themeColors.brand }]}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('openSettings')}
              onPress={() => router.push('/settings' as any)}
              style={[styles.iconButton, { backgroundColor: themeColors.brandSubtle }]}
            >
              <Text style={[styles.iconButtonText, { color: themeColors.brand }]}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoadingWorkspace && !hasLoadedWorkspace ? (
          <View style={styles.initialLoading}>
            <ActivityIndicator size="large" color={themeColors.brand} />
            <Text style={[styles.initialLoadingText, { color: themeColors.textSecondary }]}>{t('syncingWorkspace')}</Text>
          </View>
        ) : !savedApiKey ? (
          <View style={styles.initialLoading}>
            <Image source={require('@/assets/images/jules-logo.png')} style={styles.landingLogo} />
            <Text style={[styles.initialLoadingTitle, { color: themeColors.text }]}>{t('connectJules')}</Text>
            <Text style={[styles.initialLoadingText, { color: themeColors.textSecondary }]}>{t('apiKeyStartHint')}</Text>
            <TouchableOpacity style={[styles.primaryButton, { backgroundColor: themeColors.brand }]} onPress={() => router.push('/settings' as any)}>
              <Text style={styles.primaryButtonText}>{t('configureApiKey')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={isLoadingWorkspace} onRefresh={refreshWorkspace} tintColor={themeColors.brand} />}
          >
            <View style={[styles.hero, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('newTask')}
                accessibilityState={{ expanded: isFormExpanded }}
                style={styles.heroHeader}
                onPress={() => setIsFormExpanded(prev => !prev)}
                activeOpacity={0.7}
              >
                <View style={styles.heroHeaderCopy}>
                  <Text style={[styles.eyebrow, { color: themeColors.brand }]}>{t('newTask')}</Text>
                  <Text style={[styles.heroHeaderTitle, { color: themeColors.text }]} numberOfLines={1}>
                    {isFormExpanded
                      ? t('heroTitle')
                      : (selectedSource ? `${getSourceLabel(selectedSource, t)}${selectedBranch ? ` · ${selectedBranch}` : ''}` : t('heroTitle'))}
                  </Text>
                </View>
                <View style={[styles.heroToggleCircle, { backgroundColor: themeColors.brandSubtle }]}>
                  <Text style={[styles.heroToggleArrow, { color: themeColors.brand }]}>{isFormExpanded ? '⌃' : '⌄'}</Text>
                </View>
              </TouchableOpacity>

              {isFormExpanded ? (
                <View style={styles.heroBody}>
                  <Text style={[styles.heroDescription, { color: themeColors.textSecondary }]}>{t('heroDescription')}</Text>

                  <View style={styles.contextRow}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('chooseRepository')}
                      style={[styles.contextChip, { backgroundColor: themeColors.chipBg, borderColor: themeColors.chipBorder }]}
                      onPress={() => setPickerMode('source')}
                    >
                      <Text style={[styles.contextChipLabel, { color: themeColors.brand }]}>⌘ {getSourceLabel(selectedSource, t)}</Text>
                      <View style={styles.contextChipArrowContainer}>
                        <Text style={[styles.contextChipArrow, { color: themeColors.brand }]}>⌄</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('chooseStartingBranch')}
                      style={[
                        styles.contextChip,
                        { backgroundColor: themeColors.chipBg, borderColor: themeColors.chipBorder },
                        !selectedSource && styles.contextChipDisabled,
                      ]}
                      disabled={!selectedSource}
                      onPress={() => setPickerMode('branch')}
                    >
                      <Text style={[styles.contextChipLabel, { color: themeColors.brand }]}>⑂ {selectedBranch || t('chooseBranch')}</Text>
                      <View style={styles.contextChipArrowContainer}>
                        <Text style={[styles.contextChipArrow, { color: themeColors.brand }]}>⌄</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.composer, { backgroundColor: themeColors.composerBg, borderColor: themeColors.composerBorder }]}>
                    <TextInput
                      accessibilityLabel={t('taskDescription')}
                      style={[styles.taskInput, { color: themeColors.text }]}
                      value={taskPrompt}
                      onChangeText={setTaskPrompt}
                      placeholder={t('taskPlaceholder')}
                      placeholderTextColor={themeColors.textMuted}
                      multiline
                      textAlignVertical="top"
                      maxLength={2000}
                    />
                    <View style={styles.composerFooter}>
                      {isFormDirty ? (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={t('clearForm')}
                          onPress={handleClearForm}
                          style={[styles.clearFormButton, { backgroundColor: themeColors.brandSubtle, borderColor: themeColors.chipBorder }]}
                        >
                          <Text style={[styles.clearFormButtonText, { color: themeColors.brand }]}>{t('clearForm')}</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={t('startTask')}
                        disabled={!canStartTask}
                        onPress={handleStartTask}
                        style={[
                          styles.startButton,
                          { backgroundColor: themeColors.brand },
                          !canStartTask && styles.startButtonDisabled,
                          isFormDirty && styles.startButtonFlexible,
                        ]}
                      >
                        {isStartingSession ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.startButtonText}>{t('startTaskButton')}</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
                    {taskTemplates.map(template => (
                      <TouchableOpacity
                        key={template}
                        style={[styles.templateChip, { backgroundColor: themeColors.chipBg, borderColor: themeColors.chipBorder }]}
                        onPress={() => setTaskPrompt(template)}
                      >
                        <Text style={[styles.templateText, { color: themeColors.textSecondary }]}>{template}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <View style={[styles.optionRow, { borderTopColor: themeColors.cardBorder }]}>
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionTitle, { color: themeColors.text }]}>{t('requirePlanTitle')}</Text>
                      <Text style={[styles.optionDescription, { color: themeColors.textSecondary }]}>{t('requirePlanDescription')}</Text>
                    </View>
                    <Switch
                      value={requirePlanApproval}
                      onValueChange={setRequirePlanApproval}
                      trackColor={{ false: themeColors.composerBorder, true: themeColors.brandSubtle }}
                      thumbColor={requirePlanApproval ? themeColors.brand : '#FFFFFF'}
                    />
                  </View>
                  <View style={[styles.optionRow, { borderTopColor: themeColors.cardBorder }]}>
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionTitle, { color: themeColors.text }]}>{t('autoPrTitle')}</Text>
                      <Text style={[styles.optionDescription, { color: themeColors.textSecondary }]}>{t('autoPrDescription')}</Text>
                    </View>
                    <Switch
                      value={autoCreatePr}
                      onValueChange={setAutoCreatePr}
                      trackColor={{ false: themeColors.composerBorder, true: themeColors.brandSubtle }}
                      thumbColor={autoCreatePr ? themeColors.brand : '#FFFFFF'}
                    />
                  </View>
                </View>
              ) : null}
            </View>

            {workspaceError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>{t('actionFailedTitle')}</Text>
                <Text style={styles.errorText}>{workspaceError}</Text>
                <TouchableOpacity onPress={refreshWorkspace} style={styles.errorRetry}>
                  <Text style={styles.errorRetryText}>{t('resync')}</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {recentSessions.length > 0 ? (
              <View style={[styles.searchBarContainer, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  accessibilityLabel={t('searchSessions')}
                  style={[styles.searchInput, { color: themeColors.text }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('searchPlaceholder')}
                  placeholderTextColor={themeColors.textMuted}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {searchQuery ? (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('clearForm')} onPress={() => setSearchQuery('')} style={styles.searchClearButton}>
                    <Text style={[styles.searchClearText, { color: themeColors.textSecondary }]}>✕</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {searchQuery && filteredSessions.length === 0 ? (
              <View style={styles.emptySearchContainer}>
                <Text style={[styles.emptySearchText, { color: themeColors.textSecondary }]}>{t('noMatchingSessions')}</Text>
              </View>
            ) : null}

            {sessionsByPriority.needsAttention.length > 0 ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{t('needsAttention')}</Text>
                <Text style={[styles.sectionDescription, { color: themeColors.textSecondary }]}>{t('needsAttentionDescription')}</Text>
                {sessionsByPriority.needsAttention.map(renderSession)}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{t('activeTasks')}</Text>
              {sessionsByPriority.active.length > 0 ? (
                sessionsByPriority.active.map(renderSession)
              ) : (
                <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>{t('noActiveTasks')}</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{t('recentSessions')}</Text>
              {sessionsByPriority.recent.length > 0 ? (
                sessionsByPriority.recent.map(renderSession)
              ) : (
                <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>{t('noRecentSessions')}</Text>
              )}
              {sessionsNextPageToken ? (
                <TouchableOpacity
                  style={[styles.loadMoreButton, { borderColor: themeColors.composerBorder }]}
                  onPress={loadMoreSessions}
                  disabled={isLoadingMoreSessions}
                >
                  {isLoadingMoreSessions ? <ActivityIndicator size="small" color={themeColors.brand} /> : <Text style={[styles.loadMoreText, { color: themeColors.brand }]}>{t('loadMoreSessions')}</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          </ScrollView>
        )}
      </View>

      <Modal visible={pickerMode !== null} animationType="slide" transparent onRequestClose={() => setPickerMode(null)}>
        <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={() => setPickerMode(null)} />
          <View style={[styles.sheet, { backgroundColor: themeColors.sheetBg }]}>
            <View style={[styles.sheetHandle, { backgroundColor: themeColors.cardBorder }]} />
            <View style={[styles.sheetHeader, { borderBottomColor: themeColors.cardBorder }]}>
              <View>
                <Text style={[styles.sheetTitle, { color: themeColors.text }]}>{pickerMode === 'source' ? t('chooseRepository') : t('chooseStartingBranch')}</Text>
                <Text style={[styles.sheetDescription, { color: themeColors.textSecondary }]}>
                  {pickerMode === 'source' ? t('sourceSheetDescription') : getSourceLabel(selectedSource, t)}
                </Text>
              </View>
              <TouchableOpacity accessibilityLabel={t('cancel')} onPress={() => setPickerMode(null)} style={[styles.closeButton, { backgroundColor: themeColors.brandSubtle }]}>
                <Text style={[styles.closeButtonText, { color: themeColors.textSecondary }]}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {pickerMode === 'source' ? sources.map(source => (
                <TouchableOpacity
                  key={source.name}
                  style={[styles.sheetItem, { backgroundColor: themeColors.sheetItemBg, borderColor: themeColors.cardBorder }]}
                  onPress={() => selectSource(source)}
                >
                  <View style={styles.sheetItemCopy}>
                    <Text style={[styles.sheetItemTitle, { color: themeColors.text }]}>{getSourceLabel(source, t)}</Text>
                    <Text style={[styles.sheetItemSubtitle, { color: themeColors.textSecondary }]} numberOfLines={1}>
                      {source.githubRepo?.isPrivate ? t('privateRepository') : t('githubRepository')} · {source.githubRepo?.defaultBranch?.displayName || t('noDefaultBranch')}
                    </Text>
                  </View>
                  {selectedSourceName === source.name ? <Text style={[styles.selectedMark, { color: themeColors.brand }]}>✓</Text> : null}
                </TouchableOpacity>
              )) : availableBranches.map(branch => (
                <TouchableOpacity
                  key={branch}
                  style={[styles.sheetItem, { backgroundColor: themeColors.sheetItemBg, borderColor: themeColors.cardBorder }]}
                  onPress={() => {
                    setSelectedBranch(branch);
                    setPickerMode(null);
                  }}
                >
                  <Text style={[styles.sheetItemTitle, { color: themeColors.text }]}>{branch}</Text>
                  {selectedBranch === branch ? <Text style={[styles.selectedMark, { color: themeColors.brand }]}>✓</Text> : null}
                </TouchableOpacity>
              ))}
              {pickerMode === 'branch' && availableBranches.length === 0 ? (
                <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>{t('noBranches')}</Text>
              ) : null}
              {pickerMode === 'source' && sourcesNextPageToken ? (
                <TouchableOpacity style={[styles.loadMoreButton, { borderColor: themeColors.composerBorder }]} onPress={loadMoreSources} disabled={isLoadingMoreSources}>
                  {isLoadingMoreSources ? <ActivityIndicator size="small" color={themeColors.brand} /> : <Text style={[styles.loadMoreText, { color: themeColors.brand }]}>{t('loadMoreRepositories')}</Text>}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  screen: { flex: 1 },
  topBar: {
    minHeight: 70,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandLogo: {
    width: 32,
    height: 32,
    borderRadius: 0,
  },
  landingLogo: {
    width: 64,
    height: 64,
    borderRadius: 0,
    marginBottom: 8,
  },
  brand: {
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  topBarSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  topActions: { flexDirection: 'row', gap: 6 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonDisabled: { opacity: 0.45 },
  iconButtonText: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  refreshIconText: { marginTop: -2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 24 },
  initialLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38, gap: 12 },
  initialLoadingTitle: { fontSize: 22, fontWeight: '800' },
  initialLoadingText: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  hero: {
    borderRadius: 0,
    padding: 16,
    borderBottomWidth: 1,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  heroHeaderCopy: { flex: 1 },
  heroHeaderTitle: { fontSize: 20, lineHeight: 26, fontWeight: '800', marginTop: 3, letterSpacing: -0.3 },
  heroToggleCircle: { width: 28, height: 28, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  heroToggleArrow: { fontSize: 18, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  heroBody: { marginTop: 10 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { fontSize: 24, lineHeight: 31, fontWeight: '800', marginTop: 5, letterSpacing: -0.4 },
  heroDescription: { fontSize: 14, lineHeight: 21, marginTop: 5 },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  contextChip: {
    minHeight: 38,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 0,
    paddingHorizontal: 12,
  },
  contextChipDisabled: { opacity: 0.45 },
  contextChipLabel: { maxWidth: 220, fontSize: 13, fontWeight: '700' },
  contextChipArrowContainer: { width: 16, height: 20, alignItems: 'center', justifyContent: 'center' },
  contextChipArrow: { fontSize: 16, lineHeight: 16, textAlign: 'center', includeFontPadding: false },
  composer: { marginTop: 14, borderWidth: 1, borderRadius: 0, padding: 12 },
  taskInput: { minHeight: 116, fontSize: 16, lineHeight: 23, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 12 },
  composerFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  clearFormButton: {
    minHeight: 44,
    borderRadius: 0,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  clearFormButtonText: { fontSize: 13, fontWeight: '700' },
  startButton: {
    minHeight: 44,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  startButtonFlexible: { flex: 1 },
  startButtonDisabled: { opacity: 0.4 },
  startButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  templateRow: { gap: 8, paddingTop: 12, paddingBottom: 2 },
  templateChip: { borderRadius: 0, paddingHorizontal: 10, paddingVertical: 6 },
  templateText: { fontSize: 12, fontWeight: '600' },
  optionRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
    paddingTop: 12,
    marginTop: 2,
    borderTopWidth: 1,
  },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 14, fontWeight: '800' },
  optionDescription: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  errorCard: { backgroundColor: '#FFF5F5', borderLeftWidth: 3, borderLeftColor: '#B42318', borderRadius: 0, padding: 14 },
  errorTitle: { color: '#B42318', fontSize: 14, fontWeight: '800' },
  errorText: { color: '#8D3028', fontSize: 13, lineHeight: 19, marginTop: 4 },
  errorRetry: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  errorRetryText: { color: '#B42318', fontSize: 13, fontWeight: '800' },
  section: { gap: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2, marginBottom: 4 },
  sectionDescription: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  sessionCard: {
    borderRadius: 0,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
  },
  sessionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  sessionMeta: { fontSize: 12, marginTop: 6 },
  statusPill: { borderRadius: 0, paddingHorizontal: 6, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  emptyText: { fontSize: 13, lineHeight: 20, paddingVertical: 12 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 0, borderWidth: 1, paddingHorizontal: 12, minHeight: 42, marginVertical: 4 },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  searchClearButton: { padding: 6 },
  searchClearText: { fontSize: 13, fontWeight: '700' },
  emptySearchContainer: { paddingVertical: 24, alignItems: 'center', justifyContent: 'center' },
  emptySearchText: { fontSize: 14, fontWeight: '600' },
  loadMoreButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 0, marginTop: 8 },
  loadMoreText: { fontSize: 13, fontWeight: '800' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)' },
  sheetDismiss: { flex: 1 },
  sheet: { maxHeight: '78%', borderRadius: 0, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 0 },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 13,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetDescription: { fontSize: 12, maxWidth: 280, lineHeight: 18, marginTop: 4 },
  closeButton: { width: 32, height: 32, borderRadius: 0, alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { fontSize: 22, lineHeight: 24 },
  sheetList: { flexGrow: 0 },
  sheetListContent: { padding: 12, paddingBottom: 30, gap: 4 },
  sheetItem: {
    minHeight: 56,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sheetItemCopy: { flex: 1 },
  sheetItemTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  sheetItemSubtitle: { fontSize: 12, marginTop: 3 },
  selectedMark: { fontSize: 18, fontWeight: '800' },
  primaryButton: { borderRadius: 0, paddingHorizontal: 18, paddingVertical: 12, marginTop: 8 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import {
  createSession,
  getSessions,
  getSources,
  JulesApiError,
  Session,
  Source,
} from '../services/api';
import { createTranslator, getLanguageName, languageOptions, useAppLanguage } from '../i18n';
import type { Translator } from '../i18n';
import { getApiKey, saveApiKey } from '../utils/secure-store';

type PickerMode = 'source' | 'branch' | null;
type UpdateStatus = 'idle' | 'checking' | 'current' | 'ready' | 'unavailable' | 'failed';

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

function getUpdateErrorMessage(error: unknown, t: Translator): string {
  if (error instanceof Error && error.message) return error.message;
  return t('updateGenericError');
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
  const { preference: languagePreference, setPreference: setLanguagePreference, language } = useAppLanguage();
  const t = useMemo(() => createTranslator(language), [language]);
  const taskTemplates = useMemo(() => [
    t('taskFixBug'),
    t('taskExplainError'),
    t('taskAddTests'),
  ], [t]);
  const params = useLocalSearchParams<{
    sourceId?: string;
    startingBranch?: string;
    draftPrompt?: string;
  }>();
  const scrollRef = useRef<ScrollView>(null);

  const [savedApiKey, setSavedApiKey] = useState('');
  const [draftApiKey, setDraftApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [updateMessage, setUpdateMessage] = useState('');

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

  const sessionsByPriority = useMemo(() => ({
    needsAttention: recentSessions.filter(isActionRequired),
    active: recentSessions.filter(isActive),
    recent: recentSessions.filter(session => !isActionRequired(session) && !isActive(session)),
  }), [recentSessions]);
  const appVersion = Constants.expoConfig?.version ?? '1.0.1';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber
    ?? (Constants.expoConfig?.android?.versionCode ? String(Constants.expoConfig.android.versionCode) : '1');
  const appMetadata = Constants.expoConfig?.extra?.appMetadata as { author?: string; brand?: string } | undefined;
  const author = appMetadata?.author ?? 'San';
  const brand = appMetadata?.brand ?? 'sanOmni';
  const apiKeyStorageDescription = Platform.OS === 'web'
    ? t('settingsDescriptionWeb')
    : t('settingsDescriptionNative');

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
    const loadSavedKey = async () => {
      const key = await getApiKey();
      if (!key) {
        setShowSettings(true);
        return;
      }

      setSavedApiKey(key);
      setDraftApiKey(key);
      void fetchWorkspace(key);
    };

    void loadSavedKey();
  }, [fetchWorkspace]);

  useEffect(() => {
    if (!params.draftPrompt) return;
    const nextDraftPrompt = params.draftPrompt;
    const timer = setTimeout(() => setTaskPrompt(nextDraftPrompt), 0);
    return () => clearTimeout(timer);
  }, [params.draftPrompt]);

  useEffect(() => {
    if (!params.sourceId || sources.length === 0) return;
    const source = sources.find(candidate => candidate.name === params.sourceId);
    if (!source) return;

    const nextSourceName = source.name;
    const nextBranch = params.startingBranch || source.githubRepo?.defaultBranch?.displayName || null;
    const timer = setTimeout(() => {
      setSelectedSourceName(nextSourceName);
      setSelectedBranch(nextBranch);
    }, 0);
    return () => clearTimeout(timer);
  }, [params.sourceId, params.startingBranch, sources]);

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

  const handleSaveApiKey = async () => {
    const nextApiKey = draftApiKey.trim();
    await saveApiKey(nextApiKey);
    setSavedApiKey(nextApiKey);
    if (!nextApiKey) {
      setSources([]);
      setSourcesNextPageToken(undefined);
      setRecentSessions([]);
      setSessionsNextPageToken(undefined);
      setSelectedSourceName(null);
      setSelectedBranch(null);
      setWorkspaceError(null);
      setHasLoadedWorkspace(false);
      setLastSyncedAt(null);
      setShowSettings(true);
      return;
    }

    setShowSettings(false);
    void fetchWorkspace(nextApiKey);
  };

  const handleClearApiKey = () => {
    setDraftApiKey('');
  };

  const openAbout = () => {
    setShowSettings(false);
    setShowAbout(true);
  };

  const closeAbout = () => {
    setShowAbout(false);
    if (!savedApiKey) setShowSettings(true);
  };

  const checkForUpdate = async () => {
    if (!Updates.isEnabled) {
      setUpdateStatus('unavailable');
      setUpdateMessage(t('updateUnavailable'));
      return;
    }

    setUpdateStatus('checking');
    setUpdateMessage(t('updateChecking'));
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        setUpdateStatus('current');
        setUpdateMessage(t('updateCurrent'));
        return;
      }

      await Updates.fetchUpdateAsync();
      setUpdateStatus('ready');
      setUpdateMessage(t('updateReady'));
    } catch (error) {
      setUpdateStatus('failed');
      setUpdateMessage(getUpdateErrorMessage(error, t));
    }
  };

  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      setUpdateStatus('failed');
      setUpdateMessage(getUpdateErrorMessage(error, t));
    }
  };

  const selectSource = (source: Source) => {
    const defaultBranch = source.githubRepo?.defaultBranch?.displayName;
    setSelectedSourceName(source.name);
    setSelectedBranch(defaultBranch || source.githubRepo?.branches?.[0]?.displayName || null);
    setPickerMode(null);
  };

  const handleStartTask = async () => {
    const prompt = taskPrompt.trim();
    if (!savedApiKey) {
      setShowSettings(true);
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
    const title = session.title || session.prompt || t('untitledTask');
    return (
      <TouchableOpacity
        key={session.name}
        accessibilityRole="button"
        accessibilityLabel={t('openSession', title)}
        style={styles.sessionCard}
        onPress={() => resumeSession(session)}
      >
        <View style={styles.sessionCardHeader}>
          <Text style={styles.sessionTitle} numberOfLines={1}>{title}</Text>
          <View style={[styles.statusPill, styles[`status${status.tone}`]]}>
            <Text style={[styles.statusText, styles[`statusText${status.tone}`]]}>{status.label}</Text>
          </View>
        </View>
        <Text style={styles.sessionMeta} numberOfLines={1}>{source} · {getRelativeTime(session.updateTime || session.createTime, t)}</Text>
      </TouchableOpacity>
    );
  };

  const canStartTask = Boolean(
    taskPrompt.trim() && selectedSource && selectedBranch && savedApiKey && !isStartingSession,
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brand}>JulesMe</Text>
            <Text style={styles.topBarSubtext}>
              {lastSyncedAt ? t('syncedAt', lastSyncedAt.toLocaleTimeString()) : t('workbench')}
            </Text>
          </View>
          <View style={styles.topActions}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('refreshWorkspace')}
              disabled={!savedApiKey || isLoadingWorkspace}
              onPress={refreshWorkspace}
              style={[styles.iconButton, (!savedApiKey || isLoadingWorkspace) && styles.iconButtonDisabled]}
            >
              <Text style={styles.iconButtonText}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('openSettings')}
              onPress={() => setShowSettings(true)}
              style={styles.iconButton}
            >
              <Text style={styles.iconButtonText}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoadingWorkspace && !hasLoadedWorkspace ? (
          <View style={styles.initialLoading}>
            <ActivityIndicator size="large" color="#6D5CE7" />
            <Text style={styles.initialLoadingText}>{t('syncingWorkspace')}</Text>
          </View>
        ) : !savedApiKey ? (
          <View style={styles.initialLoading}>
            <Text style={styles.initialLoadingTitle}>{t('connectJules')}</Text>
            <Text style={styles.initialLoadingText}>{t('apiKeyStartHint')}</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => setShowSettings(true)}>
              <Text style={styles.primaryButtonText}>{t('configureApiKey')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={isLoadingWorkspace} onRefresh={refreshWorkspace} tintColor="#6D5CE7" />}
          >
            <View style={styles.hero}>
              <Text style={styles.eyebrow}>{t('newTask')}</Text>
              <Text style={styles.heroTitle}>{t('heroTitle')}</Text>
              <Text style={styles.heroDescription}>{t('heroDescription')}</Text>

              <View style={styles.contextRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('chooseRepository')}
                  style={styles.contextChip}
                  onPress={() => setPickerMode('source')}
                >
                  <Text style={styles.contextChipLabel}>⌘ {getSourceLabel(selectedSource, t)}</Text>
                  <View style={styles.contextChipArrowContainer}>
                    <Text style={styles.contextChipArrow}>⌄</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('chooseStartingBranch')}
                  style={[styles.contextChip, !selectedSource && styles.contextChipDisabled]}
                  disabled={!selectedSource}
                  onPress={() => setPickerMode('branch')}
                >
                  <Text style={styles.contextChipLabel}>⑂ {selectedBranch || t('chooseBranch')}</Text>
                  <View style={styles.contextChipArrowContainer}>
                    <Text style={styles.contextChipArrow}>⌄</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.composer}>
                <TextInput
                  accessibilityLabel={t('taskDescription')}
                  style={styles.taskInput}
                  value={taskPrompt}
                  onChangeText={setTaskPrompt}
                  placeholder={t('taskPlaceholder')}
                  placeholderTextColor="#98A2B3"
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={t('startTask')}
                  disabled={!canStartTask}
                  onPress={handleStartTask}
                  style={[styles.startButton, !canStartTask && styles.startButtonDisabled]}
                >
                  {isStartingSession ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.startButtonText}>{t('startTaskButton')}</Text>}
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
                {taskTemplates.map(template => (
                  <TouchableOpacity key={template} style={styles.templateChip} onPress={() => setTaskPrompt(template)}>
                    <Text style={styles.templateText}>{template}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.optionRow}>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{t('requirePlanTitle')}</Text>
                  <Text style={styles.optionDescription}>{t('requirePlanDescription')}</Text>
                </View>
                <Switch
                  value={requirePlanApproval}
                  onValueChange={setRequirePlanApproval}
                  trackColor={{ false: '#D0D5DD', true: '#B6AEF5' }}
                  thumbColor={requirePlanApproval ? '#6D5CE7' : '#FFFFFF'}
                />
              </View>
              <View style={styles.optionRow}>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionTitle}>{t('autoPrTitle')}</Text>
                  <Text style={styles.optionDescription}>{t('autoPrDescription')}</Text>
                </View>
                <Switch
                  value={autoCreatePr}
                  onValueChange={setAutoCreatePr}
                  trackColor={{ false: '#D0D5DD', true: '#B6AEF5' }}
                  thumbColor={autoCreatePr ? '#6D5CE7' : '#FFFFFF'}
                />
              </View>
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

            {sessionsByPriority.needsAttention.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('needsAttention')}</Text>
                <Text style={styles.sectionDescription}>{t('needsAttentionDescription')}</Text>
                {sessionsByPriority.needsAttention.map(renderSession)}
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('activeTasks')}</Text>
              {sessionsByPriority.active.length > 0 ? (
                sessionsByPriority.active.map(renderSession)
              ) : (
                <Text style={styles.emptyText}>{t('noActiveTasks')}</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('recentSessions')}</Text>
              {sessionsByPriority.recent.length > 0 ? (
                sessionsByPriority.recent.map(renderSession)
              ) : (
                <Text style={styles.emptyText}>{t('noRecentSessions')}</Text>
              )}
              {sessionsNextPageToken ? (
                <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreSessions} disabled={isLoadingMoreSessions}>
                  {isLoadingMoreSessions ? <ActivityIndicator size="small" color="#5B4BC4" /> : <Text style={styles.loadMoreText}>{t('loadMoreSessions')}</Text>}
                </TouchableOpacity>
              ) : null}
            </View>
          </ScrollView>
        )}
      </View>

      <Modal visible={pickerMode !== null} animationType="slide" transparent onRequestClose={() => setPickerMode(null)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={styles.sheetDismiss} activeOpacity={1} onPress={() => setPickerMode(null)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>{pickerMode === 'source' ? t('chooseRepository') : t('chooseStartingBranch')}</Text>
                <Text style={styles.sheetDescription}>
                  {pickerMode === 'source' ? t('sourceSheetDescription') : getSourceLabel(selectedSource, t)}
                </Text>
              </View>
              <TouchableOpacity accessibilityLabel={t('cancel')} onPress={() => setPickerMode(null)} style={styles.closeButton}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.sheetList} contentContainerStyle={styles.sheetListContent}>
              {pickerMode === 'source' ? sources.map(source => (
                <TouchableOpacity key={source.name} style={styles.sheetItem} onPress={() => selectSource(source)}>
                  <View style={styles.sheetItemCopy}>
                    <Text style={styles.sheetItemTitle}>{getSourceLabel(source, t)}</Text>
                    <Text style={styles.sheetItemSubtitle} numberOfLines={1}>
                      {source.githubRepo?.isPrivate ? t('privateRepository') : t('githubRepository')} · {source.githubRepo?.defaultBranch?.displayName || t('noDefaultBranch')}
                    </Text>
                  </View>
                  {selectedSourceName === source.name ? <Text style={styles.selectedMark}>✓</Text> : null}
                </TouchableOpacity>
              )) : availableBranches.map(branch => (
                <TouchableOpacity
                  key={branch}
                  style={styles.sheetItem}
                  onPress={() => {
                    setSelectedBranch(branch);
                    setPickerMode(null);
                  }}
                >
                  <Text style={styles.sheetItemTitle}>{branch}</Text>
                  {selectedBranch === branch ? <Text style={styles.selectedMark}>✓</Text> : null}
                </TouchableOpacity>
              ))}
              {pickerMode === 'branch' && availableBranches.length === 0 ? (
                <Text style={styles.emptyText}>{t('noBranches')}</Text>
              ) : null}
              {pickerMode === 'source' && sourcesNextPageToken ? (
                <TouchableOpacity style={styles.loadMoreButton} onPress={loadMoreSources} disabled={isLoadingMoreSources}>
                  {isLoadingMoreSources ? <ActivityIndicator size="small" color="#5B4BC4" /> : <Text style={styles.loadMoreText}>{t('loadMoreRepositories')}</Text>}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showSettings} animationType="fade" transparent onRequestClose={() => setShowSettings(false)}>
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsCard}>
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>{t('connectJules')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('closeSettings')}
                style={styles.closeButton}
                onPress={() => setShowSettings(false)}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.settingsDescription}>{apiKeyStorageDescription}</Text>
            <Text style={styles.settingsLabel}>Jules API Key</Text>
            <View style={styles.settingsInputRow}>
              <TextInput
                accessibilityLabel="Jules API Key"
                style={styles.settingsInput}
                value={draftApiKey}
                onChangeText={setDraftApiKey}
                placeholder={t('pasteApiKey')}
                placeholderTextColor="#98A2B3"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('clearApiKey')}
                disabled={!draftApiKey}
                style={[styles.clearApiKeyButton, !draftApiKey && styles.clearApiKeyButtonDisabled]}
                onPress={handleClearApiKey}
              >
                <Text style={styles.clearApiKeyText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.settingsButtons}>
              <TouchableOpacity style={styles.settingsSave} onPress={handleSaveApiKey}>
                <Text style={styles.settingsSaveText}>{t('saveAndConnect')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.languageSection}>
              <Text style={styles.settingsLabel}>{t('language')}</Text>
              <Text style={styles.languageDescription}>{t('languageDescription')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('language')}
                accessibilityState={{ expanded: showLanguageMenu }}
                style={[styles.languageSelect, showLanguageMenu && styles.languageSelectOpen]}
                onPress={() => setShowLanguageMenu(current => !current)}
              >
                <Text style={styles.languageSelectText}>{getLanguageName(languagePreference)}</Text>
                <Text style={styles.languageSelectArrow}>{showLanguageMenu ? '⌃' : '⌄'}</Text>
              </TouchableOpacity>
              {showLanguageMenu ? (
                <View style={styles.languageMenu}>
                  {languageOptions.map(option => (
                    <TouchableOpacity
                      key={option}
                      accessibilityRole="menuitem"
                      accessibilityState={{ selected: languagePreference === option }}
                      style={[styles.languageMenuItem, languagePreference === option && styles.languageMenuItemSelected]}
                      onPress={() => {
                        setShowLanguageMenu(false);
                        void setLanguagePreference(option);
                      }}
                    >
                      <Text style={[styles.languageMenuItemText, languagePreference === option && styles.languageMenuItemTextSelected]}>
                        {getLanguageName(option)}
                      </Text>
                      {languagePreference === option ? <Text style={styles.languageMenuCheck}>✓</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('openAboutJulesMe')}
              style={styles.aboutEntry}
              onPress={openAbout}
            >
              <View>
                <Text style={styles.aboutEntryTitle}>{t('aboutJulesMe')}</Text>
                <Text style={styles.aboutEntryDescription}>{t('aboutDescription')}</Text>
              </View>
              <Text style={styles.aboutEntryArrow}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showAbout} animationType="fade" transparent onRequestClose={closeAbout}>
        <View style={styles.settingsOverlay}>
          <View style={[styles.settingsCard, styles.aboutCard]}>
            <View style={styles.aboutHeader}>
              <View>
                <Text style={styles.settingsTitle}>{t('aboutJulesMe')}</Text>
                <Text style={styles.settingsDescription}>{t('aboutSubtitle', brand)}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('closeAbout')} style={styles.closeButton} onPress={closeAbout}>
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.aboutInfoList}>
              <View style={styles.aboutInfoRow}>
                <Text style={styles.aboutInfoLabel}>{t('appVersion')}</Text>
                <Text style={styles.aboutInfoValue}>v{appVersion} ({t('build')} {buildNumber})</Text>
              </View>
              <View style={styles.aboutInfoRow}>
                <Text style={styles.aboutInfoLabel}>{t('brand')}</Text>
                <Text style={styles.aboutInfoValue}>{brand}</Text>
              </View>
              <View style={styles.aboutInfoRow}>
                <Text style={styles.aboutInfoLabel}>{t('author')}</Text>
                <Text style={styles.aboutInfoValue}>{author}</Text>
              </View>
              <View style={styles.aboutInfoRow}>
                <Text style={styles.aboutInfoLabel}>{t('dataPrivacy')}</Text>
                <Text style={styles.aboutInfoValue}>{apiKeyStorageDescription}</Text>
              </View>
            </View>

            <View style={styles.updateCard}>
              <Text style={styles.updateTitle}>{t('appUpdates')}</Text>
              <Text style={styles.updateDescription}>
                {updateMessage || t('updateDefaultDescription')}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={updateStatus === 'ready' ? t('applyUpdate') : t('checkAppUpdate')}
                disabled={updateStatus === 'checking'}
                style={[styles.updateButton, updateStatus === 'checking' && styles.iconButtonDisabled]}
                onPress={updateStatus === 'ready' ? applyUpdate : checkForUpdate}
              >
                {updateStatus === 'checking' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.updateButtonText}>{updateStatus === 'ready' ? t('applyUpdate') : t('checkUpdate')}</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.releaseNotes}>
              <Text style={styles.releaseNotesTitle}>{t('releaseNotesTitle')}</Text>
              <Text style={styles.releaseNotesText}>{t('releaseNotesText')}</Text>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7FC' },
  screen: { flex: 1, backgroundColor: '#F7F7FC' },
  topBar: { minHeight: 70, paddingHorizontal: 20, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E9E7F5', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#5B4BC4', fontSize: 23, lineHeight: 26, fontWeight: '800', letterSpacing: -0.6 },
  topBarSubtext: { color: '#7A7595', fontSize: 12, marginTop: 2 },
  topActions: { flexDirection: 'row', gap: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F2FF' },
  iconButtonDisabled: { opacity: 0.45 },
  iconButtonText: { color: '#5B4BC4', fontSize: 22, lineHeight: 25, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 24 },
  initialLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 38, gap: 12 },
  initialLoadingTitle: { color: '#2B2548', fontSize: 22, fontWeight: '800' },
  initialLoadingText: { color: '#726D86', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  hero: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: '#E8E5FA', shadowColor: '#59489D', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 2 },
  eyebrow: { color: '#6D5CE7', fontSize: 13, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  heroTitle: { color: '#25213D', fontSize: 24, lineHeight: 31, fontWeight: '800', marginTop: 5, letterSpacing: -0.4 },
  heroDescription: { color: '#77718B', fontSize: 14, lineHeight: 21, marginTop: 5 },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  contextChip: { minHeight: 40, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#E3DFFF' },
  contextChipDisabled: { opacity: 0.45 },
  contextChipLabel: { maxWidth: 220, color: '#463B8B', fontSize: 13, fontWeight: '700' },
  contextChipArrowContainer: { width: 16, height: 20, alignItems: 'center', justifyContent: 'center' },
  contextChipArrow: { color: '#7668C8', fontSize: 16, lineHeight: 16, textAlign: 'center', includeFontPadding: false },
  composer: { marginTop: 14, borderWidth: 1, borderColor: '#DCD6FA', borderRadius: 18, padding: 12, backgroundColor: '#FCFBFF' },
  taskInput: { minHeight: 116, color: '#27213E', fontSize: 16, lineHeight: 23, paddingHorizontal: 4, paddingTop: 4, paddingBottom: 12 },
  startButton: { minHeight: 48, borderRadius: 13, backgroundColor: '#6656D7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  startButtonDisabled: { backgroundColor: '#CFC9F1' },
  startButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  templateRow: { gap: 8, paddingTop: 12, paddingBottom: 2 },
  templateChip: { backgroundColor: '#F6F5FC', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#ECEAF5' },
  templateText: { color: '#5E5874', fontSize: 12, fontWeight: '600' },
  optionRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingTop: 13, marginTop: 2, borderTopWidth: 1, borderTopColor: '#F0EEF8' },
  optionCopy: { flex: 1 },
  optionTitle: { color: '#3B3552', fontSize: 14, fontWeight: '800' },
  optionDescription: { color: '#7A7590', fontSize: 12, lineHeight: 17, marginTop: 2 },
  errorCard: { backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FFD8D8', borderRadius: 16, padding: 15 },
  errorTitle: { color: '#B42318', fontSize: 14, fontWeight: '800' },
  errorText: { color: '#8D3028', fontSize: 13, lineHeight: 19, marginTop: 4 },
  errorRetry: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
  errorRetryText: { color: '#B42318', fontSize: 13, fontWeight: '800' },
  section: { gap: 10 },
  sectionTitle: { color: '#302B47', fontSize: 17, fontWeight: '800' },
  sectionDescription: { color: '#7B768D', fontSize: 13, lineHeight: 19, marginTop: -4 },
  sessionCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 15, borderWidth: 1, borderColor: '#ECEAF4' },
  sessionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sessionTitle: { flex: 1, color: '#332E49', fontSize: 15, fontWeight: '800' },
  sessionMeta: { color: '#817B93', fontSize: 12, marginTop: 8 },
  statusPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  statusText: { fontSize: 11, fontWeight: '800' },
  statusattention: { backgroundColor: '#FFF3D8' },
  statusTextattention: { color: '#8A5B00' },
  statusactive: { backgroundColor: '#E7E5FF' },
  statusTextactive: { color: '#5547B4' },
  statuscomplete: { backgroundColor: '#E7F8EE' },
  statusTextcomplete: { color: '#197044' },
  statusfailed: { backgroundColor: '#FFE8E7' },
  statusTextfailed: { color: '#B42318' },
  statusmuted: { backgroundColor: '#F0EFF4' },
  statusTextmuted: { color: '#666176' },
  emptyText: { color: '#8A8499', fontSize: 13, lineHeight: 20, paddingVertical: 6 },
  loadMoreButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCD6FA', borderRadius: 12, marginTop: 2 },
  loadMoreText: { color: '#5B4BC4', fontSize: 13, fontWeight: '800' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(25, 20, 51, 0.35)' },
  sheetDismiss: { flex: 1 },
  sheet: { maxHeight: '78%', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 4, backgroundColor: '#D9D5E8' },
  sheetHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#F0EEF6' },
  sheetTitle: { color: '#2D2747', fontSize: 19, fontWeight: '800' },
  sheetDescription: { color: '#7D778E', fontSize: 12, maxWidth: 280, lineHeight: 18, marginTop: 4 },
  closeButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F4F2FA', alignItems: 'center', justifyContent: 'center' },
  closeButtonText: { color: '#5C5570', fontSize: 24, lineHeight: 27 },
  sheetList: { flexGrow: 0 },
  sheetListContent: { padding: 12, paddingBottom: 30, gap: 8 },
  sheetItem: { minHeight: 62, borderRadius: 14, backgroundColor: '#FAF9FD', borderWidth: 1, borderColor: '#F0EEF6', paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sheetItemCopy: { flex: 1 },
  sheetItemTitle: { flex: 1, color: '#39324E', fontSize: 14, fontWeight: '800' },
  sheetItemSubtitle: { color: '#827C91', fontSize: 12, marginTop: 4 },
  selectedMark: { color: '#5B4BC4', fontSize: 19, fontWeight: '800' },
  settingsOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: 'rgba(25, 20, 51, 0.44)' },
  settingsCard: { width: '100%', maxWidth: 420, borderRadius: 22, backgroundColor: '#FFFFFF', padding: 22 },
  settingsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  settingsTitle: { color: '#2D2747', fontSize: 21, fontWeight: '800' },
  settingsDescription: { color: '#756F86', fontSize: 13, lineHeight: 19, marginTop: 6 },
  settingsLabel: { color: '#4D465E', fontSize: 13, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  settingsInputRow: { minHeight: 48, borderRadius: 12, backgroundColor: '#F7F6FB', borderWidth: 1, borderColor: '#E2DFEB', flexDirection: 'row', alignItems: 'center' },
  settingsInput: { flex: 1, minHeight: 46, paddingLeft: 13, paddingRight: 6, color: '#2D2747', fontSize: 15 },
  clearApiKeyButton: { width: 38, height: 38, marginRight: 5, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1EFF6' },
  clearApiKeyButtonDisabled: { opacity: 0.35 },
  clearApiKeyText: { color: '#6B6479', fontSize: 22, lineHeight: 24, fontWeight: '700' },
  settingsButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  settingsSave: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6656D7' },
  settingsSaveText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  languageSection: { marginTop: 2 },
  languageDescription: { color: '#756F86', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  languageSelect: { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, backgroundColor: '#F7F6FB', borderWidth: 1, borderColor: '#E2DFEB', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  languageSelectOpen: { borderColor: '#BDB4F4', backgroundColor: '#FCFBFF' },
  languageSelectText: { flex: 1, color: '#2D2747', fontSize: 14, fontWeight: '800' },
  languageSelectArrow: { width: 22, color: '#6656D7', fontSize: 18, lineHeight: 20, textAlign: 'center', fontWeight: '800' },
  languageMenu: { marginTop: 8, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2DFEB', overflow: 'hidden' },
  languageMenuItem: { minHeight: 44, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: '#F0EEF6' },
  languageMenuItemSelected: { backgroundColor: '#EEEAFE' },
  languageMenuItemText: { flex: 1, color: '#4D465E', fontSize: 14, fontWeight: '700' },
  languageMenuItemTextSelected: { color: '#5141B8', fontWeight: '800' },
  languageMenuCheck: { color: '#6656D7', fontSize: 16, fontWeight: '800' },
  aboutEntry: { minHeight: 62, marginTop: 18, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#F7F6FB', borderWidth: 1, borderColor: '#E2DFEB', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  aboutEntryTitle: { color: '#3F3855', fontSize: 14, fontWeight: '800' },
  aboutEntryDescription: { color: '#7A748B', fontSize: 12, marginTop: 3 },
  aboutEntryArrow: { color: '#6656D7', fontSize: 28, lineHeight: 30 },
  aboutCard: { maxHeight: '86%' },
  aboutHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  aboutInfoList: { marginTop: 20, borderTopWidth: 1, borderTopColor: '#EEEAF6' },
  aboutInfoRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#EEEAF6', gap: 4 },
  aboutInfoLabel: { color: '#756F86', fontSize: 12, fontWeight: '700' },
  aboutInfoValue: { color: '#39324E', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  updateCard: { marginTop: 18, padding: 16, borderRadius: 16, backgroundColor: '#F3F1FF', borderWidth: 1, borderColor: '#DDD8FB' },
  updateTitle: { color: '#3F347B', fontSize: 15, fontWeight: '800' },
  updateDescription: { color: '#625B7B', fontSize: 13, lineHeight: 19, marginTop: 5 },
  updateButton: { minHeight: 44, marginTop: 13, borderRadius: 11, backgroundColor: '#6656D7', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  updateButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  releaseNotes: { marginTop: 16 },
  releaseNotesTitle: { color: '#4D465E', fontSize: 13, fontWeight: '800' },
  releaseNotesText: { color: '#756F86', fontSize: 13, lineHeight: 19, marginTop: 4 },
  primaryButton: { backgroundColor: '#6656D7', borderRadius: 13, paddingHorizontal: 18, paddingVertical: 13, marginTop: 6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});

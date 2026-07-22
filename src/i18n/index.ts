import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import * as SecureStore from 'expo-secure-store';

export type AppLanguage = 'zh-Hans' | 'zh-Hant' | 'en';
export type LanguagePreference = 'system' | AppLanguage;

const LANGUAGE_KEY = 'JULESME_LANGUAGE';

const languageNames: Record<LanguagePreference, string> = {
  system: '跟随系统',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  en: 'English',
};

export const languageOptions: LanguagePreference[] = ['system', 'zh-Hans', 'zh-Hant', 'en'];

export function getLanguageName(language: LanguagePreference) {
  return languageNames[language];
}

function normalizeLanguage(value: string | null | undefined): LanguagePreference {
  if (value === 'system' || value === 'zh-Hans' || value === 'zh-Hant' || value === 'en') return value;
  return 'system';
}

function resolveSystemLanguage(): AppLanguage {
  const locale = Localization.getLocales()[0];
  const tag = `${locale?.languageTag ?? ''}-${locale?.regionCode ?? ''}`.toLowerCase();
  const languageCode = locale?.languageCode?.toLowerCase();

  if (languageCode === 'en') return 'en';
  if (languageCode === 'zh') {
    if (tag.includes('hant') || tag.includes('-tw') || tag.includes('-hk') || tag.includes('-mo')) {
      return 'zh-Hant';
    }
    return 'zh-Hans';
  }

  return 'zh-Hans';
}

export async function getLanguagePreference(): Promise<LanguagePreference> {
  try {
    if (Platform.OS === 'web') {
      return normalizeLanguage(localStorage.getItem(LANGUAGE_KEY));
    }
    return normalizeLanguage(await SecureStore.getItemAsync(LANGUAGE_KEY));
  } catch (error) {
    console.error('Failed to read language preference:', error);
    return 'system';
  }
}

export async function saveLanguagePreference(language: LanguagePreference) {
  try {
    if (Platform.OS === 'web') {
      localStorage.setItem(LANGUAGE_KEY, language);
      return;
    }
    await SecureStore.setItemAsync(LANGUAGE_KEY, language);
  } catch (error) {
    console.error('Failed to save language preference:', error);
  }
}

export function useAppLanguage() {
  const locales = Localization.useLocales();
  const [preference, setPreferenceState] = useState<LanguagePreference>('system');

  useEffect(() => {
    let disposed = false;
    void getLanguagePreference().then(language => {
      if (!disposed) setPreferenceState(language);
    });
    return () => {
      disposed = true;
    };
  }, []);

  const language = useMemo<AppLanguage>(() => {
    if (preference !== 'system') return preference;

    const locale = locales[0];
    const tag = `${locale?.languageTag ?? ''}-${locale?.regionCode ?? ''}`.toLowerCase();
    const languageCode = locale?.languageCode?.toLowerCase();

    if (languageCode === 'en') return 'en';
    if (languageCode === 'zh' && (tag.includes('hant') || tag.includes('-tw') || tag.includes('-hk') || tag.includes('-mo'))) {
      return 'zh-Hant';
    }
    if (languageCode === 'zh') return 'zh-Hans';

    return resolveSystemLanguage();
  }, [locales, preference]);

  const setPreference = async (languagePreference: LanguagePreference) => {
    setPreferenceState(languagePreference);
    await saveLanguagePreference(languagePreference);
  };

  return { language, preference, setPreference };
}

type TranslationValue = string | ((...args: any[]) => string);

type TranslationTable = Record<string, TranslationValue>;

const zhHans = {
  justUpdated: '刚刚更新',
  minutesAgo: (minutes: number) => `${minutes} 分钟前`,
  hoursAgo: (hours: number) => `${hours} 小时前`,
  yesterday: '昨天',
  updateGenericError: '暂时无法检查更新，请稍后重试。',
  workspaceAuthError: 'API Key 无效或没有访问权限。请在设置中更新后重试。',
  workspaceGenericError: '暂时无法读取 Jules 工作区，请稍后重试。',
  chooseRepository: '选择代码库',
  chooseBranch: '选择分支',
  sessionAwaitingPlan: '等待你确认计划',
  sessionAwaitingFeedback: '等待你的反馈',
  sessionQueued: '排队中',
  sessionPlanning: '正在规划',
  sessionInProgress: '执行中',
  sessionPaused: '已暂停',
  sessionCompleted: '已完成',
  sessionFailed: '执行失败',
  sessionSyncing: '同步中',
  taskFixBug: '修复一个 Bug',
  taskExplainError: '解释这个报错',
  taskAddTests: '为这段代码补测试',
  updateUnavailable: '此安装包尚未接入发布更新服务。开发模式、网页版和未配置发布通道的 GitHub APK 都不会自动热更新。',
  updateChecking: '正在检查更新…',
  updateCurrent: '已是最新版本。',
  updateReady: '更新已下载完成，重启应用后生效。',
  selectBranchRequired: '请先选择一个包含可用分支的代码库。',
  missingSessionId: 'Jules 创建会话后没有返回会话标识。',
  openSession: (title: string) => `打开会话：${title}`,
  untitledTask: '未命名任务',
  syncedAt: (time: string) => `已同步 ${time}`,
  workbench: '你的代码任务工作台',
  refreshWorkspace: '刷新工作区',
  openSettings: '打开设置',
  syncingWorkspace: '正在同步你的 Jules 工作区…',
  connectJules: '连接 Jules',
  apiKeyStartHint: '保存 API Key 后即可查看代码库并开始任务。',
  configureApiKey: '配置 API Key',
  newTask: '新任务',
  heroTitle: '你想让 Jules 做什么？',
  heroDescription: '选择仓库和分支，再清楚描述你的目标。',
  chooseStartingBranch: '选择起始分支',
  taskDescription: '任务描述',
  taskPlaceholder: '例如：检查结账页校验失败的原因，并给出修复方案',
  startTask: '开始任务',
  startTaskButton: '开始任务 →',
  requirePlanTitle: '先审计划',
  requirePlanDescription: 'Jules 开始改动前先等待你的确认',
  autoPrTitle: '完成后自动创建 PR',
  autoPrDescription: '仅在产生代码改动且 Jules 支持时执行',
  actionFailedTitle: '无法完成刚才的操作',
  resync: '重新同步',
  needsAttention: '需要你处理',
  needsAttentionDescription: '继续这些会话，Jules 正在等待你的决定。',
  activeTasks: '进行中的任务',
  noActiveTasks: '当前没有进行中的任务。',
  recentSessions: '最近会话',
  noRecentSessions: '你的完成和失败会话会显示在这里。',
  loadMoreSessions: '加载更多会话',
  sourceSheetDescription: '每个任务都需要一个 Jules 已连接的 GitHub 仓库。',
  privateRepository: '私有仓库',
  githubRepository: 'GitHub 仓库',
  noDefaultBranch: '无默认分支',
  noBranches: '该代码库没有返回可用分支，请换一个代码库。',
  loadMoreRepositories: '加载更多代码库',
  settingsDescriptionWeb: '网页版将 API Key 保存在当前浏览器的本地存储中。',
  settingsDescriptionNative: 'API Key 仅保存在这台设备的安全存储中。',
  pasteApiKey: '粘贴 API Key',
  clearApiKey: '清空 API Key',
  closeSettings: '关闭设置',
  cancel: '取消',
  saveAndConnect: '保存并连接',
  language: '语言',
  languageDescription: '应用界面语言；聊天内容保持原文。',
  aboutJulesMe: '关于 JulesMe',
  openAboutJulesMe: '打开关于 JulesMe',
  aboutDescription: '版本信息、隐私说明与应用更新',
  aboutSubtitle: (brand: string) => `${brand} · 你的代码任务工作台`,
  closeAbout: '关闭关于 JulesMe',
  appVersion: '应用版本',
  build: '构建',
  brand: '所属品牌',
  author: '作者',
  dataPrivacy: '数据与隐私',
  appUpdates: '应用更新',
  updateDefaultDescription: '发布版可通过 Expo 更新服务检查并下载兼容的功能更新。',
  applyUpdate: '重启并应用更新',
  checkAppUpdate: '检查应用更新',
  checkUpdate: '检查更新',
  releaseNotesTitle: 'v1.0.1 更新内容',
  releaseNotesText: '新增应用说明、版本与构建信息，以及更新检查入口。',
  chatAuthError: 'API Key 无效或没有访问权限。请返回设置更新后重试。',
  chatGenericError: '暂时无法与 Jules 同步，请检查网络后重试。',
  unknownTime: '时间未知',
  todayAt: (time: string) => `今天 ${time}`,
  dateThisYear: (month: number, day: number, time: string) => `${month}月${day}日 ${time}`,
  fullDate: (year: number, month: number, day: number, time: string) => `${year}年${month}月${day}日 ${time}`,
  noApiKeySaved: '请先在设置中保存 Jules API Key。',
  chooseSourceBranchBeforeStart: '请从任务页选择代码库和分支后再开始。',
  unableOpenLink: '暂时无法打开链接，请稍后重试。',
  codeChanges: '代码改动',
  collapse: '收起',
  viewDiff: '查看 Diff',
  commandOutput: '命令输出',
  success: '成功',
  exitCode: (code: number) => `退出码 ${code}`,
  noOutput: '没有输出。',
  generatedImage: '生成的图片',
  generatedMedia: '生成的媒体文件',
  activityTime: (time: string) => `活动时间：${time}`,
  planGenerated: 'Jules 已生成执行计划',
  planApproved: '你已确认执行计划。',
  taskCompleted: '任务已完成',
  sessionCompletedText: 'Jules 已完成这次会话。',
  taskIncomplete: '任务未完成',
  sessionFailedText: 'Jules 没有完成此会话。',
  newArtifact: 'Jules 生成了新的产物',
  executionPlanSteps: (count: number) => `执行计划 · ${count} 步`,
  planHint: '先浏览步骤；需要时展开技术细节。',
  stepDetailsLabel: (action: string, step: number) => `${action}第 ${step} 步技术细节`,
  view: '查看',
  collapseTechnicalDetails: '收起技术细节',
  viewTechnicalDetails: '查看技术细节',
  adjustPlan: '调整计划',
  adjustPlanPrompt: '请根据刚才的计划做以下调整：',
  approveAndRun: '批准并执行',
  completed: '完成',
  latestProgress: '最新进度',
  loadOlderActivities: '加载更早的活动',
  scrollToTop: '快速回到顶部',
  scrollToBottom: '快速跳到底部',
  prTitle: 'Jules 创建的 Pull Request',
  prDescription: '点击在 GitHub 中打开并查看改动。',
  backToHome: '返回 JulesMe 任务页',
  repository: '代码库',
  planReadyBanner: 'Jules 已准备好计划，确认后才会开始执行。',
  feedbackBanner: 'Jules 正在等待你的补充说明。',
  taskGoal: '任务目标',
  deliveryResult: '交付结果',
  prCreatedDelivery: 'Jules 已创建 Pull Request，可先查看改动再决定后续工作。',
  completedDelivery: 'Jules 已结束本次任务；可查看下方活动记录确认交付内容。',
  failedDelivery: 'Jules 没有完成这次任务。你可以保留相同代码库和分支重新发起。',
  activityCount: (count: number) => `${count} 条活动`,
  changesCount: (count: number) => `${count} 份代码改动`,
  commandSuccessCount: (success: number, total: number) => `${success}/${total} 条命令成功`,
  prCount: (count: number) => `${count} 个 PR`,
  openPullRequest: '打开 Pull Request',
  loadingSessionActivities: '正在读取会话活动…',
  describeTaskForJules: '描述你希望 Jules 完成的任务',
  activityPlaceholder: '活动、计划、进度与结果会显示在这里。',
  taskRunsOn: (source: string, branch: string) => `任务将在 ${source} 的 ${branch} 上执行。`,
  selectedBranch: '所选分支',
  julesWorking: 'Jules 正在处理，活动会自动同步',
  sessionEnded: '会话已结束',
  continueSameRepository: '可在同一代码库继续后续工作。',
  retrySameRepository: '保留原代码库和分支重新发起。',
  startFollowUp: '发起后续任务',
  restartTask: '重新发起',
  sendMessageToJules: '发送消息给 Jules',
  adjustPlanPlaceholder: '告诉 Jules 如何调整这份计划…',
  replyPlaceholder: '补充说明或回复 Jules…',
  sendMessage: '发送消息',
  send: '发送',
} satisfies TranslationTable;

const zhHant = {
  ...zhHans,
  justUpdated: '剛剛更新',
  minutesAgo: (minutes: number) => `${minutes} 分鐘前`,
  hoursAgo: (hours: number) => `${hours} 小時前`,
  yesterday: '昨天',
  updateGenericError: '暫時無法檢查更新，請稍後重試。',
  workspaceAuthError: 'API Key 無效或沒有存取權限。請在設定中更新後重試。',
  workspaceGenericError: '暫時無法讀取 Jules 工作區，請稍後重試。',
  chooseRepository: '選擇程式碼庫',
  chooseBranch: '選擇分支',
  sessionAwaitingPlan: '等待你確認計畫',
  sessionAwaitingFeedback: '等待你的回饋',
  sessionQueued: '佇列中',
  sessionPlanning: '正在規劃',
  sessionInProgress: '執行中',
  sessionPaused: '已暫停',
  sessionCompleted: '已完成',
  sessionFailed: '執行失敗',
  sessionSyncing: '同步中',
  taskFixBug: '修復一個 Bug',
  taskExplainError: '解釋這個錯誤',
  taskAddTests: '為這段程式碼補測試',
  updateUnavailable: '此安裝包尚未接入發布更新服務。開發模式、網頁版和未設定發布通道的 GitHub APK 都不會自動熱更新。',
  updateChecking: '正在檢查更新…',
  updateCurrent: '已是最新版本。',
  updateReady: '更新已下載完成，重啟應用後生效。',
  selectBranchRequired: '請先選擇一個包含可用分支的程式碼庫。',
  missingSessionId: 'Jules 建立會話後沒有返回會話識別碼。',
  openSession: (title: string) => `開啟會話：${title}`,
  untitledTask: '未命名任務',
  syncedAt: (time: string) => `已同步 ${time}`,
  workbench: '你的程式碼任務工作台',
  refreshWorkspace: '刷新工作區',
  openSettings: '開啟設定',
  syncingWorkspace: '正在同步你的 Jules 工作區…',
  connectJules: '連接 Jules',
  apiKeyStartHint: '儲存 API Key 後即可查看程式碼庫並開始任務。',
  configureApiKey: '設定 API Key',
  newTask: '新任務',
  heroTitle: '你想讓 Jules 做什麼？',
  heroDescription: '選擇倉庫和分支，再清楚描述你的目標。',
  chooseStartingBranch: '選擇起始分支',
  taskDescription: '任務描述',
  taskPlaceholder: '例如：檢查結帳頁驗證失敗的原因，並給出修復方案',
  startTask: '開始任務',
  startTaskButton: '開始任務 →',
  requirePlanTitle: '先審計畫',
  requirePlanDescription: 'Jules 開始改動前先等待你的確認',
  autoPrTitle: '完成後自動建立 PR',
  autoPrDescription: '僅在產生程式碼改動且 Jules 支援時執行',
  actionFailedTitle: '無法完成剛才的操作',
  resync: '重新同步',
  needsAttention: '需要你處理',
  needsAttentionDescription: '繼續這些會話，Jules 正在等待你的決定。',
  activeTasks: '進行中的任務',
  noActiveTasks: '目前沒有進行中的任務。',
  recentSessions: '最近會話',
  noRecentSessions: '你的完成和失敗會話會顯示在這裡。',
  loadMoreSessions: '載入更多會話',
  sourceSheetDescription: '每個任務都需要一個 Jules 已連接的 GitHub 倉庫。',
  privateRepository: '私有倉庫',
  githubRepository: 'GitHub 倉庫',
  noDefaultBranch: '無預設分支',
  noBranches: '該程式碼庫沒有返回可用分支，請換一個程式碼庫。',
  loadMoreRepositories: '載入更多程式碼庫',
  settingsDescriptionWeb: '網頁版會將 API Key 保存在目前瀏覽器的本機儲存中。',
  settingsDescriptionNative: 'API Key 僅保存在這台裝置的安全儲存中。',
  pasteApiKey: '貼上 API Key',
  clearApiKey: '清空 API Key',
  closeSettings: '關閉設定',
  cancel: '取消',
  saveAndConnect: '儲存並連接',
  language: '語言',
  languageDescription: '應用介面語言；聊天內容保持原文。',
  aboutJulesMe: '關於 JulesMe',
  openAboutJulesMe: '開啟關於 JulesMe',
  aboutDescription: '版本資訊、隱私說明與應用更新',
  aboutSubtitle: (brand: string) => `${brand} · 你的程式碼任務工作台`,
  closeAbout: '關閉關於 JulesMe',
  appVersion: '應用版本',
  build: '構建',
  brand: '所屬品牌',
  author: '作者',
  dataPrivacy: '資料與隱私',
  appUpdates: '應用更新',
  updateDefaultDescription: '發布版可透過 Expo 更新服務檢查並下載相容的功能更新。',
  applyUpdate: '重啟並套用更新',
  checkAppUpdate: '檢查應用更新',
  checkUpdate: '檢查更新',
  releaseNotesTitle: 'v1.0.1 更新內容',
  releaseNotesText: '新增應用說明、版本與構建資訊，以及更新檢查入口。',
  chatAuthError: 'API Key 無效或沒有存取權限。請返回設定更新後重試。',
  chatGenericError: '暫時無法與 Jules 同步，請檢查網路後重試。',
  unknownTime: '時間未知',
  todayAt: (time: string) => `今天 ${time}`,
  dateThisYear: (month: number, day: number, time: string) => `${month}月${day}日 ${time}`,
  fullDate: (year: number, month: number, day: number, time: string) => `${year}年${month}月${day}日 ${time}`,
  noApiKeySaved: '請先在設定中儲存 Jules API Key。',
  chooseSourceBranchBeforeStart: '請從任務頁選擇程式碼庫和分支後再開始。',
  unableOpenLink: '暫時無法開啟連結，請稍後重試。',
  codeChanges: '程式碼改動',
  collapse: '收起',
  commandOutput: '命令輸出',
  success: '成功',
  exitCode: (code: number) => `退出碼 ${code}`,
  noOutput: '沒有輸出。',
  generatedImage: '生成的圖片',
  generatedMedia: '生成的媒體檔案',
  activityTime: (time: string) => `活動時間：${time}`,
  planGenerated: 'Jules 已生成執行計畫',
  planApproved: '你已確認執行計畫。',
  taskCompleted: '任務已完成',
  sessionCompletedText: 'Jules 已完成這次會話。',
  taskIncomplete: '任務未完成',
  sessionFailedText: 'Jules 沒有完成此會話。',
  newArtifact: 'Jules 生成了新的產物',
  executionPlanSteps: (count: number) => `執行計畫 · ${count} 步`,
  planHint: '先瀏覽步驟；需要時展開技術細節。',
  stepDetailsLabel: (action: string, step: number) => `${action}第 ${step} 步技術細節`,
  collapseTechnicalDetails: '收起技術細節',
  viewTechnicalDetails: '查看技術細節',
  adjustPlan: '調整計畫',
  adjustPlanPrompt: '請根據剛才的計畫做以下調整：',
  approveAndRun: '批准並執行',
  completed: '完成',
  latestProgress: '最新進度',
  loadOlderActivities: '載入更早的活動',
  scrollToTop: '快速回到頂部',
  scrollToBottom: '快速跳到底部',
  prDescription: '點擊在 GitHub 中開啟並查看改動。',
  repository: '程式碼庫',
  planReadyBanner: 'Jules 已準備好計畫，確認後才會開始執行。',
  feedbackBanner: 'Jules 正在等待你的補充說明。',
  taskGoal: '任務目標',
  deliveryResult: '交付結果',
  prCreatedDelivery: 'Jules 已建立 Pull Request，可先查看改動再決定後續工作。',
  completedDelivery: 'Jules 已結束本次任務；可查看下方活動記錄確認交付內容。',
  failedDelivery: 'Jules 沒有完成這次任務。你可以保留相同程式碼庫和分支重新發起。',
  activityCount: (count: number) => `${count} 條活動`,
  changesCount: (count: number) => `${count} 份程式碼改動`,
  commandSuccessCount: (success: number, total: number) => `${success}/${total} 條命令成功`,
  prCount: (count: number) => `${count} 個 PR`,
  loadingSessionActivities: '正在讀取會話活動…',
  describeTaskForJules: '描述你希望 Jules 完成的任務',
  activityPlaceholder: '活動、計畫、進度與結果會顯示在這裡。',
  taskRunsOn: (source: string, branch: string) => `任務將在 ${source} 的 ${branch} 上執行。`,
  selectedBranch: '所選分支',
  julesWorking: 'Jules 正在處理，活動會自動同步',
  sessionEnded: '會話已結束',
  continueSameRepository: '可在同一程式碼庫繼續後續工作。',
  retrySameRepository: '保留原程式碼庫和分支重新發起。',
  startFollowUp: '發起後續任務',
  restartTask: '重新發起',
  sendMessageToJules: '傳送訊息給 Jules',
  adjustPlanPlaceholder: '告訴 Jules 如何調整這份計畫…',
  replyPlaceholder: '補充說明或回覆 Jules…',
  sendMessage: '傳送訊息',
  send: '傳送',
} satisfies TranslationTable;

const en = {
  justUpdated: 'Just updated',
  minutesAgo: (minutes: number) => `${minutes} min ago`,
  hoursAgo: (hours: number) => `${hours} hr ago`,
  yesterday: 'Yesterday',
  updateGenericError: 'Unable to check for updates right now. Try again later.',
  workspaceAuthError: 'The API Key is invalid or does not have access. Update it in Settings and try again.',
  workspaceGenericError: 'Unable to load your Jules workspace right now. Try again later.',
  chooseRepository: 'Choose repository',
  chooseBranch: 'Choose branch',
  sessionAwaitingPlan: 'Waiting for plan approval',
  sessionAwaitingFeedback: 'Waiting for your feedback',
  sessionQueued: 'Queued',
  sessionPlanning: 'Planning',
  sessionInProgress: 'In progress',
  sessionPaused: 'Paused',
  sessionCompleted: 'Completed',
  sessionFailed: 'Failed',
  sessionSyncing: 'Syncing',
  taskFixBug: 'Fix a bug',
  taskExplainError: 'Explain this error',
  taskAddTests: 'Add tests for this code',
  updateUnavailable: 'This build is not connected to a release update service. Development builds, web, and GitHub APKs without a release channel will not auto-update.',
  updateChecking: 'Checking for updates…',
  updateCurrent: 'You are on the latest version.',
  updateReady: 'Update downloaded. Restart the app to apply it.',
  selectBranchRequired: 'Choose a repository with an available branch first.',
  missingSessionId: 'Jules did not return a session ID after creating the session.',
  openSession: (title: string) => `Open session: ${title}`,
  untitledTask: 'Untitled task',
  syncedAt: (time: string) => `Synced ${time}`,
  workbench: 'Your code task workspace',
  refreshWorkspace: 'Refresh workspace',
  openSettings: 'Open settings',
  syncingWorkspace: 'Syncing your Jules workspace…',
  connectJules: 'Connect Jules',
  apiKeyStartHint: 'Save your API Key to view repositories and start tasks.',
  configureApiKey: 'Configure API Key',
  newTask: 'New task',
  heroTitle: 'What should Jules do?',
  heroDescription: 'Choose a repository and branch, then describe the goal clearly.',
  chooseStartingBranch: 'Choose starting branch',
  taskDescription: 'Task description',
  taskPlaceholder: 'Example: find why checkout validation fails and propose a fix',
  startTask: 'Start task',
  startTaskButton: 'Start task →',
  requirePlanTitle: 'Review plan first',
  requirePlanDescription: 'Jules waits for your approval before making changes',
  autoPrTitle: 'Auto-create PR when done',
  autoPrDescription: 'Runs only when code changes exist and Jules supports it',
  actionFailedTitle: 'Unable to complete that action',
  resync: 'Sync again',
  needsAttention: 'Needs your attention',
  needsAttentionDescription: 'Continue these sessions. Jules is waiting for your decision.',
  activeTasks: 'Active tasks',
  noActiveTasks: 'No active tasks right now.',
  recentSessions: 'Recent sessions',
  noRecentSessions: 'Completed and failed sessions will appear here.',
  loadMoreSessions: 'Load more sessions',
  sourceSheetDescription: 'Each task needs a GitHub repository connected to Jules.',
  privateRepository: 'Private repository',
  githubRepository: 'GitHub repository',
  noDefaultBranch: 'No default branch',
  noBranches: 'This repository did not return available branches. Choose another repository.',
  loadMoreRepositories: 'Load more repositories',
  settingsDescriptionWeb: 'On web, your API Key is stored in this browser’s local storage.',
  settingsDescriptionNative: 'Your API Key is stored only in secure storage on this device.',
  pasteApiKey: 'Paste API Key',
  clearApiKey: 'Clear API Key',
  closeSettings: 'Close settings',
  cancel: 'Cancel',
  saveAndConnect: 'Save and connect',
  language: 'Language',
  languageDescription: 'App interface language. Chat content stays unchanged.',
  aboutJulesMe: 'About JulesMe',
  openAboutJulesMe: 'Open About JulesMe',
  aboutDescription: 'Version, privacy, and app updates',
  aboutSubtitle: (brand: string) => `${brand} · Your code task workspace`,
  closeAbout: 'Close About JulesMe',
  appVersion: 'App version',
  build: 'Build',
  brand: 'Brand',
  author: 'Author',
  dataPrivacy: 'Data and privacy',
  appUpdates: 'App updates',
  updateDefaultDescription: 'Release builds can check Expo Update for compatible feature updates.',
  applyUpdate: 'Restart and apply update',
  checkAppUpdate: 'Check app updates',
  checkUpdate: 'Check updates',
  releaseNotesTitle: 'v1.0.1 release notes',
  releaseNotesText: 'Added app information, version and build details, and an update check entry.',
  chatAuthError: 'The API Key is invalid or does not have access. Go back to Settings, update it, and try again.',
  chatGenericError: 'Unable to sync with Jules right now. Check your network and try again.',
  unknownTime: 'Unknown time',
  todayAt: (time: string) => `Today ${time}`,
  dateThisYear: (month: number, day: number, time: string) => `${month}/${day} ${time}`,
  fullDate: (year: number, month: number, day: number, time: string) => `${year}/${month}/${day} ${time}`,
  noApiKeySaved: 'Save a Jules API Key in Settings first.',
  chooseSourceBranchBeforeStart: 'Choose a repository and branch on the task page before starting.',
  unableOpenLink: 'Unable to open the link right now. Try again later.',
  codeChanges: 'Code changes',
  collapse: 'Collapse',
  viewDiff: 'View diff',
  commandOutput: 'Command output',
  success: 'Success',
  exitCode: (code: number) => `Exit code ${code}`,
  noOutput: 'No output.',
  generatedImage: 'Generated image',
  generatedMedia: 'Generated media file',
  activityTime: (time: string) => `Activity time: ${time}`,
  planGenerated: 'Jules generated an execution plan',
  planApproved: 'You approved the execution plan.',
  taskCompleted: 'Task completed',
  sessionCompletedText: 'Jules completed this session.',
  taskIncomplete: 'Task incomplete',
  sessionFailedText: 'Jules did not complete this session.',
  newArtifact: 'Jules generated a new artifact',
  executionPlanSteps: (count: number) => `Execution plan · ${count} steps`,
  planHint: 'Review the steps first. Expand technical details when needed.',
  stepDetailsLabel: (action: string, step: number) => `${action} technical details for step ${step}`,
  view: 'View',
  collapseTechnicalDetails: 'Collapse technical details',
  viewTechnicalDetails: 'View technical details',
  adjustPlan: 'Adjust plan',
  adjustPlanPrompt: 'Please adjust the previous plan as follows:',
  approveAndRun: 'Approve and run',
  completed: 'Completed',
  latestProgress: 'Latest progress',
  loadOlderActivities: 'Load older activities',
  scrollToTop: 'Jump to top',
  scrollToBottom: 'Jump to bottom',
  prTitle: 'Pull Request created by Jules',
  prDescription: 'Open it in GitHub to review the changes.',
  backToHome: 'Back to JulesMe task page',
  repository: 'Repository',
  planReadyBanner: 'Jules has a plan ready. It will start only after you approve it.',
  feedbackBanner: 'Jules is waiting for more information from you.',
  taskGoal: 'Task goal',
  deliveryResult: 'Delivery result',
  prCreatedDelivery: 'Jules created a Pull Request. Review the changes before deciding what to do next.',
  completedDelivery: 'Jules ended this task. Review the activity log below to confirm the delivery.',
  failedDelivery: 'Jules did not complete this task. You can start again with the same repository and branch.',
  activityCount: (count: number) => `${count} activities`,
  changesCount: (count: number) => `${count} code changes`,
  commandSuccessCount: (success: number, total: number) => `${success}/${total} commands succeeded`,
  prCount: (count: number) => `${count} PRs`,
  openPullRequest: 'Open Pull Request',
  loadingSessionActivities: 'Loading session activities…',
  describeTaskForJules: 'Describe what you want Jules to do',
  activityPlaceholder: 'Activities, plans, progress, and results will appear here.',
  taskRunsOn: (source: string, branch: string) => `The task will run on ${source}, branch ${branch}.`,
  selectedBranch: 'selected branch',
  julesWorking: 'Jules is working. Activity syncs automatically.',
  sessionEnded: 'Session ended',
  continueSameRepository: 'You can continue follow-up work in the same repository.',
  retrySameRepository: 'Start again with the same repository and branch.',
  startFollowUp: 'Start follow-up task',
  restartTask: 'Start again',
  sendMessageToJules: 'Send message to Jules',
  adjustPlanPlaceholder: 'Tell Jules how to adjust this plan…',
  replyPlaceholder: 'Add context or reply to Jules…',
  sendMessage: 'Send message',
  send: 'Send',
} satisfies TranslationTable;

const translations = {
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  en,
} satisfies Record<AppLanguage, TranslationTable>;

type TranslationKey = keyof typeof zhHans;

export type Translator = <K extends TranslationKey>(
  key: K,
  ...args: typeof zhHans[K] extends (...args: infer Args) => string ? Args : []
) => string;

export function createTranslator(language: AppLanguage): Translator {
  const table = translations[language];

  return ((key: TranslationKey, ...args: unknown[]) => {
    const value = table[key] ?? zhHans[key];
    if (typeof value === 'function') {
      return (value as (...nextArgs: unknown[]) => string)(...args);
    }
    return value;
  }) as Translator;
}

import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProPaywallModal } from '../components/pro-paywall-modal';
import { Chevron } from '../components/chevron';
import { GradientButton } from '../components/gradient-button';
import { ProBadge } from '../components/pro-badge';
import { getGlobalInstructions, saveGlobalInstructions } from '../utils/pro-storage';
import { usePro } from '../hooks/use-pro';
import { createTranslator, getLanguageName, getThemeName, languageOptions, useAppLanguage } from '../i18n';
import { themeOptions, useAppTheme } from '../theme';
import { useTheme } from '../hooks/use-theme';
import { getApiKey, saveApiKey } from '../utils/secure-store';
import { validateAndPersistApiKey } from '../utils/api-key-settings';
import { getSources, JulesApiError } from '../services/api';
import {
  IS_PRO_ACTIVATION_AVAILABLE,
  IS_PRO_PURCHASE_AVAILABLE,
  PRO_PURCHASE_URL,
} from '../utils/license';
import { maskLicenseKey } from '../utils/license-state';
import { goBackOrHome } from '../utils/navigation';

function EyeIcon({ visible, color }: { visible: boolean; color: string }) {
  return (
    <View style={eyeStyles.wrapper}>
      <View style={[eyeStyles.eyeShape, { borderColor: color }]}>
        <View style={[eyeStyles.pupil, { backgroundColor: color }]} />
      </View>
      {!visible && <View style={[eyeStyles.slash, { backgroundColor: color }]} />}
    </View>
  );
}

const eyeStyles = StyleSheet.create({
  wrapper: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeShape: {
    width: 20,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pupil: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  slash: {
    position: 'absolute',
    width: 20,
    height: 1.5,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
});

function getRemainingProDays(expiresAt: number | null | undefined): number {
  if (typeof expiresAt !== 'number') return 0;
  return Math.max(1, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export default function SettingsScreen() {
  const router = useRouter();
  const themeColors = useTheme();
  const { preference: languagePreference, setPreference: setLanguagePreference, language } = useAppLanguage();
  const { theme, preference: themePreference, setPreference: setThemePreference } = useAppTheme();
  const { activate, deactivate, isLoading: isProLoading, proState } = usePro();
  const t = useMemo(() => createTranslator(language), [language]);

  const [draftApiKey, setDraftApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showProPaywall, setShowProPaywall] = useState(false);
  const [proStatus, setProStatus] = useState<string | null>(null);
  const [globalInstructions, setGlobalInstructions] = useState('');
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const [instructionsFeedback, setInstructionsFeedback] = useState<string | null>(null);

  const appVersion = Constants.expoConfig?.version ?? '1.0.1';
  const buildNumber = Constants.expoConfig?.ios?.buildNumber
    ?? (Constants.expoConfig?.android?.versionCode ? String(Constants.expoConfig.android.versionCode) : '1');
  const appMetadata = Constants.expoConfig?.extra?.appMetadata as { author?: string; brand?: string } | undefined;
  const author = appMetadata?.author ?? 'San';
  const brand = appMetadata?.brand ?? 'sanOmni';
  const apiKeyStorageDescription = Platform.OS === 'web'
    ? t('settingsDescriptionWeb')
    : t('settingsDescriptionNative');

  useEffect(() => {
    void getApiKey().then(key => {
      if (key) setDraftApiKey(key);
    });
    void getGlobalInstructions().then(setGlobalInstructions);
  }, []);

  const handleSaveInstructions = async () => {
    setIsSavingInstructions(true);
    await saveGlobalInstructions(globalInstructions);
    setIsSavingInstructions(false);
    setInstructionsFeedback(t('instructionsSaved'));
    setTimeout(() => setInstructionsFeedback(null), 2500);
  };

  const handleSaveApiKey = async () => {
    const nextApiKey = draftApiKey.trim();
    if (!nextApiKey) {
      await saveApiKey('');
      setConnectionStatus({
        type: 'error',
        message: t('apiKeyEmpty'),
      });
      return;
    }

    setIsConnecting(true);
    setConnectionStatus(null);

    try {
      await validateAndPersistApiKey(nextApiKey, getSources, saveApiKey);
      setConnectionStatus({
        type: 'success',
        message: t('connectSuccess'),
      });
    } catch (error) {
      const detail = error instanceof JulesApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : t('connectFailed');
      setConnectionStatus({
        type: 'error',
        message: t('connectFailedNotSaved', detail),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleClearApiKey = () => {
    setDraftApiKey('');
    setConnectionStatus(null);
  };

  const handleDeactivatePro = async () => {
    await deactivate();
    setProStatus(t('proDeactivated'));
    setTimeout(() => setProStatus(null), 2600);
  };

  const monthlyDaysRemaining = getRemainingProDays(proState.license?.expiresAt);
  const isProActive = !isProLoading && proState.isPro;
  const isProPurchaseAvailable = Platform.OS === 'web' && IS_PRO_PURCHASE_AVAILABLE;
  const isProEntryAvailable = IS_PRO_ACTIVATION_AVAILABLE || isProPurchaseAvailable;
  const proEntryLabel = IS_PRO_ACTIVATION_AVAILABLE
    ? t('proActivateLicense')
    : isProPurchaseAvailable
      ? t('proPurchase')
      : t('proComingSoonAction');
  const proCardColors = theme === 'dark'
    ? { backgroundColor: isProActive ? '#1F1A38' : '#35270F' }
    : { backgroundColor: isProActive ? '#F5F2FF' : '#FFF8E8' };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { backgroundColor: themeColors.topBar }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          style={[styles.backButton, { backgroundColor: themeColors.brandSubtle }]}
          onPress={() => goBackOrHome(router)}
        >
          <Text style={[styles.backButtonText, { color: themeColors.brand }]}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Image source={require('@/assets/images/jules-logo.png')} style={styles.topBarLogo} />
          <Text style={[styles.topBarTitle, { color: themeColors.text }]}>{t('settings')}</Text>
          {isProActive ? <ProBadge tier={proState.tier} style={{ marginLeft: 6 }} /> : null}
        </View>

        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* API Key Section */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('connectJules')}</Text>
          <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{apiKeyStorageDescription}</Text>

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Jules API Key</Text>
          <View style={[styles.inputRow, { backgroundColor: themeColors.composerBg }]}>
            <TextInput
              accessibilityLabel="Jules API Key"
              style={[styles.input, { color: themeColors.text }]}
              value={draftApiKey}
              onChangeText={text => {
                setDraftApiKey(text);
                if (connectionStatus) setConnectionStatus(null);
              }}
              placeholder={t('pasteApiKey')}
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {draftApiKey ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('clearApiKey')}
                style={styles.inputIconButton}
                onPress={handleClearApiKey}
              >
                <Text style={[styles.clearButtonText, { color: themeColors.textSecondary }]}>×</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={showApiKey ? t('hideApiKey') : t('showApiKey')}
              style={styles.inputIconButton}
              onPress={() => setShowApiKey(current => !current)}
            >
              <EyeIcon visible={showApiKey} color={showApiKey ? themeColors.brand : themeColors.textSecondary} />
            </TouchableOpacity>
          </View>

          <GradientButton
            disabled={isConnecting}
            loading={isConnecting}
            loadingText={t('connecting')}
            title={t('saveAndConnect')}
            accessibilityLabel={isConnecting ? t('connecting') : t('saveAndConnect')}
            onPress={handleSaveApiKey}
            style={styles.saveButton}
          />

          {connectionStatus ? (
            <View
              style={[
                styles.statusBanner,
                {
                  backgroundColor: connectionStatus.type === 'success'
                    ? (theme === 'dark' ? '#143823' : '#E7F8EE')
                    : (theme === 'dark' ? '#3B191B' : '#FFE8E7'),
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBannerText,
                  {
                    color: connectionStatus.type === 'success'
                      ? (theme === 'dark' ? '#5CE091' : '#177B41')
                      : (theme === 'dark' ? '#FF8585' : '#D1242F'),
                  },
                ]}
              >
                {connectionStatus.type === 'success' ? '✓ ' : '✕ '}
                {connectionStatus.message}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Theme Preference Section */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('theme')}</Text>
          <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('themeDescription')}</Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('theme')}
            accessibilityState={{ expanded: showThemeMenu }}
            style={[
              styles.selectBox,
              { backgroundColor: themeColors.composerBg },
            ]}
            onPress={() => {
              setShowThemeMenu(current => !current);
              setShowLanguageMenu(false);
            }}
          >
            <Text style={[styles.selectBoxText, { color: themeColors.text }]}>{getThemeName(themePreference, t)}</Text>
            <Chevron direction={showThemeMenu ? 'up' : 'down'} color={themeColors.brand} />
          </TouchableOpacity>

          {showThemeMenu ? (
            <View style={[styles.menuList, { backgroundColor: themeColors.card }]}>
              {themeOptions.map(option => (
                <TouchableOpacity
                  key={option}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: themePreference === option }}
                  style={[
                    styles.menuItem,
                    themePreference === option && { backgroundColor: themeColors.brandSubtle },
                  ]}
                  onPress={() => {
                    setShowThemeMenu(false);
                    void setThemePreference(option);
                  }}
                >
                  <Text style={[styles.menuItemText, { color: themePreference === option ? themeColors.brand : themeColors.text }]}>
                    {getThemeName(option, t)}
                  </Text>
                  {themePreference === option ? <Text style={[styles.menuCheck, { color: themeColors.brand }]}>✓</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        {/* Language Preference Section */}
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('language')}</Text>
          <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('languageDescription')}</Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('language')}
            accessibilityState={{ expanded: showLanguageMenu }}
            style={[
              styles.selectBox,
              { backgroundColor: themeColors.composerBg },
            ]}
            onPress={() => {
              setShowLanguageMenu(current => !current);
              setShowThemeMenu(false);
            }}
          >
            <Text style={[styles.selectBoxText, { color: themeColors.text }]}>{getLanguageName(languagePreference)}</Text>
            <Chevron direction={showLanguageMenu ? 'up' : 'down'} color={themeColors.brand} />
          </TouchableOpacity>

          {showLanguageMenu ? (
            <View style={[styles.menuList, { backgroundColor: themeColors.card }]}>
              {languageOptions.map(option => (
                <TouchableOpacity
                  key={option}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: languagePreference === option }}
                  style={[
                    styles.menuItem,
                    languagePreference === option && { backgroundColor: themeColors.brandSubtle },
                  ]}
                  onPress={() => {
                    setShowLanguageMenu(false);
                    void setLanguagePreference(option);
                  }}
                >
                  <Text style={[styles.menuItemText, { color: languagePreference === option ? themeColors.brand : themeColors.text }]}>
                    {getLanguageName(option)}
                  </Text>
                  {languagePreference === option ? <Text style={[styles.menuCheck, { color: themeColors.brand }]}>✓</Text> : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        {/* Jules Custom Instructions (Pro Exclusive) */}
        <View style={styles.card}>
          <View style={styles.instructionsHeaderRow}>
            <Text style={[styles.cardTitle, { color: themeColors.text }]}>
              {t('globalInstructionsCardTitle')}
            </Text>
            {!isProActive ? (
              <TouchableOpacity
                onPress={() => setShowProPaywall(true)}
                style={[styles.proLockBadge, { backgroundColor: themeColors.brandSubtle }]}
              >
                <Text style={[styles.proLockBadgeText, { color: themeColors.brand }]}>
                  ✦ PRO
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>
            {t('globalInstructionsCardDesc')}
          </Text>

          <TextInput
            style={[styles.instructionsInput, { color: themeColors.text, backgroundColor: themeColors.composerBg }]}
            placeholder={t('globalInstructionsInputPlaceholder')}
            placeholderTextColor={themeColors.textMuted}
            value={globalInstructions}
            onChangeText={setGlobalInstructions}
            editable={isProActive}
            multiline
            textAlignVertical="top"
            maxLength={1000}
          />

          {isProActive ? (
            <View style={styles.instructionsActions}>
              {instructionsFeedback ? (
                <Text style={[styles.instructionsFeedback, { color: themeColors.brand }]}>
                  ✓ {instructionsFeedback}
                </Text>
              ) : <View />}
              <GradientButton
                title={t('saveInstructions')}
                loading={isSavingInstructions}
                onPress={handleSaveInstructions}
                style={styles.saveInstructionsBtn}
              />
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setShowProPaywall(true)}
              style={[styles.unlockProBanner, { backgroundColor: themeColors.brandSubtle }]}
            >
              <Text style={[styles.unlockProBannerText, { color: themeColors.brand }]}>
                {t('proLockedFeatureNotice')} · {t('proLockedFeatureAction')} →
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* About JulesMe Section */}
        <View style={styles.card}>
          <View style={styles.aboutHeaderRow}>
            <Image source={require('@/assets/images/jules-logo.png')} style={styles.aboutLogo} />
            <View style={styles.aboutHeaderCopy}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('aboutJulesMe')}</Text>
              <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('aboutSubtitle', brand)}</Text>
            </View>
          </View>

          <View style={styles.infoList}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('appVersion')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>v{appVersion} ({t('build')} {buildNumber})</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('brand')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{brand}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('author')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{author}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('dataPrivacy')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{apiKeyStorageDescription}</Text>
            </View>
          </View>

          <View style={styles.releaseNotes}>
            <Text style={[styles.releaseNotesTitle, { color: themeColors.text }]}>{t('releaseNotesTitle')}</Text>
            <Text style={[styles.releaseNotesText, { color: themeColors.textSecondary }]}>{t('releaseNotesText')}</Text>
          </View>
        </View>

        {/* JulesMe Pro Section */}
        <View style={[styles.proCard, proCardColors]}>
          {isProLoading ? (
            <View style={styles.proLoading}>
              <Text selectable style={[styles.cardTitle, { color: themeColors.text }]}>{t('proTitle')}</Text>
              <Text selectable style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('proLoading')}</Text>
            </View>
          ) : isProActive ? (
            <>
              <View style={styles.proHeader}>
                <View style={[styles.proBadge, { backgroundColor: themeColors.brand }]}>
                  <Text style={styles.proBadgeText}>{proState.tier === 'pro_lifetime' ? t('proLifetimeActive') : t('proMonthlyActive', monthlyDaysRemaining)}</Text>
                </View>
                <Text selectable style={[styles.proKey, { color: themeColors.textSecondary }]}>{maskLicenseKey(proState.license?.key ?? '')}</Text>
              </View>
              <Text selectable style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('proActiveDescription')}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={t('proDeactivateThisDevice')}
                onPress={() => void handleDeactivatePro()}
                style={[styles.proSecondaryButton, { backgroundColor: themeColors.brandSubtle }]}
              >
                <Text style={[styles.proSecondaryButtonText, { color: themeColors.brand }]}>{t('proDeactivateThisDevice')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.proHeader}>
                <Text selectable style={[styles.cardTitle, { color: themeColors.text }]}>{t('proTitle')}</Text>
                <Text selectable style={[styles.proPriceAnchor, { color: themeColors.brand }]}>
                  {isProEntryAvailable ? t('proPriceAnchor') : t('proComingSoonBadge')}
                </Text>
              </View>
              <Text selectable style={[styles.cardDescription, { color: themeColors.textSecondary }]}>
                {proStatus || (isProEntryAvailable ? t('proFreeDescription') : t('proComingSoonDescription'))}
              </Text>
              <GradientButton
                disabled={!isProEntryAvailable}
                title={proEntryLabel}
                accessibilityLabel={proEntryLabel}
                onPress={() => {
                  if (isProEntryAvailable) setShowProPaywall(true);
                }}
                style={styles.proPrimaryButton}
              />
            </>
          )}
        </View>
      </ScrollView>

      <ProPaywallModal
        visible={showProPaywall}
        onDismiss={() => setShowProPaywall(false)}
        onActivate={activate}
        activationAvailable={IS_PRO_ACTIVATION_AVAILABLE}
        purchaseUrl={PRO_PURCHASE_URL}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: -2,
  },
  topBarCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarLogo: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  topBarSpacer: {
    width: 38,
  },
  scrollContent: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: 16,
    gap: 0,
    paddingBottom: 40,
  },
  card: {
    paddingVertical: 18,
    paddingHorizontal: 0,
  },
  lastCard: {},
  proCard: {
    gap: 10,
    padding: 16,
    borderRadius: 8,
    marginTop: 18,
    marginBottom: 16,
  },
  proHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  proLoading: {
    gap: 4,
  },
  proPriceAnchor: {
    fontSize: 13,
    fontWeight: '800',
  },
  proBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  proBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  proKey: {
    fontSize: 12,
    fontWeight: '700',
  },
  proPrimaryButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  proSecondaryButton: {
    minHeight: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  proSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
  },
  proButtonDisabled: {
    opacity: 0.55,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 6,
  },
  inputRow: {
    minHeight: 46,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 6,
  },
  input: {
    flex: 1,
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 6,
    fontSize: 15,
  },
  inputIconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
  },
  saveButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  saveButtonDisabled: {
    opacity: 0.75,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  statusBanner: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  statusBannerText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  selectBox: {
    minHeight: 46,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  selectBoxText: {
    fontSize: 14,
    fontWeight: '700',
  },
  menuList: {
    marginTop: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  menuItem: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuItemText: {
    fontSize: 14,
    fontWeight: '700',
  },
  menuCheck: {
    fontSize: 16,
    fontWeight: '800',
  },
  aboutHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  aboutLogo: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  aboutHeaderCopy: {
    flex: 1,
  },
  infoList: {
    marginTop: 18,
  },
  infoRow: {
    paddingVertical: 10,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  releaseNotes: {
    marginTop: 16,
  },
  releaseNotesTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  releaseNotesText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  instructionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  proLockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  proLockBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  instructionsInput: {
    minHeight: 88,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  instructionsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  instructionsFeedback: {
    fontSize: 13,
    fontWeight: '700',
  },
  saveInstructionsBtn: {
    minWidth: 100,
  },
  unlockProBanner: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  unlockProBannerText: {
    fontSize: 13,
    fontWeight: '700',
  },
});

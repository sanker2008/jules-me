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

import { createTranslator, getLanguageName, getThemeName, languageOptions, useAppLanguage } from '../i18n';
import { themeOptions, useAppTheme } from '../theme';
import { useTheme } from '../hooks/use-theme';
import { getApiKey, saveApiKey } from '../utils/secure-store';

export default function SettingsScreen() {
  const router = useRouter();
  const themeColors = useTheme();
  const { preference: languagePreference, setPreference: setLanguagePreference, language } = useAppLanguage();
  const { preference: themePreference, setPreference: setThemePreference } = useAppTheme();
  const t = useMemo(() => createTranslator(language), [language]);

  const [draftApiKey, setDraftApiKey] = useState('');
  const [savedStatus, setSavedStatus] = useState<string | null>(null);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

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
  }, []);

  const handleSaveApiKey = async () => {
    const nextApiKey = draftApiKey.trim();
    await saveApiKey(nextApiKey);
    setSavedStatus(t('saveAndConnect'));
    setTimeout(() => setSavedStatus(null), 2000);
  };

  const handleClearApiKey = () => {
    setDraftApiKey('');
  };

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[styles.safeArea, { backgroundColor: themeColors.background }]}>
      <View style={[styles.topBar, { backgroundColor: themeColors.topBar, borderBottomColor: themeColors.topBarBorder }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          style={[styles.backButton, { backgroundColor: themeColors.brandSubtle }]}
          onPress={() => router.back()}
        >
          <Text style={[styles.backButtonText, { color: themeColors.brand }]}>‹</Text>
        </TouchableOpacity>

        <View style={styles.topBarCenter}>
          <Image source={require('@/assets/images/jules-logo.png')} style={styles.topBarLogo} />
          <Text style={[styles.topBarTitle, { color: themeColors.text }]}>{t('settings')}</Text>
        </View>

        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* API Key Section */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('connectJules')}</Text>
          <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{apiKeyStorageDescription}</Text>

          <Text style={[styles.inputLabel, { color: themeColors.text }]}>Jules API Key</Text>
          <View style={[styles.inputRow, { backgroundColor: themeColors.composerBg, borderColor: themeColors.composerBorder }]}>
            <TextInput
              accessibilityLabel="Jules API Key"
              style={[styles.input, { color: themeColors.text }]}
              value={draftApiKey}
              onChangeText={setDraftApiKey}
              placeholder={t('pasteApiKey')}
              placeholderTextColor={themeColors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('clearApiKey')}
              disabled={!draftApiKey}
              style={[styles.clearButton, !draftApiKey && styles.clearButtonDisabled]}
              onPress={handleClearApiKey}
            >
              <Text style={[styles.clearButtonText, { color: themeColors.textSecondary }]}>×</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={[styles.saveButton, { backgroundColor: themeColors.brand }]} onPress={handleSaveApiKey}>
            <Text style={styles.saveButtonText}>{savedStatus || t('saveAndConnect')}</Text>
          </TouchableOpacity>
        </View>

        {/* Theme Preference Section */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('theme')}</Text>
          <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('themeDescription')}</Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('theme')}
            accessibilityState={{ expanded: showThemeMenu }}
            style={[
              styles.selectBox,
              { backgroundColor: themeColors.composerBg, borderColor: showThemeMenu ? themeColors.brand : themeColors.composerBorder },
            ]}
            onPress={() => {
              setShowThemeMenu(current => !current);
              setShowLanguageMenu(false);
            }}
          >
            <Text style={[styles.selectBoxText, { color: themeColors.text }]}>{getThemeName(themePreference, t)}</Text>
            <Text style={[styles.selectBoxArrow, { color: themeColors.brand }]}>{showThemeMenu ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {showThemeMenu ? (
            <View style={[styles.menuList, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
              {themeOptions.map(option => (
                <TouchableOpacity
                  key={option}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: themePreference === option }}
                  style={[
                    styles.menuItem,
                    { borderBottomColor: themeColors.cardBorder },
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
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('language')}</Text>
          <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('languageDescription')}</Text>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('language')}
            accessibilityState={{ expanded: showLanguageMenu }}
            style={[
              styles.selectBox,
              { backgroundColor: themeColors.composerBg, borderColor: showLanguageMenu ? themeColors.brand : themeColors.composerBorder },
            ]}
            onPress={() => {
              setShowLanguageMenu(current => !current);
              setShowThemeMenu(false);
            }}
          >
            <Text style={[styles.selectBoxText, { color: themeColors.text }]}>{getLanguageName(languagePreference)}</Text>
            <Text style={[styles.selectBoxArrow, { color: themeColors.brand }]}>{showLanguageMenu ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {showLanguageMenu ? (
            <View style={[styles.menuList, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
              {languageOptions.map(option => (
                <TouchableOpacity
                  key={option}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: languagePreference === option }}
                  style={[
                    styles.menuItem,
                    { borderBottomColor: themeColors.cardBorder },
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

        {/* About JulesMe Section */}
        <View style={[styles.card, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
          <View style={styles.aboutHeaderRow}>
            <Image source={require('@/assets/images/jules-logo.png')} style={styles.aboutLogo} />
            <View style={styles.aboutHeaderCopy}>
              <Text style={[styles.cardTitle, { color: themeColors.text }]}>{t('aboutJulesMe')}</Text>
              <Text style={[styles.cardDescription, { color: themeColors.textSecondary }]}>{t('aboutSubtitle', brand)}</Text>
            </View>
          </View>

          <View style={[styles.infoList, { borderTopColor: themeColors.cardBorder }]}>
            <View style={[styles.infoRow, { borderBottomColor: themeColors.cardBorder }]}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('appVersion')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>v{appVersion} ({t('build')} {buildNumber})</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: themeColors.cardBorder }]}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('brand')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{brand}</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: themeColors.cardBorder }]}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('author')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{author}</Text>
            </View>
            <View style={[styles.infoRow, { borderBottomColor: themeColors.cardBorder }]}>
              <Text style={[styles.infoLabel, { color: themeColors.textSecondary }]}>{t('dataPrivacy')}</Text>
              <Text style={[styles.infoValue, { color: themeColors.text }]}>{apiKeyStorageDescription}</Text>
            </View>
          </View>

          <View style={styles.releaseNotes}>
            <Text style={[styles.releaseNotesTitle, { color: themeColors.text }]}>{t('releaseNotesTitle')}</Text>
            <Text style={[styles.releaseNotesText, { color: themeColors.textSecondary }]}>{t('releaseNotesText')}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  topBar: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  topBarSpacer: {
    width: 38,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
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
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    minHeight: 46,
    paddingLeft: 12,
    paddingRight: 6,
    fontSize: 15,
  },
  clearButton: {
    width: 36,
    height: 36,
    marginRight: 6,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonDisabled: {
    opacity: 0.35,
  },
  clearButtonText: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '700',
  },
  saveButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  selectBox: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
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
  selectBoxArrow: {
    fontSize: 18,
    fontWeight: '800',
  },
  menuList: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
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
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  aboutHeaderCopy: {
    flex: 1,
  },
  infoList: {
    marginTop: 18,
    borderTopWidth: 1,
  },
  infoRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
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
});

import React from 'react';
import { BottomSheet, RNHostView } from '@expo/ui';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { LicenseActivationResult } from '../types/pro';
import type { Translator } from '../i18n';
import { useTheme } from '../hooks/use-theme';

interface ProPaywallModalProps {
  visible: boolean;
  onDismiss: () => void;
  onActivate: (licenseKey: string) => Promise<LicenseActivationResult>;
  t: Translator;
}

function getActivationErrorText(result: Exclude<LicenseActivationResult, { success: true }>, t: Translator): string {
  if (result.message) return result.message;

  switch (result.error) {
    case 'empty_key':
      return t('proActivationEmpty');
    case 'expired_license':
      return t('proActivationExpired');
    case 'network':
      return t('proActivationNetwork');
    case 'invalid_response':
      return t('proActivationResponse');
    case 'invalid_license':
    default:
      return t('proActivationInvalid');
  }
}

export function ProPaywallModal({ visible, onDismiss, onActivate, t }: ProPaywallModalProps) {
  const themeColors = useTheme();
  const [licenseKey, setLicenseKey] = React.useState('');
  const [activationError, setActivationError] = React.useState<string | null>(null);
  const [isActivating, setIsActivating] = React.useState(false);

  const handleDismiss = React.useCallback(() => {
    setLicenseKey('');
    setActivationError(null);
    setIsActivating(false);
    onDismiss();
  }, [onDismiss]);

  const handleActivate = async () => {
    if (isActivating) return;

    setActivationError(null);
    setIsActivating(true);
    const result = await onActivate(licenseKey);
    setIsActivating(false);

    if (result.success) {
      handleDismiss();
      return;
    }

    setActivationError(getActivationErrorText(result, t));
  };

  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={handleDismiss}
      snapPoints={['half', 'full']}
      testID="pro-paywall-modal"
    >
      <RNHostView>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heading}>
            <Text selectable style={[styles.title, { color: themeColors.text }]}>{t('proUnlockTitle')}</Text>
            <Text selectable style={[styles.subtitle, { color: themeColors.textSecondary }]}>{t('proUnlockDescription')}</Text>
          </View>

          <View style={styles.planGrid}>
            <View style={[styles.planCard, { backgroundColor: themeColors.card, borderColor: themeColors.cardBorder }]}>
              <Text selectable style={[styles.planName, { color: themeColors.text }]}>{t('proMonthlyPlan')}</Text>
              <Text selectable style={[styles.planPrice, { color: themeColors.brand }]}>{t('proMonthlyPrice')}</Text>
              <Text selectable style={[styles.planMeta, { color: themeColors.textSecondary }]}>{t('proMonthlyBenefitRelay')}</Text>
              <Text selectable style={[styles.planMeta, { color: themeColors.textSecondary }]}>{t('proMonthlyBenefitPrompts')}</Text>
            </View>

            <View style={[styles.planCard, styles.recommendedPlan, { backgroundColor: themeColors.brandSubtle, borderColor: themeColors.brand }]}>
              <Text selectable style={[styles.recommendedLabel, { color: themeColors.brand }]}>{t('proRecommended')}</Text>
              <Text selectable style={[styles.planName, { color: themeColors.text }]}>{t('proLifetimePlan')}</Text>
              <Text selectable style={[styles.planPrice, { color: themeColors.brand }]}>{t('proLifetimePrice')}</Text>
              <Text selectable style={[styles.planMeta, { color: themeColors.textSecondary }]}>{t('proLifetimeBenefitRelay')}</Text>
              <Text selectable style={[styles.planMeta, { color: themeColors.textSecondary }]}>{t('proLifetimeBenefitUpdates')}</Text>
            </View>
          </View>

          <View style={styles.activationSection}>
            <Text selectable style={[styles.inputLabel, { color: themeColors.text }]}>{t('proLicenseKeyLabel')}</Text>
            <TextInput
              accessibilityLabel={t('proLicenseKeyLabel')}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isActivating}
              onChangeText={setLicenseKey}
              placeholder={t('proLicenseKeyPlaceholder')}
              placeholderTextColor={themeColors.textMuted}
              style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.composerBg, borderColor: themeColors.composerBorder }]}
              value={licenseKey}
            />
            {activationError ? <Text selectable style={styles.errorText}>{activationError}</Text> : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('proActivateLicense')}
              disabled={isActivating}
              onPress={() => void handleActivate()}
              style={[styles.activateButton, { backgroundColor: themeColors.brand }, isActivating && styles.buttonDisabled]}
            >
              {isActivating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.activateButtonText}>{t('proActivateLicense')}</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
    gap: 20,
  },
  heading: {
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  planGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  planCard: {
    flex: 1,
    minHeight: 180,
    borderWidth: 1,
    borderRadius: 18,
    borderCurve: 'continuous',
    padding: 14,
    gap: 8,
    boxShadow: '0 1px 2px rgba(27, 24, 47, 0.08)',
  },
  recommendedPlan: {
    borderWidth: 2,
  },
  recommendedLabel: {
    fontSize: 11,
    fontWeight: '800',
  },
  planName: {
    fontSize: 15,
    fontWeight: '800',
  },
  planPrice: {
    fontSize: 19,
    fontWeight: '900',
  },
  planMeta: {
    fontSize: 12,
    lineHeight: 17,
  },
  activationSection: {
    gap: 9,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  input: {
    minHeight: 50,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: '700',
  },
  errorText: {
    color: '#B42318',
    fontSize: 13,
    lineHeight: 18,
  },
  activateButton: {
    minHeight: 50,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
});

import React from 'react';
import { BottomSheet, RNHostView } from '@expo/ui';
import {
  ActivityIndicator,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import type { Translator } from '../i18n';
import { useTheme } from '../hooks/use-theme';
import { isSafeHttpsUrl, type ProLicenseActivationResult } from '../utils/license-state';

interface ProPaywallModalProps {
  visible: boolean;
  onDismiss: () => void;
  onActivate: (licenseKey: string) => Promise<ProLicenseActivationResult>;
  activationAvailable: boolean;
  purchaseUrl?: string;
  t: Translator;
}

function getActivationErrorText(result: Exclude<ProLicenseActivationResult, { success: true }>, t: Translator): string {
  switch (result.error) {
    case 'empty_key':
      return t('proActivationEmpty');
    case 'expired_license':
      return t('proActivationExpired');
    case 'timeout':
      return t('proActivationTimeout');
    case 'storage':
      return t('proActivationStorage');
    case 'service_unavailable':
      return t('proActivationUnavailable');
    case 'network':
      return t('proActivationNetwork');
    case 'invalid_response':
      return t('proActivationResponse');
    case 'invalid_license':
    default:
      return t('proActivationInvalid');
  }
}

export function ProPaywallModal({
  visible,
  onDismiss,
  onActivate,
  activationAvailable,
  purchaseUrl,
  t,
}: ProPaywallModalProps) {
  const themeColors = useTheme();
  const [licenseKey, setLicenseKey] = React.useState('');
  const [activationError, setActivationError] = React.useState<string | null>(null);
  const [isActivating, setIsActivating] = React.useState(false);
  const canPurchase = Platform.OS === 'web' && isSafeHttpsUrl(purchaseUrl);

  const handleDismiss = React.useCallback(() => {
    Keyboard.dismiss();
    setLicenseKey('');
    setActivationError(null);
    setIsActivating(false);
    onDismiss();
  }, [onDismiss]);

  React.useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') handleDismiss();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleDismiss, visible]);

  const handleActivate = async () => {
    if (isActivating) return;
    if (!activationAvailable) {
      setActivationError(t('proActivationUnavailable'));
      return;
    }

    setActivationError(null);
    setIsActivating(true);
    const result = await onActivate(licenseKey);

    if (result.success) {
      setIsActivating(false);
      handleDismiss();
      return;
    }

    setIsActivating(false);
    setActivationError(getActivationErrorText(result, t));
  };

  const handlePurchase = async () => {
    if (!canPurchase) return;
    try {
      await Linking.openURL(purchaseUrl);
    } catch {
      setActivationError(t('proPurchaseOpenFailed'));
    }
  };

  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={handleDismiss}
      snapPoints={['full']}
      testID="pro-paywall-modal"
    >
      <RNHostView>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <View style={styles.heading}>
              <Text selectable style={[styles.title, { color: themeColors.text }]}>{t('proUnlockTitle')}</Text>
              <Text selectable style={[styles.subtitle, { color: themeColors.textSecondary }]}>{t('proUnlockDescription')}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('proCloseModal')}
              onPress={handleDismiss}
              style={[styles.closeButton, { backgroundColor: themeColors.brandSubtle }]}
              testID="pro-paywall-close"
            >
              <Text style={[styles.closeButtonText, { color: themeColors.brand }]}>×</Text>
            </TouchableOpacity>
          </View>

          {!activationAvailable ? (
            <View style={[styles.serviceNotice, { backgroundColor: themeColors.brandSubtle, borderColor: themeColors.cardBorder }]}>
              <Text selectable style={[styles.serviceNoticeTitle, { color: themeColors.brand }]}>{t('proComingSoonBadge')}</Text>
              <Text selectable style={[styles.serviceNoticeText, { color: themeColors.textSecondary }]}>{t('proComingSoonDescription')}</Text>
            </View>
          ) : null}

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

          <TouchableOpacity
            accessibilityRole="link"
            accessibilityLabel={canPurchase ? t('proPurchase') : t('proPurchaseUnavailable')}
            disabled={!canPurchase}
            onPress={() => void handlePurchase()}
            style={[
              styles.purchaseButton,
              { borderColor: themeColors.brand },
              !canPurchase && styles.buttonDisabled,
            ]}
          >
            <Text style={[styles.purchaseButtonText, { color: themeColors.brand }]}>
              {canPurchase ? t('proPurchase') : t('proPurchaseUnavailable')}
            </Text>
          </TouchableOpacity>

          <View style={styles.activationSection}>
            <Text selectable style={[styles.inputLabel, { color: themeColors.text }]}>{t('proLicenseKeyLabel')}</Text>
            <TextInput
              accessibilityLabel={t('proLicenseKeyLabel')}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isActivating && activationAvailable}
              onChangeText={setLicenseKey}
              onSubmitEditing={() => void handleActivate()}
              placeholder={t('proLicenseKeyPlaceholder')}
              placeholderTextColor={themeColors.textMuted}
              returnKeyType="done"
              style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.composerBg, borderColor: themeColors.composerBorder }]}
              value={licenseKey}
            />
            {activationError ? <Text selectable style={styles.errorText}>{activationError}</Text> : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={activationAvailable ? t('proActivateLicense') : t('proComingSoonAction')}
              disabled={isActivating || !activationAvailable}
              onPress={() => void handleActivate()}
              style={[
                styles.activateButton,
                { backgroundColor: themeColors.brand },
                (isActivating || !activationAvailable) && styles.buttonDisabled,
              ]}
            >
              {isActivating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.activateButtonText}>
                  {activationAvailable ? t('proActivateLicense') : t('proComingSoonAction')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </RNHostView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: 20,
    paddingBottom: 36,
    gap: 16,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heading: {
    flex: 1,
    gap: 6,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '700',
    marginTop: -2,
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
  serviceNotice: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  serviceNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  serviceNoticeText: {
    fontSize: 13,
    lineHeight: 18,
  },
  purchaseButton: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  purchaseButtonText: {
    fontSize: 14,
    fontWeight: '800',
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

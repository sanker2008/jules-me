import React, { useState } from 'react';
import {
  Modal,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { LicenseTier } from '../types/pro';
import { useAppLanguage, createTranslator } from '../i18n';
import { useTheme } from '../hooks/use-theme';

interface ProBadgeProps {
  tier?: LicenseTier;
  style?: StyleProp<ViewStyle>;
  showPrivilegesOnPress?: boolean;
}

export function ProBadge({
  tier = 'pro_monthly',
  style,
  showPrivilegesOnPress = true,
}: ProBadgeProps) {
  const [showModal, setShowModal] = useState(false);
  const { language } = useAppLanguage();
  const t = createTranslator(language);
  const themeColors = useTheme();

  const isLifetime = tier === 'pro_lifetime';
  const label = isLifetime ? t('proLifetimeBadge') : t('proBadge');

  const privileges = [
    { icon: '⚡', title: t('proPrivilegePromptsTitle'), desc: t('proPrivilegePromptsDesc') },
    { icon: '🎯', title: t('proPrivilegeRulesTitle'), desc: t('proPrivilegeRulesDesc') },
    { icon: '↻', title: t('proPrivilegeAutoApplyTitle'), desc: t('proPrivilegeAutoApplyDesc') },
    { icon: '📊', title: t('proPrivilegeReportTitle'), desc: t('proPrivilegeReportDesc') },
    { icon: '✨', title: t('proPrivilegeIdentityTitle'), desc: t('proPrivilegeIdentityDesc') },
  ];

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (showPrivilegesOnPress) setShowModal(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.container, style]}
      >
        <LinearGradient
          colors={['#F59E0B', '#D97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <Text style={styles.badgeText}>{label}</Text>
        </LinearGradient>
      </TouchableOpacity>

      {showPrivilegesOnPress && (
        <Modal
          visible={showModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: themeColors.card }]}>
              <View style={styles.modalHeader}>
                <LinearGradient
                  colors={['#F59E0B', '#D97706']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.modalBadge}
                >
                  <Text style={styles.modalBadgeText}>{label}</Text>
                </LinearGradient>
                <Text style={[styles.modalTitle, { color: themeColors.text }]}>
                  {t('proPrivilegesTitle')}
                </Text>
                <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
                  {t('proPrivilegesSubtitle')}
                </Text>
              </View>

              <View style={styles.privilegeList}>
                {privileges.map((p, idx) => (
                  <View key={idx} style={[styles.privilegeRow, { backgroundColor: themeColors.backgroundElement }]}>
                    <Text style={styles.privilegeIcon}>{p.icon}</Text>
                    <View style={styles.privilegeCopy}>
                      <Text style={[styles.privilegeItemTitle, { color: themeColors.text }]}>
                        {p.title}
                      </Text>
                      <Text style={[styles.privilegeItemDesc, { color: themeColors.textSecondary }]}>
                        {p.desc}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.closeModalButton, { backgroundColor: themeColors.brandSubtle }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[styles.closeModalText, { color: themeColors.brand }]}>
                  {t('closeSettings')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradient: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 22,
    gap: 16,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  modalHeader: {
    alignItems: 'center',
    gap: 6,
  },
  modalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  privilegeList: {
    gap: 10,
  },
  privilegeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 10,
  },
  privilegeIcon: {
    fontSize: 22,
  },
  privilegeCopy: {
    flex: 1,
    gap: 2,
  },
  privilegeItemTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  privilegeItemDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  closeModalButton: {
    minHeight: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  closeModalText: {
    fontSize: 14,
    fontWeight: '800',
  },
});

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CustomPrompt, saveCustomPrompts } from '../utils/pro-storage';
import { GradientButton } from './gradient-button';
import { useTheme } from '../hooks/use-theme';
import type { Translator } from '../i18n';

interface CustomPromptsModalProps {
  visible: boolean;
  onClose: () => void;
  prompts: CustomPrompt[];
  onPromptsChange: (prompts: CustomPrompt[]) => void;
  onSelectPrompt: (promptText: string) => void;
  t: Translator;
}

export function CustomPromptsModal({
  visible,
  onClose,
  prompts,
  onPromptsChange,
  onSelectPrompt,
  t,
}: CustomPromptsModalProps) {
  const themeColors = useTheme();
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    const title = newTitle.trim();
    const prompt = newContent.trim();
    if (!title || !prompt) {
      setError('请输入标题和指令内容');
      return;
    }

    const newPromptItem: CustomPrompt = {
      id: `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      prompt,
      createdAt: Date.now(),
    };

    const updated = [newPromptItem, ...prompts];
    onPromptsChange(updated);
    await saveCustomPrompts(updated);

    setNewTitle('');
    setNewContent('');
    setError(null);
  };

  const handleDelete = async (id: string) => {
    const updated = prompts.filter(p => p.id !== id);
    onPromptsChange(updated);
    await saveCustomPrompts(updated);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={[styles.card, { backgroundColor: themeColors.card }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: themeColors.text }]}>
                {t('managePromptsTitle')}
              </Text>
              <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
                Pro 专属快捷指令库 · 点击即可填入任务
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
              onPress={onClose}
              style={[styles.closeButton, { backgroundColor: themeColors.brandSubtle }]}
            >
              <Text style={[styles.closeButtonText, { color: themeColors.brand }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Add New Prompt Form */}
            <View style={[styles.addSection, { backgroundColor: themeColors.backgroundElement }]}>
              <Text style={[styles.sectionHeading, { color: themeColors.text }]}>
                {t('addCustomPrompt')}
              </Text>
              <TextInput
                style={[styles.input, { color: themeColors.text, backgroundColor: themeColors.composerBg }]}
                placeholder={t('promptTitlePlaceholder')}
                placeholderTextColor={themeColors.textMuted}
                value={newTitle}
                onChangeText={text => {
                  setNewTitle(text);
                  if (error) setError(null);
                }}
                maxLength={30}
              />
              <TextInput
                style={[styles.textarea, { color: themeColors.text, backgroundColor: themeColors.composerBg }]}
                placeholder={t('promptContentPlaceholder')}
                placeholderTextColor={themeColors.textMuted}
                value={newContent}
                onChangeText={text => {
                  setNewContent(text);
                  if (error) setError(null);
                }}
                multiline
                textAlignVertical="top"
                maxLength={1000}
              />
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <GradientButton
                title={t('addPromptButton')}
                onPress={handleAdd}
                style={styles.addButton}
              />
            </View>

            {/* List of Custom Prompts */}
            <View style={styles.listSection}>
              <Text style={[styles.sectionHeading, { color: themeColors.textSecondary }]}>
                已保存的指令 ({prompts.length})
              </Text>
              {prompts.length === 0 ? (
                <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
                  {t('noCustomPromptsDesc')}
                </Text>
              ) : (
                prompts.map(item => (
                  <View
                    key={item.id}
                    style={[styles.promptCard, { backgroundColor: themeColors.backgroundElement }]}
                  >
                    <TouchableOpacity
                      style={styles.promptContentPressable}
                      onPress={() => {
                        onSelectPrompt(item.prompt);
                        onClose();
                      }}
                    >
                      <Text style={[styles.promptTitle, { color: themeColors.text }]}>
                        ✦ {item.title}
                      </Text>
                      <Text
                        numberOfLines={2}
                        style={[styles.promptSnippet, { color: themeColors.textSecondary }]}
                      >
                        {item.prompt}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityLabel={t('deletePrompt')}
                      onPress={() => handleDelete(item.id)}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  scroll: {
    flexGrow: 0,
  },
  addSection: {
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  input: {
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textarea: {
    minHeight: 72,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 19,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '600',
  },
  addButton: {
    alignSelf: 'flex-end',
    minWidth: 100,
  },
  listSection: {
    gap: 10,
    paddingBottom: 20,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 20,
  },
  promptCard: {
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  promptContentPressable: {
    flex: 1,
    gap: 4,
  },
  promptTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  promptSnippet: {
    fontSize: 12,
    lineHeight: 16,
  },
  deleteButton: {
    padding: 8,
  },
  deleteButtonText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
  },
});

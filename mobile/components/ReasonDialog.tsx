import React, { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

type Props = {
  title: string;
  message?: string;
  confirmLabel?: string;
  requireReason?: boolean;
  danger?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export default function ReasonDialog({
  title,
  message,
  confirmLabel,
  requireReason = false,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (requireReason && !reason.trim()) {
      setError(t("reasonDialog.reasonRequired"));
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Text style={styles.label}>
            {t("reasonDialog.reasonLabel")} {requireReason ? "" : t("reasonDialog.optional")}
          </Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            placeholderTextColor={colors.textMuted}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{t("reasonDialog.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: danger ? colors.danger : colors.primary }]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmText}>{confirmLabel ?? t("reasonDialog.confirm")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 20 },
    card: { width: "100%", maxWidth: 360, backgroundColor: colors.card, borderRadius: 14, padding: 18 },
    title: { fontSize: 16, fontWeight: "700", color: colors.text },
    message: { fontSize: 13.5, color: colors.textMuted, marginTop: 4 },
    label: { fontSize: 12.5, color: colors.textMuted, marginTop: 14, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
      backgroundColor: colors.inputBg,
      color: colors.text,
      minHeight: 70,
      textAlignVertical: "top",
    },
    error: { color: colors.danger, fontSize: 12.5, marginTop: 6 },
    buttonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
    cancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
    cancelText: { fontSize: 13.5, color: colors.text },
    confirmBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
    confirmText: { fontSize: 13.5, fontWeight: "700", color: colors.primaryText },
  });
}

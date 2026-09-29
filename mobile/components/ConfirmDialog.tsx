import React, { useMemo } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

type Props = {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onCancel }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{t("reasonDialog.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: danger ? colors.danger : colors.primary }]}
              onPress={onConfirm}
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
    buttonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 },
    cancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
    cancelText: { fontSize: 13.5, color: colors.text },
    confirmBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
    confirmText: { fontSize: 13.5, fontWeight: "700", color: colors.primaryText },
  });
}

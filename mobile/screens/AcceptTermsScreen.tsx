import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { supabase } from "../lib/supabase";
import { WEB_BASE_URL } from "../lib/constants";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

export default function AcceptTermsScreen({ userId, onAccepted }: { userId: string; onAccepted: () => void }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setError(null);
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      setError(t("godtaVilkar.genericError"));
      return;
    }
    onAccepted();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.title}>{t("godtaVilkar.heading")}</Text>
        <Text style={styles.text}>{t("godtaVilkar.intro")}</Text>

        <TouchableOpacity style={styles.checkboxRow} onPress={() => setChecked(!checked)}>
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>
            {t("godtaVilkar.agreePrefix")}{" "}
            <Text style={styles.link} onPress={() => Linking.openURL(`${WEB_BASE_URL}/vilkar`)}>
              {t("godtaVilkar.termsLink")}
            </Text>{" "}
            {t("godtaVilkar.and")}{" "}
            <Text style={styles.link} onPress={() => Linking.openURL(`${WEB_BASE_URL}/personvern`)}>
              {t("godtaVilkar.privacyLink")}
            </Text>
            .
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, (!checked || saving) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!checked || saving}
        >
          <Text style={styles.buttonText}>{saving ? t("common.saving") : t("godtaVilkar.continue")}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleLogout} style={styles.logoutWrap}>
          <Text style={styles.logoutText}>{t("godtaVilkar.logoutInstead")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background, justifyContent: "center", padding: 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
    },
    title: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: 8 },
    text: { fontSize: 13.5, color: colors.textMuted, marginBottom: 16, lineHeight: 19 },
    checkboxRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkboxMark: { fontSize: 13, color: colors.primaryText, fontWeight: "700" },
    checkboxLabel: { flex: 1, fontSize: 13.5, color: colors.text, lineHeight: 19 },
    link: { color: colors.primary, fontWeight: "600" },
    error: { color: colors.danger, fontSize: 13, marginTop: 12 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 14,
      alignItems: "center",
      marginTop: 20,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.primaryText, fontSize: 14.5, fontWeight: "600" },
    logoutWrap: { marginTop: 14, alignItems: "center" },
    logoutText: { fontSize: 13, color: colors.textMuted },
  });
}

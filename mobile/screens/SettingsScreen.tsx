import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Linking, ScrollView } from "react-native";
import { supabase } from "../lib/supabase";
import { WEB_BASE_URL } from "../lib/constants";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { Profile, ROLE_LABELS } from "../lib/types";
import ReminderSettings from "../components/ReminderSettings";
import NotificationPreferences from "../components/NotificationPreferences";

export default function SettingsScreen({ userId }: { userId: string }) {
  const { colors, mode, toggleMode } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const isStaff = profile?.role === "admin" || profile?.role === "moderator";

  useEffect(() => {
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [userId]);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  return (
    <ScrollView style={styles.wrap} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>{t("settings.title")}</Text>

      <View style={styles.card}>
        <Text style={styles.label}>{t("settings.name")}</Text>
        <Text style={styles.value}>{profile?.full_name ?? "…"}</Text>
        <Text style={styles.label}>{t("settings.email")}</Text>
        <Text style={styles.value}>{profile?.email ?? "…"}</Text>
        <Text style={styles.label}>{t("settings.role")}</Text>
        <Text style={styles.value}>{profile ? ROLE_LABELS[profile.role] : "…"}</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.value}>{t("settings.darkMode")}</Text>
          <TouchableOpacity onPress={toggleMode} style={styles.toggle}>
            <Text style={styles.toggleText}>{mode === "dark" ? t("settings.on") : t("settings.off")}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.rowBetween, { marginTop: 12 }]}>
          <Text style={styles.value}>{t("settings.language")}</Text>
          <View style={styles.flagRow}>
            <TouchableOpacity
              onPress={() => setLanguage("no")}
              style={[styles.flagBtn, language === "no" && styles.flagBtnActive]}
            >
              <Text style={styles.flagText}>🇳🇴</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setLanguage("en")}
              style={[styles.flagBtn, language === "en" && styles.flagBtnActive]}
            >
              <Text style={styles.flagText}>🇬🇧</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ReminderSettings />

      {isStaff && <NotificationPreferences userId={userId} />}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{t("settings.logout")}</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <Text style={styles.footerLink} onPress={() => Linking.openURL(`${WEB_BASE_URL}/vilkar`)}>
          {t("footer.terms")}
        </Text>
        <Text style={styles.footerDot}>·</Text>
        <Text style={styles.footerLink} onPress={() => Linking.openURL(`${WEB_BASE_URL}/personvern`)}>
          {t("footer.privacy")}
        </Text>
        <Text style={styles.footerDot}>·</Text>
        <Text style={styles.footerText}>{t("footer.copyright", { year: new Date().getFullYear() })}</Text>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 16 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
    },
    label: { fontSize: 11.5, color: colors.textMuted, marginTop: 8 },
    value: { fontSize: 14.5, color: colors.text, marginTop: 2 },
    rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    toggle: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14 },
    toggleText: { fontSize: 12.5, color: colors.text },
    flagRow: { flexDirection: "row", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 2 },
    flagBtn: { paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6 },
    flagBtnActive: { backgroundColor: colors.background },
    flagText: { fontSize: 16 },
    logoutButton: {
      borderWidth: 1,
      borderColor: colors.danger,
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
      marginTop: 8,
    },
    logoutText: { color: colors.danger, fontSize: 14.5, fontWeight: "600" },
    footer: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
      marginTop: 24,
    },
    footerLink: { fontSize: 12, color: colors.primary, fontWeight: "600" },
    footerDot: { fontSize: 12, color: colors.textMuted },
    footerText: { fontSize: 12, color: colors.textMuted },
  });
}

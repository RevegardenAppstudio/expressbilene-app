import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

const NOTIFICATION_TYPES = ["hendelse", "service_paaminnelse"] as const;

export default function NotificationPreferences({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("push_notification_preferences")
      .select("notification_type, enabled")
      .eq("user_id", userId)
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        for (const row of (data ?? []) as { notification_type: string; enabled: boolean }[]) {
          map[row.notification_type] = row.enabled;
        }
        setPrefs(map);
        setLoaded(true);
      });
  }, [userId]);

  async function handleToggle(type: string, enabled: boolean) {
    setPrefs((prev) => ({ ...prev, [type]: enabled }));
    await supabase
      .from("push_notification_preferences")
      .upsert({ user_id: userId, notification_type: type, enabled, updated_at: new Date().toISOString() });
  }

  if (!loaded) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("settings.pushNotificationsTitle")}</Text>
      <Text style={styles.hint}>{t("settings.pushNotificationsHint")}</Text>

      {NOTIFICATION_TYPES.map((type, i) => (
        <View key={type} style={[styles.row, i > 0 && styles.rowSpaced]}>
          <Text style={styles.value}>{t(`notificationType.${type}`)}</Text>
          <Switch value={prefs[type] ?? true} onValueChange={(v) => handleToggle(type, v)} />
        </View>
      ))}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
    },
    title: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 2 },
    hint: { fontSize: 11.5, color: colors.textMuted, marginBottom: 10 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    rowSpaced: { marginTop: 14 },
    value: { fontSize: 14.5, color: colors.text },
  });
}

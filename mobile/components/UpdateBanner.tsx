import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Application from "expo-application";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

type Release = { version_code: number; version_name: string; apk_path: string };

export default function UpdateBanner() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [release, setRelease] = useState<Release | null>(null);
  const [dismissedCode, setDismissedCode] = useState<number | null>(null);

  const check = useCallback(async () => {
    if (Platform.OS !== "android" || __DEV__) return;
    const installed = Number(Application.nativeBuildVersion);
    if (!installed) return;
    const { data } = await supabase
      .from("app_releases")
      .select("version_code, version_name, apk_path")
      .eq("platform", "android")
      .order("version_code", { ascending: false })
      .limit(1)
      .maybeSingle();
    setRelease(data && data.version_code > installed ? (data as Release) : null);
  }, []);

  useEffect(() => {
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, [check]);

  if (!release || dismissedCode === release.version_code) return null;

  const url = supabase.storage.from("app-releases").getPublicUrl(release.apk_path).data.publicUrl;

  return (
    <View style={styles.banner}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{t("update.available")}</Text>
        <Text style={styles.sub}>{t("update.version", { version: release.version_name })}</Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={() => Linking.openURL(url)}>
        <Text style={styles.buttonText}>{t("update.download")}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setDismissedCode(release.version_code)} style={styles.close}>
        <Text style={styles.sub}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    title: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
    button: { backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 12 },
    buttonText: { color: colors.primaryText, fontSize: 12.5, fontWeight: "700" },
    close: { padding: 4 },
  });
}

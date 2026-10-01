import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { Profile } from "../lib/types";
import SettingsScreen from "./SettingsScreen";
import VarslerScreen from "./VarslerScreen";
import KalenderScreen from "./KalenderScreen";
import AnsatteScreen from "./AnsatteScreen";

export type MoreSubScreen = "menu" | "varsler" | "kalender" | "ansatte" | "settings";

// Admin/moderator hadde for mange faner i bunnmenyen (Varsler + Kalender kom
// på toppen av Timer/Fravær/Hendelser) -- de samles derfor her under "Mer"
// som en enkel meny i stedet, slik at bunnmenyen forblir lik for alle roller.
export default function MoreMenuScreen({
  userId,
  profile,
  subScreen,
  setSubScreen,
}: {
  userId: string;
  profile: Profile | null;
  subScreen: MoreSubScreen;
  setSubScreen: (screen: MoreSubScreen) => void;
}) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isStaff = profile?.role === "admin" || profile?.role === "moderator";

  // Sjåfør har ingenting å velge mellom -- går rett til innstillinger, som før.
  if (!isStaff) {
    return <SettingsScreen userId={userId} />;
  }

  if (subScreen === "varsler") {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader label={t("more.varsler")} onBack={() => setSubScreen("menu")} colors={colors} />
        <VarslerScreen userId={userId} profile={profile} />
      </View>
    );
  }

  if (subScreen === "kalender") {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader label={t("more.kalender")} onBack={() => setSubScreen("menu")} colors={colors} />
        <KalenderScreen userId={userId} profile={profile} />
      </View>
    );
  }

  if (subScreen === "ansatte") {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader label={t("more.ansatte")} onBack={() => setSubScreen("menu")} colors={colors} />
        <AnsatteScreen userId={userId} profile={profile} />
      </View>
    );
  }

  if (subScreen === "settings") {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader label={t("more.settings")} onBack={() => setSubScreen("menu")} colors={colors} />
        <SettingsScreen userId={userId} />
      </View>
    );
  }

  const items: { key: MoreSubScreen; label: string; icon: string }[] = [
    { key: "varsler", label: t("more.varsler"), icon: "🔔" },
    { key: "kalender", label: t("more.kalender"), icon: "📅" },
    { key: "ansatte", label: t("more.ansatte"), icon: "👥" },
    { key: "settings", label: t("more.settings"), icon: "⚙️" },
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("more.title")}</Text>
      {items.map((item) => (
        <TouchableOpacity key={item.key} style={styles.row} onPress={() => setSubScreen(item.key)}>
          <Text style={styles.icon}>{item.icon}</Text>
          <Text style={styles.rowLabel}>{item.label}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function BackHeader({ label, onBack, colors }: { label: string; onBack: () => void; colors: ThemeColors }) {
  const styles = createHeaderStyles(colors);
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Text style={styles.backText}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{label}</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

function createHeaderStyles(colors: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderSubtle,
      backgroundColor: colors.background,
    },
    backBtn: { minWidth: 44 },
    backText: { fontSize: 20, color: colors.primary, fontWeight: "700" },
    headerTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  });
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background, padding: 16 },
    title: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 16 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    icon: { fontSize: 18, marginRight: 12 },
    rowLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" },
    chevron: { fontSize: 18, color: colors.textMuted },
  });
}

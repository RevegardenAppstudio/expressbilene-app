import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import LoginScreen from "./screens/LoginScreen";
import GlemtPassordScreen from "./screens/GlemtPassordScreen";
import AcceptTermsScreen from "./screens/AcceptTermsScreen";
import HomeScreen from "./screens/HomeScreen";
import OversiktScreen from "./screens/OversiktScreen";
import HendelserScreen from "./screens/HendelserScreen";
import MoreMenuScreen, { MoreSubScreen } from "./screens/MoreMenuScreen";
import UpdateBanner from "./components/UpdateBanner";
import { ThemeProvider, useTheme } from "./theme/ThemeContext";
import { ThemeColors } from "./theme/colors";
import { registerPushToken } from "./lib/notifications";
import { LanguageProvider, useLanguage } from "./lib/i18n/LanguageContext";
import { Profile } from "./lib/types";

type Tab = "home" | "oversikt" | "hendelser" | "innstillinger";

function isReminderIdentifier(identifier: string) {
  return identifier.startsWith("reminder-clock-in") || identifier.startsWith("reminder-clock-out");
}

function AppInner() {
  const { mode, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authScreen, setAuthScreen] = useState<"login" | "glemt-passord">("login");
  const [tab, setTab] = useState<Tab>("home");
  const [moreSubScreen, setMoreSubScreen] = useState<MoreSubScreen>("menu");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }
    registerPushToken(session.user.id);
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data }) => setProfile(data as Profile | null));
  }, [session]);

  useEffect(() => {
    const staff = profile?.role === "admin" || profile?.role === "moderator";

    function handleTap(identifier: string) {
      if (isReminderIdentifier(identifier)) {
        setTab("home");
      } else if (staff) {
        setTab("innstillinger");
        setMoreSubScreen("varsler");
      }
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleTap(response.notification.request.identifier);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleTap(response.notification.request.identifier);
    });
    return () => subscription.remove();
  }, [profile]);

  return (
    <LanguageProvider language={profile?.language ?? "no"} userId={session?.user.id ?? null}>
      <AppScreens
        styles={styles}
        mode={mode}
        checkingSession={checkingSession}
        session={session}
        profile={profile}
        setProfile={setProfile}
        authScreen={authScreen}
        setAuthScreen={setAuthScreen}
        tab={tab}
        setTab={setTab}
        moreSubScreen={moreSubScreen}
        setMoreSubScreen={setMoreSubScreen}
      />
    </LanguageProvider>
  );
}

function AppScreens({
  styles,
  mode,
  checkingSession,
  session,
  profile,
  setProfile,
  authScreen,
  setAuthScreen,
  tab,
  setTab,
  moreSubScreen,
  setMoreSubScreen,
}: {
  styles: ReturnType<typeof createStyles>;
  mode: "light" | "dark";
  checkingSession: boolean;
  session: Session | null;
  profile: Profile | null;
  setProfile: (profile: Profile) => void;
  authScreen: "login" | "glemt-passord";
  setAuthScreen: (screen: "login" | "glemt-passord") => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  moreSubScreen: MoreSubScreen;
  setMoreSubScreen: (screen: MoreSubScreen) => void;
}) {
  const { t } = useLanguage();

  if (checkingSession) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.loadingText}>{t("common.loading")}</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        {authScreen === "login" ? (
          <LoginScreen onForgotPassword={() => setAuthScreen("glemt-passord")} />
        ) : (
          <GlemtPassordScreen onBack={() => setAuthScreen("login")} />
        )}
      </SafeAreaView>
    );
  }

  if (profile && !profile.terms_accepted_at) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
        <AcceptTermsScreen
          userId={session.user.id}
          onAccepted={() => setProfile({ ...profile, terms_accepted_at: new Date().toISOString() })}
        />
      </SafeAreaView>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "home", label: t("tabs.home") },
    { key: "oversikt", label: t("tabs.oversikt") },
    { key: "hendelser", label: t("tabs.hendelser") },
    { key: "innstillinger", label: t("tabs.more") },
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <UpdateBanner />
      <View style={{ flex: 1 }}>
        {tab === "home" ? (
          <HomeScreen userId={session.user.id} profile={profile} />
        ) : tab === "oversikt" ? (
          <OversiktScreen userId={session.user.id} profile={profile} />
        ) : tab === "hendelser" ? (
          <HendelserScreen userId={session.user.id} profile={profile} />
        ) : (
          <MoreMenuScreen
            userId={session.user.id}
            profile={profile}
            subScreen={moreSubScreen}
            setSubScreen={setMoreSubScreen}
          />
        )}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((tabItem) => (
          <TouchableOpacity
            key={tabItem.key}
            style={styles.tabBtn}
            onPress={() => {
              setTab(tabItem.key);
              if (tabItem.key === "innstillinger") setMoreSubScreen("menu");
            }}
          >
            <Text style={[styles.tabLabel, tab === tabItem.key && styles.tabLabelActive]}>{tabItem.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
    loadingText: { color: colors.textMuted, fontSize: 14 },
    tabBar: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
    tabBtn: { flex: 1, alignItems: "center", paddingVertical: 12 },
    tabLabel: { fontSize: 13, color: colors.textMuted, fontWeight: "500" },
    tabLabelActive: { color: colors.primary },
  });
}

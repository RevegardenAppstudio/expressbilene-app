import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ImageBackground,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

const LOGO_WHITE = require("../assets/logo-dark.png");
const LOGIN_BG = require("../assets/login-bg.jpg");

export default function LoginScreen({ onForgotPassword }: { onForgotPassword: () => void }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError(t("login.missingFieldsError"));
      return;
    }
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(t("login.invalidCredentialsError"));
    }
  }

  return (
    <ImageBackground source={LOGIN_BG} style={styles.bg} resizeMode="cover">
      <View style={styles.overlay} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <Image source={LOGO_WHITE} style={styles.logo} resizeMode="contain" />
        <Text style={styles.subtitle}>{t("login.subtitle")}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>{t("login.email")}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder={t("login.emailPlaceholder")}
            placeholderTextColor={colors.textMuted}
          />

          <Text style={styles.label}>{t("login.password")}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? t("login.loggingIn") : t("login.login")}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onForgotPassword} style={styles.linkWrap}>
            <Text style={styles.link}>{t("login.forgotPassword")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.hintText}>{t("login.newEmployeeHint")}</Text>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    bg: { flex: 1 },
    overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" },
    wrap: { flex: 1, justifyContent: "center", padding: 24 },
    logo: { width: 200, height: Math.round((200 * 725) / 2170), alignSelf: "center", marginBottom: 12 },
    subtitle: { fontSize: 14, color: "#e2e8f0", marginBottom: 24, textAlign: "center" },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
      backgroundColor: "rgba(255,255,255,0.12)",
      padding: 16,
    },
    label: { fontSize: 13, color: "#ffffff", marginBottom: 6, marginTop: 12 },
    input: {
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.3)",
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      backgroundColor: "rgba(255,255,255,0.9)",
      color: "#0f172a",
    },
    error: { color: "#fca5a5", fontSize: 13, marginTop: 10 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 14,
      alignItems: "center",
      marginTop: 20,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: "600" },
    linkWrap: { marginTop: 16, alignItems: "center" },
    link: { color: "rgba(255,255,255,0.85)", fontSize: 13 },
    hintText: { fontSize: 12.5, color: "#cbd5e1", textAlign: "center", marginTop: 24 },
  });
}

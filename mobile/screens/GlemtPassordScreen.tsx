import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

// Lenken i e-posten peker til nettappen sin /sett-passord-side (konfigurert i
// Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs),
// siden denne mobilappen ikke har dyplenke-håndtering for e-postlenker ennå.
export default function GlemtPassordScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!email.trim()) {
      setError(t("glemtPassord.missingEmailError"));
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setLoading(false);
    if (error) {
      setError(t("glemtPassord.genericError"));
      return;
    }
    setSent(true);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("glemtPassord.title")}</Text>

      {sent ? (
        <Text style={styles.info}>{t("glemtPassord.sentInfo", { email })}</Text>
      ) : (
        <>
          <Text style={styles.label}>{t("glemtPassord.email")}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholderTextColor={colors.textMuted}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Text style={styles.buttonText}>{loading ? t("glemtPassord.sending") : t("glemtPassord.sendLink")}</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity onPress={onBack} style={styles.linkWrap}>
        <Text style={styles.link}>{t("glemtPassord.backToLogin")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.background },
    title: { fontSize: 22, fontWeight: "700", color: colors.primary, marginBottom: 20 },
    label: { fontSize: 13, color: colors.textMuted, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 15,
      backgroundColor: colors.inputBg,
      color: colors.text,
    },
    info: { fontSize: 14, color: colors.text, lineHeight: 20 },
    error: { color: colors.danger, fontSize: 13, marginTop: 10 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 14,
      alignItems: "center",
      marginTop: 20,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.primaryText, fontSize: 15, fontWeight: "600" },
    linkWrap: { marginTop: 18, alignItems: "center" },
    link: { color: colors.primary, fontSize: 13, textDecorationLine: "underline" },
  });
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList, RefreshControl } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import PickerField from "../components/PickerField";
import ConfirmDialog from "../components/ConfirmDialog";
import { Absence, AbsenceType, ADMIN_ONLY_ABSENCE_TYPES, Profile } from "../lib/types";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { toIsoDate } from "../lib/calendar";
import { ABSENCE_TYPES, absenceErrorKey } from "../lib/absences";

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

const STATUS_COLOR: Record<string, keyof ThemeColors> = {
  venter: "warning",
  godkjent: "success",
  avslatt: "danger",
};

export default function FravaerScreen({ userId, profile }: { userId: string; profile: Profile | null }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const availableTypes =
    profile?.role === "admin" ? ABSENCE_TYPES : ABSENCE_TYPES.filter((v) => !ADMIN_ONLY_ABSENCE_TYPES.includes(v));

  const QUICK_SICK_TYPES: { type: AbsenceType; label: string; confirmTitle: string }[] = [
    { type: "sykdom_egenmelding", label: t("fravaer.quickSickToday"), confirmTitle: t("fravaer.confirmSickTitle") },
    { type: "sykt_barn", label: t("fravaer.quickSickChildToday"), confirmTitle: t("fravaer.confirmSickChildTitle") },
  ];

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [egenmeldingPeriods, setEgenmeldingPeriods] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<AbsenceType>("sykdom_egenmelding");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [note, setNote] = useState("");
  const [pendingQuickSick, setPendingQuickSick] = useState<AbsenceType | null>(null);

  const load = useCallback(async () => {
    const [{ data, error }, { data: egenmelding }] = await Promise.all([
      supabase.from("absences").select("*").eq("user_id", userId).order("start_date", { ascending: false }).limit(30),
      supabase.rpc("egenmelding_usage", { p_user_id: userId }),
    ]);
    if (!error && data) setAbsences(data as Absence[]);
    if (egenmelding && egenmelding[0]) setEgenmeldingPeriods(egenmelding[0].period_count);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit() {
    setError(null);
    if (toIsoDate(endDate) < toIsoDate(startDate)) {
      setError(t("fravaer.endBeforeStartError"));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("absences").insert({
      user_id: userId,
      type,
      start_date: toIsoDate(startDate),
      end_date: toIsoDate(endDate),
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(t(absenceErrorKey(error, "fravaer.submitFailed")));
      return;
    }
    setNote("");
    load();
  }

  async function handleCancel(id: string) {
    const { error } = await supabase.from("absences").delete().eq("id", id);
    if (!error) setAbsences((prev) => prev.filter((a) => a.id !== id));
  }

  async function confirmQuickSick() {
    const sickType = pendingQuickSick;
    setPendingQuickSick(null);
    if (!sickType) return;

    setError(null);
    setSaving(true);
    const today = toIsoDate(new Date());
    const { error } = await supabase.from("absences").insert({
      user_id: userId,
      type: sickType,
      start_date: today,
      end_date: today,
    });
    setSaving(false);
    if (error) {
      setError(t(absenceErrorKey(error, "fravaer.sickSaveFailed")));
      return;
    }
    load();
  }

  return (
    <>
    <FlatList
      style={styles.wrap}
      data={absences}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>{t("fravaer.title")}</Text>
          <Text style={styles.subtitle}>{t("fravaer.subtitle")}</Text>

          <View style={styles.quickRow}>
            {QUICK_SICK_TYPES.map((q) => (
              <TouchableOpacity
                key={q.type}
                onPress={() => setPendingQuickSick(q.type)}
                disabled={saving}
                style={[styles.quickBtn, saving && styles.buttonDisabled]}
              >
                <Text style={styles.quickBtnText}>{q.label}</Text>
                <Text style={styles.quickBtnSubtext}>{t("fravaer.quickSickHint")}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {egenmeldingPeriods != null && (
            <Text style={[styles.egenmeldingUsage, egenmeldingPeriods >= 4 && styles.egenmeldingUsageWarning]}>
              {t("fravaer.egenmeldingUsage", { used: egenmeldingPeriods, quota: 4 })}
            </Text>
          )}

          <View style={styles.card}>
            <Text style={styles.label}>{t("fravaer.type")}</Text>
            <View style={styles.typeRow}>
              {availableTypes.map((absenceType) => (
                <TouchableOpacity
                  key={absenceType}
                  onPress={() => setType(absenceType)}
                  style={[styles.typeChip, type === absenceType && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, type === absenceType && styles.typeChipTextActive]}>
                    {t(`absenceType.${absenceType}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.dateRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <PickerField label={t("fravaer.from")} value={startDate} mode="date" onChange={setStartDate} />
              </View>
              <View style={{ flex: 1 }}>
                <PickerField label={t("fravaer.to")} value={endDate} mode="date" onChange={setEndDate} />
              </View>
            </View>

            <Text style={styles.label}>{t("fravaer.comment")}</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholderTextColor={colors.textMuted}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, saving && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={saving}
            >
              <Text style={styles.buttonText}>{saving ? t("fravaer.sending") : t("fravaer.send")}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>{t("fravaer.myApplications")}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.entryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryDate}>
              {formatDate(item.start_date)}
              {item.end_date !== item.start_date ? ` – ${formatDate(item.end_date)}` : ""}
            </Text>
            <Text style={styles.entryDesc}>{t(`absenceType.${item.type}`)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: colors[STATUS_COLOR[item.status]] + "22" }]}>
            <Text style={[styles.statusText, { color: colors[STATUS_COLOR[item.status]] }]}>
              {t(`absenceStatus.${item.status}`)}
            </Text>
          </View>
          {item.status === "venter" && (
            <TouchableOpacity onPress={() => handleCancel(item.id)} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>{t("fravaer.withdraw")}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
      ListEmptyComponent={
        !loading ? <Text style={styles.emptyText}>{t("fravaer.noApplications")}</Text> : null
      }
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    />

    {pendingQuickSick && (
      <ConfirmDialog
        title={QUICK_SICK_TYPES.find((q) => q.type === pendingQuickSick)?.confirmTitle ?? ""}
        message={t("fravaer.confirmSickMessage")}
        confirmLabel={t("fravaer.confirmSickConfirm")}
        onConfirm={confirmQuickSick}
        onCancel={() => setPendingQuickSick(null)}
      />
    )}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 16 },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
    quickRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    quickBtn: {
      flex: 1,
      backgroundColor: colors.badgeBg,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    quickBtnText: { fontSize: 13, fontWeight: "700", color: colors.badgeText },
    quickBtnSubtext: { fontSize: 10.5, color: colors.badgeText, marginTop: 2 },
    egenmeldingUsage: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
    egenmeldingUsageWarning: { color: colors.warning, fontWeight: "600" },
    label: { fontSize: 12.5, color: colors.textMuted, marginBottom: 6, marginTop: 10 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14.5,
      backgroundColor: colors.inputBg,
      color: colors.text,
    },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    typeChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginRight: 6,
      marginBottom: 6,
    },
    typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeChipText: { fontSize: 12, color: colors.text },
    typeChipTextActive: { color: colors.primaryText },
    dateRow: { flexDirection: "row", marginTop: 4 },
    error: { color: colors.danger, fontSize: 13, marginTop: 10 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
      marginTop: 16,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.primaryText, fontSize: 14.5, fontWeight: "600" },
    sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 24, marginBottom: 8 },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    entryDate: { fontSize: 13.5, color: colors.text },
    entryDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    statusBadge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, marginRight: 8 },
    statusText: { fontSize: 11, fontWeight: "600" },
    deleteBtn: { padding: 4 },
    deleteText: { fontSize: 11.5, color: colors.textMuted },
    emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 20, fontSize: 13 },
  });
}

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import PickerField from "../components/PickerField";
import { Absence, AbsenceStatus, Profile, TimeEntry } from "../lib/types";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { toIsoDate } from "../lib/calendar";

const STATUS_COLOR: Record<AbsenceStatus, keyof ThemeColors> = {
  venter: "warning",
  godkjent: "success",
  avslatt: "danger",
};

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export default function OversiktScreen({ userId, profile }: { userId: string; profile: Profile | null }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [vacationUsed, setVacationUsed] = useState<number | null>(null);
  const [egenmeldingPeriods, setEgenmeldingPeriods] = useState<number | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const currentYear = new Date().getFullYear();
  const fromIso = toIsoDate(fromDate);
  const toIso = toIsoDate(toDate);

  const load = useCallback(async () => {
    const [{ data: absenceData }, { data: used }, { data: egenmelding }, { data: entryData }] = await Promise.all([
      supabase.from("absences").select("*").eq("user_id", userId).order("start_date", { ascending: false }).limit(30),
      supabase.rpc("vacation_days_used", { p_user_id: userId, p_year: currentYear }),
      supabase.rpc("egenmelding_usage", { p_user_id: userId }),
      supabase.from("time_entries").select("*").eq("user_id", userId).gte("entry_date", fromIso).lte("entry_date", toIso),
    ]);
    if (absenceData) setAbsences(absenceData as Absence[]);
    if (typeof used === "number") setVacationUsed(used);
    if (egenmelding && egenmelding[0]) setEgenmeldingPeriods(egenmelding[0].period_count);
    if (entryData) setTimeEntries(entryData as TimeEntry[]);
    setLoading(false);
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, fromIso, toIso]);

  useEffect(() => {
    load();
  }, [load]);

  // Lønnsgrunnlag har et gulv på 8t for enhver dag det faktisk er jobbet, og
  // overtid er timene som overstiger 8t samme dag -- speiler beregningen i
  // web sin Oversikt (sammendrag/page.tsx).
  const { wageHours, overtimeHours } = useMemo(() => {
    const dailyTotals = new Map<string, number>();
    for (const e of timeEntries) {
      if (e.hours == null) continue;
      dailyTotals.set(e.entry_date, (dailyTotals.get(e.entry_date) ?? 0) + Number(e.hours));
    }
    let wage = 0;
    let overtime = 0;
    for (const dayTotal of dailyTotals.values()) {
      wage += Math.max(dayTotal, 8);
      overtime += Math.max(dayTotal - 8, 0);
    }
    return { wageHours: wage, overtimeHours: overtime };
  }, [timeEntries]);

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      <Text style={styles.title}>{t("oversikt.title")}</Text>
      <Text style={styles.subtitle}>{t("oversikt.subtitle")}</Text>

      <Text style={styles.sectionTitle}>{t("oversikt.period")}</Text>
      <View style={styles.dateRow}>
        <View style={{ flex: 1 }}>
          <PickerField label={t("fravaer.from")} value={fromDate} mode="date" onChange={setFromDate} />
        </View>
        <View style={{ flex: 1 }}>
          <PickerField label={t("kalender.toDate")} value={toDate} mode="date" onChange={setToDate} />
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{wageHours.toFixed(1)}</Text>
          <Text style={styles.summaryLabel}>{t("oversikt.wageHours")}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, overtimeHours > 0 && styles.summaryValueWarning]}>{overtimeHours.toFixed(1)}</Text>
          <Text style={styles.summaryLabel}>{t("oversikt.overtimeHours")}</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        {vacationUsed != null && profile && (
          <Text style={styles.infoLine}>
            {t("oversikt.vacationDaysUsed", { used: vacationUsed, quota: profile.vacation_days_per_year, year: currentYear })}
          </Text>
        )}
        {egenmeldingPeriods != null && (
          <Text style={[styles.infoLine, egenmeldingPeriods >= 4 && styles.infoLineWarning]}>
            {t("fravaer.egenmeldingUsage", { used: egenmeldingPeriods, quota: 4 })}
          </Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>{t("oversikt.myAbsences")}</Text>
      {loading ? (
        <Text style={styles.emptyText}>{t("common.loading")}</Text>
      ) : absences.length === 0 ? (
        <Text style={styles.emptyText}>{t("oversikt.noAbsences")}</Text>
      ) : (
        absences.map((a) => (
          <View key={a.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{t(`absenceType.${a.type}`)}</Text>
              <Text style={styles.itemBody}>
                {formatDate(a.start_date)}
                {a.end_date !== a.start_date ? ` – ${formatDate(a.end_date)}` : ""}
              </Text>
              {a.note ? <Text style={styles.itemNote}>{a.note}</Text> : null}
            </View>
            <View style={[styles.statusBadge, { backgroundColor: colors[STATUS_COLOR[a.status]] + "22" }]}>
              <Text style={[styles.statusText, { color: colors[STATUS_COLOR[a.status]] }]}>{t(`absenceStatus.${a.status}`)}</Text>
            </View>
          </View>
        ))
      )}

      <Text style={styles.hint}>{t("oversikt.contactHint")}</Text>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 14 },
    sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.text, marginBottom: 8 },
    dateRow: { flexDirection: "row", gap: 10 },
    summaryRow: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 18 },
    summaryCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.border,
    },
    summaryValue: { fontSize: 22, fontWeight: "700", color: colors.text },
    summaryValueWarning: { color: colors.warning },
    summaryLabel: { fontSize: 11.5, color: colors.textMuted, marginTop: 4, textAlign: "center" },
    infoCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 18,
      gap: 6,
    },
    infoLine: { fontSize: 12.5, color: colors.textMuted },
    infoLineWarning: { color: colors.warning, fontWeight: "600" },
    emptyText: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
    row: {
      flexDirection: "row",
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    itemTitle: { fontSize: 14, fontWeight: "600", color: colors.text },
    itemBody: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
    itemNote: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
    statusBadge: { alignSelf: "flex-start", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8 },
    statusText: { fontSize: 11, fontWeight: "600" },
    hint: { fontSize: 12, color: colors.textMuted, marginTop: 14, textAlign: "center" },
  });
}

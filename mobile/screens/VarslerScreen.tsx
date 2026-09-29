import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { Absence, AbsenceStatus, AppNotification, IncidentEvent, Profile, Vehicle, vehicleLabel } from "../lib/types";
import { useLanguage } from "../lib/i18n/LanguageContext";

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const TYPE_COLORS: Record<string, string> = {
  sykdom: "#D97706",
  egenmelding_grense: "#DC2626",
  hendelse: "#2563EB",
  service_paaminnelse: "#EA580C",
};

const STATUS_COLOR: Record<AbsenceStatus, keyof ThemeColors> = {
  venter: "warning",
  godkjent: "success",
  avslatt: "danger",
};

type Tab = "fravaer" | "hendelser" | "allevarsler";

export default function VarslerScreen({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tab, setTab] = useState<Tab>("fravaer");
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [showAllAbsences, setShowAllAbsences] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [showResolved, setShowResolved] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    let absenceQuery = supabase.from("absences").select("*").order("start_date", { ascending: false }).limit(50);
    if (!showAllAbsences) absenceQuery = absenceQuery.eq("status", "venter");

    let notificationQuery = supabase
      .from("notifications")
      .select("*")
      .in("type", ["sykdom", "egenmelding_grense", "hendelse", "service_paaminnelse"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (!showArchived) notificationQuery = notificationQuery.is("archived_at", null);

    let eventQuery = supabase.from("events").select("*").order("occurred_at", { ascending: false }).limit(50);
    if (!showResolved) eventQuery = eventQuery.eq("resolved", false);

    const [{ data: absenceData }, { data: notifData }, { data: eventData }, { data: profileData }, { data: vehicleData }] = await Promise.all([
      absenceQuery,
      notificationQuery,
      eventQuery,
      supabase.from("profiles").select("*"),
      supabase.from("vehicles").select("*"),
    ]);

    if (absenceData) setAbsences(absenceData as Absence[]);
    if (notifData) setNotifications(notifData as AppNotification[]);
    if (eventData) setEvents(eventData as IncidentEvent[]);
    if (profileData) {
      const map: Record<string, Profile> = {};
      for (const p of profileData as Profile[]) map[p.id] = p;
      setProfiles(map);
    }
    if (vehicleData) {
      const map: Record<string, Vehicle> = {};
      for (const v of vehicleData as Vehicle[]) map[v.id] = v;
      setVehicles(map);
    }
    setLoading(false);
    setRefreshing(false);
    await supabase.from("profiles").update({ notifications_viewed_at: new Date().toISOString() }).eq("id", userId);
  }, [userId, showAllAbsences, showArchived, showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDecision(id: string, status: "godkjent" | "avslatt") {
    const { error } = await supabase.from("absences").update({ status }).eq("id", id);
    if (!error) load();
  }

  async function handleArchive(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const { error } = await supabase
      .from("notifications")
      .update({ archived_at: new Date().toISOString(), archived_by: userId })
      .eq("id", id);
    if (error) load();
  }

  async function handleResolve(id: string) {
    const { error } = await supabase.from("events").update({ resolved: true }).eq("id", id);
    if (!error) load();
  }

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
      <Text style={styles.title}>{t("varsler.title")}</Text>
      <Text style={styles.subtitle}>{t("varsler.subtitle")}</Text>

      <View style={styles.tabRow}>
        <TouchableOpacity onPress={() => setTab("fravaer")} style={[styles.tabBtn, tab === "fravaer" && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === "fravaer" && styles.tabTextActive]}>{t("varsler.tabFravaer")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("hendelser")} style={[styles.tabBtn, tab === "hendelser" && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === "hendelser" && styles.tabTextActive]}>{t("varsler.tabHendelser")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("allevarsler")} style={[styles.tabBtn, tab === "allevarsler" && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === "allevarsler" && styles.tabTextActive]}>{t("varsler.tabAlleVarsler")}</Text>
        </TouchableOpacity>
      </View>

      {tab === "fravaer" ? (
        <View>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("varsler.applications")}</Text>
            <TouchableOpacity onPress={() => setShowAllAbsences((v) => !v)}>
              <Text style={styles.toggleText}>{showAllAbsences ? t("varsler.showPendingOnly") : t("varsler.showAll")}</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <Text style={styles.emptyText}>{t("common.loading")}</Text>
          ) : absences.length === 0 ? (
            <Text style={styles.emptyText}>{t("varsler.noApplications")}</Text>
          ) : (
            absences.map((a) => (
              <View key={a.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{profiles[a.user_id]?.full_name ?? t("varsler.unknown")}</Text>
                  <Text style={styles.itemBody}>
                    {t(`absenceType.${a.type}`)} · {formatDate(a.start_date)}
                    {a.end_date !== a.start_date ? ` – ${formatDate(a.end_date)}` : ""}
                  </Text>
                  {a.note ? <Text style={styles.itemNote}>{a.note}</Text> : null}
                  <View style={[styles.statusBadge, { backgroundColor: colors[STATUS_COLOR[a.status]] + "22" }]}>
                    <Text style={[styles.statusText, { color: colors[STATUS_COLOR[a.status]] }]}>{t(`absenceStatus.${a.status}`)}</Text>
                  </View>
                </View>
                {a.status === "venter" && (
                  <View style={{ gap: 6 }}>
                    <TouchableOpacity
                      onPress={() => handleDecision(a.id, "godkjent")}
                      style={[styles.decisionBtn, { backgroundColor: colors.success }]}
                    >
                      <Text style={styles.decisionBtnText}>{t("varsler.approve")}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDecision(a.id, "avslatt")}
                      style={[styles.decisionBtn, { backgroundColor: colors.danger }]}
                    >
                      <Text style={styles.decisionBtnText}>{t("varsler.decline")}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      ) : tab === "hendelser" ? (
        <View>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("varsler.tabHendelser")}</Text>
            <TouchableOpacity onPress={() => setShowResolved((v) => !v)}>
              <Text style={styles.toggleText}>{showResolved ? t("varsler.showPendingOnly") : t("varsler.showResolvedAlso")}</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <Text style={styles.emptyText}>{t("common.loading")}</Text>
          ) : events.length === 0 ? (
            <Text style={styles.emptyText}>{t("varsler.noEventsToShow")}</Text>
          ) : (
            events.map((ev) => (
              <View key={ev.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{profiles[ev.user_id]?.full_name ?? t("varsler.unknown")}</Text>
                  <Text style={styles.itemBody}>
                    {t(`eventType.${ev.type}`)} · {formatDateTime(ev.occurred_at)}
                    {ev.vehicle_id && vehicles[ev.vehicle_id] ? ` · ${vehicleLabel(vehicles[ev.vehicle_id])}` : ""}
                  </Text>
                  {ev.note ? <Text style={styles.itemNote}>{ev.note}</Text> : null}
                </View>
                {ev.resolved ? (
                  <Text style={styles.resolvedText}>{t("varsler.resolved")}</Text>
                ) : (
                  <TouchableOpacity onPress={() => handleResolve(ev.id)} style={[styles.decisionBtn, { backgroundColor: colors.success }]}>
                    <Text style={styles.decisionBtnText}>{t("varsler.markResolved")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </View>
      ) : (
        <View>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("varsler.tabAlleVarsler")}</Text>
            <TouchableOpacity onPress={() => setShowArchived((v) => !v)}>
              <Text style={styles.toggleText}>{showArchived ? t("varsler.hideArchived") : t("varsler.showArchivedAlso")}</Text>
            </TouchableOpacity>
          </View>
          {notifications.length === 0 ? (
            <Text style={styles.emptyText}>{t("varsler.noNotifications")}</Text>
          ) : (
            notifications.map((n) => (
              <View key={n.id} style={styles.notifRow}>
                <View style={[styles.dot, { backgroundColor: TYPE_COLORS[n.type] ?? colors.textMuted }]} />
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.type}>{t(`notificationType.${n.type}`)}</Text>
                    <Text style={styles.time}>{formatDateTime(n.created_at)}</Text>
                  </View>
                  <Text style={styles.itemTitle}>{n.title}</Text>
                  {n.body ? <Text style={styles.itemBody}>{n.body}</Text> : null}
                  {!n.archived_at && (
                    <TouchableOpacity onPress={() => handleArchive(n.id)} style={styles.readBtn}>
                      <Text style={styles.readBtnText}>{t("varsler.read")}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 14 },
    tabRow: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 8, padding: 3, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
    tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
    tabBtnActive: { backgroundColor: colors.badgeBg },
    tabText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
    tabTextActive: { color: colors.primary },
    sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    sectionTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text },
    toggleText: { fontSize: 12, color: colors.primary, fontWeight: "600" },
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
    statusBadge: { alignSelf: "flex-start", borderRadius: 999, paddingVertical: 3, paddingHorizontal: 8, marginTop: 6 },
    statusText: { fontSize: 11, fontWeight: "600" },
    decisionBtn: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
    decisionBtnText: { fontSize: 11.5, fontWeight: "700", color: "#FFFFFF" },
    resolvedText: { fontSize: 11.5, color: colors.textMuted, alignSelf: "center" },
    notifRow: {
      flexDirection: "row",
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    type: { fontSize: 11, color: colors.textMuted, fontWeight: "600", textTransform: "uppercase" },
    time: { fontSize: 11, color: colors.textMuted },
    readBtn: { alignSelf: "flex-start", marginTop: 8 },
    readBtnText: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  });
}

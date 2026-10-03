import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, RefreshControl, StyleSheet } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { AppNotification, AuditLogEntry, IncidentEvent, Profile, Vehicle, vehicleLabel } from "../lib/types";
import { useLanguage } from "../lib/i18n/LanguageContext";

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const AUDIT_LOG_LIMIT = 50;

type Tab = "hendelser" | "service" | "endringslogg";

export default function VarslerScreen({
  userId,
  profile,
  onOpenEmployee,
}: {
  userId: string;
  profile: Profile | null;
  onOpenEmployee?: (employeeId: string) => void;
}) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = profile?.role === "admin";

  const [tab, setTab] = useState<Tab>("hendelser");
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [autoNotices, setAutoNotices] = useState<AppNotification[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [showResolved, setShowResolved] = useState(false);

  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([]);
  const [auditSearch, setAuditSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    let notificationQuery = supabase
      .from("notifications")
      .select("*")
      .eq("type", "service_paaminnelse")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!showArchived) notificationQuery = notificationQuery.is("archived_at", null);

    const autoNoticeQuery = supabase
      .from("notifications")
      .select("*")
      .eq("type", "auto_utstempling")
      .is("archived_at", null)
      .order("created_at", { ascending: false });

    let eventQuery = supabase.from("events").select("*").order("occurred_at", { ascending: false }).limit(50);
    if (!showResolved) eventQuery = eventQuery.eq("resolved", false);

    const [{ data: notifData }, { data: autoData }, { data: eventData }, { data: auditData }, { data: profileData }, { data: vehicleData }] = await Promise.all([
      notificationQuery,
      autoNoticeQuery,
      eventQuery,
      isAdmin
        ? supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(AUDIT_LOG_LIMIT)
        : Promise.resolve({ data: null }),
      supabase.from("profiles").select("*"),
      supabase.from("vehicles").select("*"),
    ]);

    if (notifData) setNotifications(notifData as AppNotification[]);
    if (autoData) setAutoNotices(autoData as AppNotification[]);
    if (eventData) setEvents(eventData as IncidentEvent[]);
    if (auditData) setAuditEntries(auditData as AuditLogEntry[]);
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
  }, [userId, isAdmin, showArchived, showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleArchive(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    setAutoNotices((prev) => prev.filter((n) => n.id !== id));
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

  function performedByFor(entry: AuditLogEntry) {
    return entry.actor_id ? profiles[entry.actor_id]?.full_name ?? t("varsler.unknown") : t("varsler.system");
  }

  const auditQuery = auditSearch.trim().toLowerCase();
  const filteredAuditEntries = auditQuery
    ? auditEntries.filter((entry) => {
        const haystack = [performedByFor(entry), t(`auditAction.${entry.action}`), entry.details, entry.reason]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(auditQuery);
      })
    : auditEntries;

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
        <TouchableOpacity onPress={() => setTab("hendelser")} style={[styles.tabBtn, tab === "hendelser" && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === "hendelser" && styles.tabTextActive]}>{t("varsler.tabHendelser")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setTab("service")} style={[styles.tabBtn, tab === "service" && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === "service" && styles.tabTextActive]}>{t("varsler.tabService")}</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity onPress={() => setTab("endringslogg")} style={[styles.tabBtn, tab === "endringslogg" && styles.tabBtnActive]}>
            <Text style={[styles.tabText, tab === "endringslogg" && styles.tabTextActive]}>{t("varsler.tabEndringslogg")}</Text>
          </TouchableOpacity>
        )}
      </View>

      {tab === "hendelser" ? (
        <View>
          {autoNotices.length > 0 && (
            <View style={{ marginBottom: 14 }}>
              <Text style={styles.sectionTitle}>{t("varsler.autoClockOutTitle")}</Text>
              <Text style={styles.autoHint}>{t("varsler.autoClockOutHint")}</Text>
              {autoNotices.map((n) => (
                <View key={n.id} style={styles.autoRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowTop}>
                      <Text style={[styles.itemTitle, { flex: 1 }]}>{n.title}</Text>
                      <Text style={styles.time}>{formatDateTime(n.created_at)}</Text>
                    </View>
                    {n.body ? <Text style={styles.itemBody}>{n.body}</Text> : null}
                    <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
                      {n.created_by && onOpenEmployee && (
                        <TouchableOpacity onPress={() => onOpenEmployee(n.created_by as string)}>
                          <Text style={styles.toggleText}>{t("varsler.openEmployee")} →</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={() => handleArchive(n.id)}>
                        <Text style={styles.autoArchiveText}>{t("varsler.read")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
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
      ) : tab === "service" ? (
        <View>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("varsler.tabService")}</Text>
            <TouchableOpacity onPress={() => setShowArchived((v) => !v)}>
              <Text style={styles.toggleText}>{showArchived ? t("varsler.hideArchived") : t("varsler.showArchivedAlso")}</Text>
            </TouchableOpacity>
          </View>
          {notifications.length === 0 ? (
            <Text style={styles.emptyText}>{t("varsler.noNotifications")}</Text>
          ) : (
            notifications.map((n) => (
              <View key={n.id} style={styles.notifRow}>
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
      ) : (
        <View>
          <TextInput
            style={styles.searchInput}
            value={auditSearch}
            onChangeText={setAuditSearch}
            placeholder={t("varsler.searchChangeLog")}
            placeholderTextColor={colors.textMuted}
          />
          {filteredAuditEntries.length === 0 ? (
            <Text style={styles.emptyText}>{auditQuery ? t("varsler.noChangeLogMatches") : t("varsler.noChanges")}</Text>
          ) : (
            filteredAuditEntries.map((entry) => (
              <View key={entry.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.itemTitle}>{t(`auditAction.${entry.action}`)}</Text>
                    <Text style={styles.time}>{formatDateTime(entry.created_at)}</Text>
                  </View>
                  <Text style={styles.itemBody}>{t("varsler.performedBy")}: {performedByFor(entry)}</Text>
                  {entry.details ? <Text style={styles.itemNote}>{entry.details}</Text> : null}
                  {entry.reason ? <Text style={styles.itemNote}>{t("varsler.reason")}: {entry.reason}</Text> : null}
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
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14,
      backgroundColor: colors.inputBg,
      color: colors.text,
      marginBottom: 10,
    },
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
    decisionBtn: { borderRadius: 6, paddingVertical: 6, paddingHorizontal: 10 },
    decisionBtnText: { fontSize: 11.5, fontWeight: "700", color: "#FFFFFF" },
    resolvedText: { fontSize: 11.5, color: colors.textMuted, alignSelf: "center" },
    autoHint: { fontSize: 11.5, color: colors.textMuted, marginBottom: 8 },
    autoArchiveText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
    autoRow: {
      flexDirection: "row",
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.warning,
    },
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
    rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    type: { fontSize: 11, color: colors.textMuted, fontWeight: "600", textTransform: "uppercase" },
    time: { fontSize: 11, color: colors.textMuted },
    readBtn: { alignSelf: "flex-start", marginTop: 8 },
    readBtnText: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  });
}

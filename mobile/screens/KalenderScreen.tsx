import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { monthLabels, toIsoDate, formatTime } from "../lib/calendar";
import { ABSENCE_TYPES, insertStaffAbsence, absenceErrorKey } from "../lib/absences";
import PickerField from "../components/PickerField";
import SearchPickerField from "../components/SearchPickerField";
import ReasonDialog from "../components/ReasonDialog";
import {
  ADMIN_ONLY_ABSENCE_TYPES,
  vehicleLabel,
  type Absence,
  type AbsenceType,
  type Department,
  type Profile,
  type Route,
  type RouteCancellation,
  type TimeEntry,
  type Vehicle,
  type VehicleServiceBooking,
} from "../lib/types";
import { useLanguage } from "../lib/i18n/LanguageContext";

// Speiler web sin kalenderside: "Fri" er grønn, innstilte ruter er grå.
const TYPE_DOT: Record<string, string> = {
  sykdom_egenmelding: "#F59E0B",
  sykdom_legemeldt: "#EF4444",
  sykt_barn: "#EC4899",
  ferie: "#0EA5E9",
  permisjon: "#A855F7",
  fri: "#22C55E",
};
const SERVICE_DOT = "#EA580C";
const CANCEL_DOT = "#64748B";
const ACTIVE_COLLAPSED_LIMIT = 5;

// Fyller hele feltet for fraværstypen med farge (ikke bare en prikk), slik
// at typen er synlig uten å måtte åpne redigeringen -- samme fargefamilie
// som TYPE_DOT, bare lysere bakgrunn/mørkere tekst for lesbarhet.
const TYPE_CHIP_BG: Record<string, string> = {
  sykdom_egenmelding: "#FEF3C7",
  sykdom_legemeldt: "#FEE2E2",
  sykt_barn: "#FCE7F3",
  ferie: "#E0F2FE",
  permisjon: "#F3E8FF",
  fri: "#DCFCE7",
};
const TYPE_CHIP_TEXT: Record<string, string> = {
  sykdom_egenmelding: "#92400E",
  sykdom_legemeldt: "#991B1B",
  sykt_barn: "#9D174D",
  ferie: "#075985",
  permisjon: "#6B21A8",
  fri: "#166534",
};

type AddMode = "fravaer" | "verksted" | "innstill" | null;

function toHHMM(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Mandag i uken til d, med klokkeslettet nullstilt.
function startOfWeek(d: Date) {
  const dayIndex = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayIndex);
}

function formatWeekRange(start: Date, end: Date, language: "no" | "en") {
  const months = monthLabels(language);
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}.–${end.getDate()}. ${months[end.getMonth()]} ${end.getFullYear()}`;
  }
  return `${start.getDate()}. ${months[start.getMonth()]} – ${end.getDate()}. ${months[end.getMonth()]} ${end.getFullYear()}`;
}

export default function KalenderScreen({ userId, profile }: { userId: string; profile: Profile | null }) {
  const { colors } = useTheme();
  const { language, t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = profile?.role === "admin";
  const isModerator = profile?.role === "moderator";
  const isStaff = isAdmin || isModerator;
  const availableAbsenceTypes = isAdmin ? ABSENCE_TYPES : ABSENCE_TYPES.filter((v) => !ADMIN_ONLY_ABSENCE_TYPES.includes(v));

  const now = new Date();
  const todayIso = toIsoDate(now);

  const [weekOffset, setWeekOffset] = useState(0);
  const monday = useMemo(() => {
    const base = startOfWeek(now);
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, todayIso]);
  const weekDays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [toIsoDate(monday)]
  );
  const gridStart = toIsoDate(weekDays[0]);
  const gridEnd = toIsoDate(weekDays[4]);

  function goToPrevWeek() {
    setWeekOffset((w) => w - 1);
  }

  function goToNextWeek() {
    setWeekOffset((w) => w + 1);
  }

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [activeEntries, setActiveEntries] = useState<TimeEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [serviceBookings, setServiceBookings] = useState<VehicleServiceBooking[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [routes, setRoutes] = useState<Record<string, Route>>({});
  const [routeCancellations, setRouteCancellations] = useState<RouteCancellation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeExpanded, setActiveExpanded] = useState(false);

  const [activeAddDayIso, setActiveAddDayIso] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [absenceEmployeeId, setAbsenceEmployeeId] = useState("");
  const [absenceType, setAbsenceType] = useState<AbsenceType>("sykdom_egenmelding");
  const [absenceEndDate, setAbsenceEndDate] = useState(new Date());
  const [absenceNote, setAbsenceNote] = useState("");
  const [serviceVehicleId, setServiceVehicleId] = useState("");
  const [serviceTime, setServiceTime] = useState(() => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    return d;
  });
  const [serviceNote, setServiceNote] = useState("");
  const [cancelRouteId, setCancelRouteId] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [pendingRemoveCancellationId, setPendingRemoveCancellationId] = useState<string | null>(null);

  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [editAbsenceType, setEditAbsenceType] = useState<AbsenceType>("sykdom_egenmelding");
  const [editAbsenceStartDate, setEditAbsenceStartDate] = useState(new Date());
  const [editAbsenceEndDate, setEditAbsenceEndDate] = useState(new Date());
  const [editAbsenceNote, setEditAbsenceNote] = useState("");
  const [editAbsenceError, setEditAbsenceError] = useState<string | null>(null);
  const [pendingSaveAbsenceId, setPendingSaveAbsenceId] = useState<string | null>(null);
  const [pendingDeleteAbsenceId, setPendingDeleteAbsenceId] = useState<string | null>(null);

  const loadActive = useCallback(async () => {
    const { data } = await supabase.from("time_entries").select("*").not("clock_in", "is", null).is("clock_out", null);
    if (data) setActiveEntries(data as TimeEntry[]);
  }, []);

  const load = useCallback(async () => {
    const [{ data: absenceData }, { data: profileData }, { data: deps }, { data: vehicleData }, { data: bookingData }, { data: routeData }, { data: cancellationData }] =
      await Promise.all([
        supabase.from("absences").select("*").lte("start_date", gridEnd).gte("end_date", gridStart).neq("status", "avslatt"),
        supabase.from("profiles").select("*").eq("is_employee", true),
        supabase.from("departments").select("*").order("name"),
        supabase.from("vehicles").select("*"),
        supabase.from("vehicle_service_bookings").select("*").lte("service_date", gridEnd).gte("service_date", gridStart),
        supabase.from("routes").select("*"),
        supabase.from("route_cancellations").select("*").lte("cancellation_date", gridEnd).gte("cancellation_date", gridStart),
      ]);

    if (absenceData) setAbsences(absenceData as Absence[]);
    if (profileData) {
      const map: Record<string, Profile> = {};
      for (const p of profileData as Profile[]) map[p.id] = p;
      setProfiles(map);
    }
    if (deps) setDepartments(deps as Department[]);
    if (vehicleData) {
      const map: Record<string, Vehicle> = {};
      for (const v of vehicleData as Vehicle[]) map[v.id] = v;
      setVehicles(map);
    }
    if (bookingData) setServiceBookings(bookingData as VehicleServiceBooking[]);
    if (routeData) {
      const map: Record<string, Route> = {};
      for (const r of routeData as Route[]) map[r.id] = r;
      setRoutes(map);
    }
    if (cancellationData) setRouteCancellations(cancellationData as RouteCancellation[]);
    await loadActive();
    setLoading(false);
    setRefreshing(false);
  }, [gridStart, gridEnd, loadActive]);

  useEffect(() => {
    load();
  }, [load]);

  // "Aktive nå" pr. innstemplinger -- oppdateres i sanntid via Supabase
  // Realtime, ikke bare ved manuell refresh.
  useEffect(() => {
    const channel = supabase
      .channel("kalender-active-entries")
      .on("postgres_changes", { event: "*", schema: "public", table: "time_entries" }, () => {
        loadActive();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadActive]);

  function absencesForDay(iso: string) {
    return absences.filter((a) => {
      if (a.start_date > iso || a.end_date < iso) return false;
      if (!departmentFilter) return true;
      return profiles[a.user_id]?.department_id === departmentFilter;
    });
  }

  function servicesForDay(iso: string) {
    return serviceBookings.filter((b) => {
      if (b.service_date !== iso) return false;
      if (!departmentFilter) return true;
      return vehicles[b.vehicle_id]?.department_id === departmentFilter;
    });
  }

  function cancellationsForDay(iso: string) {
    return routeCancellations.filter((c) => {
      if (c.cancellation_date !== iso) return false;
      if (!departmentFilter) return true;
      return routes[c.route_id]?.department_id === departmentFilter;
    });
  }

  const activeNow = activeEntries.filter((e) => {
    if (!departmentFilter) return true;
    return profiles[e.user_id]?.department_id === departmentFilter;
  });

  function toggleAddPanel(iso: string) {
    if (activeAddDayIso === iso) {
      setActiveAddDayIso(null);
      setAddMode(null);
      return;
    }
    setActiveAddDayIso(iso);
    setAddMode(null);
    setFormError(null);
    setAbsenceEmployeeId("");
    setAbsenceType("sykdom_egenmelding");
    setAbsenceEndDate(new Date(iso + "T00:00:00"));
    setAbsenceNote("");
    setServiceVehicleId("");
    const defaultTime = new Date();
    defaultTime.setHours(8, 0, 0, 0);
    setServiceTime(defaultTime);
    setServiceNote("");
    setCancelRouteId("");
    setCancelNote("");
  }

  async function handleAddAbsence() {
    if (!activeAddDayIso || !absenceEmployeeId) {
      setFormError(t("kalender.selectEmployeeError"));
      return;
    }
    const endIso = toIsoDate(absenceEndDate);
    if (endIso < activeAddDayIso) {
      setFormError(t("timer.toBeforeFromError"));
      return;
    }
    setSaving(true);
    setFormError(null);
    const { error } = await insertStaffAbsence({
      userId: absenceEmployeeId,
      type: absenceType,
      startDate: activeAddDayIso,
      endDate: endIso,
      note: absenceNote.trim() || null,
    });
    setSaving(false);

    if (error) {
      setFormError(t(absenceErrorKey(error, "kalender.addAbsenceFailed")));
      return;
    }

    setActiveAddDayIso(null);
    setAddMode(null);
    load();
  }

  async function handleAddService() {
    if (!activeAddDayIso || !serviceVehicleId) {
      setFormError(t("kalender.selectVehicleError"));
      return;
    }
    setSaving(true);
    setFormError(null);
    const { error } = await supabase.from("vehicle_service_bookings").insert({
      vehicle_id: serviceVehicleId,
      service_date: activeAddDayIso,
      service_time: toHHMM(serviceTime),
      note: serviceNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      setFormError(t("kalender.addServiceFailed"));
      return;
    }
    setActiveAddDayIso(null);
    setAddMode(null);
    load();
  }

  async function handleAddCancellation() {
    if (!activeAddDayIso || !cancelRouteId) {
      setFormError(t("kalender.selectRouteError"));
      return;
    }
    setSaving(true);
    setFormError(null);
    const { error } = await supabase.from("route_cancellations").insert({
      route_id: cancelRouteId,
      cancellation_date: activeAddDayIso,
      note: cancelNote.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      setFormError(t("kalender.addCancellationFailed"));
      return;
    }
    setActiveAddDayIso(null);
    setAddMode(null);
    load();
  }

  async function confirmRemoveCancellation() {
    const id = pendingRemoveCancellationId;
    setPendingRemoveCancellationId(null);
    if (!id) return;
    const { error } = await supabase.from("route_cancellations").delete().eq("id", id);
    if (!error) load();
  }

  function canManageAbsence(a: Absence) {
    return isAdmin || (isModerator && !ADMIN_ONLY_ABSENCE_TYPES.includes(a.type));
  }

  function startEditAbsence(a: Absence) {
    setEditingAbsenceId(a.id);
    setEditAbsenceType(a.type);
    setEditAbsenceStartDate(new Date(a.start_date + "T00:00:00"));
    setEditAbsenceEndDate(new Date(a.end_date + "T00:00:00"));
    setEditAbsenceNote(a.note ?? "");
    setEditAbsenceError(null);
  }

  function cancelEditAbsence() {
    setEditingAbsenceId(null);
    setEditAbsenceError(null);
  }

  function requestSaveEditAbsence() {
    if (toIsoDate(editAbsenceEndDate) < toIsoDate(editAbsenceStartDate)) {
      setEditAbsenceError(t("timer.toBeforeFromError"));
      return;
    }
    setEditAbsenceError(null);
    setPendingSaveAbsenceId(editingAbsenceId);
  }

  async function confirmSaveEditAbsence(reason: string) {
    const id = pendingSaveAbsenceId;
    setPendingSaveAbsenceId(null);
    if (!id) return;
    const original = absences.find((a) => a.id === id);
    const { error } = await supabase
      .from("absences")
      .update({
        type: editAbsenceType,
        start_date: toIsoDate(editAbsenceStartDate),
        end_date: toIsoDate(editAbsenceEndDate),
        note: editAbsenceNote.trim() || null,
      })
      .eq("id", id);
    if (error) {
      setEditAbsenceError(t("kalender.saveAbsenceFailed"));
      return;
    }
    await supabase.from("audit_log").insert({
      actor_id: userId,
      action: "absence.updated",
      target_type: "absences",
      target_id: id,
      reason: reason || null,
      details: `${profiles[original?.user_id ?? ""]?.full_name ?? "?"}: ${
        original ? t(`absenceType.${original.type}`) : "?"
      } (${original?.start_date}–${original?.end_date}) → ${t(`absenceType.${editAbsenceType}`)} (${toIsoDate(
        editAbsenceStartDate
      )}–${toIsoDate(editAbsenceEndDate)})`,
    });
    setEditingAbsenceId(null);
    load();
  }

  async function confirmDeleteAbsence(reason: string) {
    const id = pendingDeleteAbsenceId;
    setPendingDeleteAbsenceId(null);
    if (!id) return;
    const original = absences.find((a) => a.id === id);
    const { error } = await supabase.from("absences").delete().eq("id", id);
    if (error) return;
    await supabase.from("audit_log").insert({
      actor_id: userId,
      action: "absence.deleted",
      target_type: "absences",
      target_id: id,
      reason: reason || null,
      details: `${profiles[original?.user_id ?? ""]?.full_name ?? "?"}: ${
        original ? t(`absenceType.${original.type}`) : "?"
      } (${original?.start_date}–${original?.end_date})`,
    });
    load();
  }

  const employeesForFilter = departmentFilter
    ? Object.values(profiles).filter((p) => p.department_id === departmentFilter)
    : Object.values(profiles);
  const employeeLabel = (p: Profile) => {
    const dept = p.department_id ? departments.find((d) => d.id === p.department_id)?.name : null;
    return dept ? `${p.full_name} · ${dept}` : p.full_name;
  };
  const vehiclesForFilter = departmentFilter
    ? Object.values(vehicles).filter((v) => v.department_id === departmentFilter)
    : Object.values(vehicles);
  const routesForFilter = departmentFilter
    ? Object.values(routes).filter((r) => r.department_id === departmentFilter)
    : Object.values(routes);

  return (
    <>
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
        <Text style={styles.title}>{t("kalender.title")}</Text>
        <Text style={styles.subtitle}>{t("kalender.subtitle")}</Text>

        <View style={styles.weekNavRow}>
          <TouchableOpacity onPress={goToPrevWeek} style={styles.weekNavBtn}>
            <Text style={styles.weekNavBtnText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.weekRange}>{formatWeekRange(weekDays[0], weekDays[4], language)}</Text>
          <TouchableOpacity onPress={goToNextWeek} style={styles.weekNavBtn}>
            <Text style={styles.weekNavBtnText}>→</Text>
          </TouchableOpacity>
        </View>
        {weekOffset !== 0 && (
          <TouchableOpacity onPress={() => setWeekOffset(0)} style={styles.thisWeekLink}>
            <Text style={styles.thisWeekLinkText}>{t("kalender.thisWeek")}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.activeCard}>
          <View style={styles.activeHeaderRow}>
            <View style={styles.liveDot} />
            <Text style={styles.activeHeading}>{t("kalender.activeNow")}</Text>
            {activeNow.length > 0 && (
              <View style={styles.activeCountBadge}>
                <Text style={styles.activeCountText}>{activeNow.length}</Text>
              </View>
            )}
          </View>
          {activeNow.length === 0 ? (
            <Text style={styles.activeEmpty}>{t("kalender.noneActive")}</Text>
          ) : (
            <>
              {(activeExpanded ? activeNow : activeNow.slice(0, ACTIVE_COLLAPSED_LIMIT)).map((e) => (
                <View key={e.id} style={styles.activeRow}>
                  <View style={styles.liveDotSmall} />
                  <Text style={styles.activeName} numberOfLines={1}>
                    {profiles[e.user_id]?.full_name ?? "?"}
                  </Text>
                  <Text style={styles.activeTime}>{t("kalender.clockedInAt", { time: formatTime(e.clock_in!) })}</Text>
                </View>
              ))}
              {activeNow.length > ACTIVE_COLLAPSED_LIMIT && (
                <TouchableOpacity onPress={() => setActiveExpanded((v) => !v)} style={styles.activeToggle}>
                  <Text style={styles.activeToggleText}>
                    {activeExpanded
                      ? t("kalender.showFewer")
                      : t("kalender.showAllActive", { count: activeNow.length - ACTIVE_COLLAPSED_LIMIT })}
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {departments.length > 0 && (
          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() => setDepartmentFilter("")}
              style={[styles.chip, !departmentFilter && styles.chipActive]}
            >
              <Text style={[styles.chipText, !departmentFilter && styles.chipTextActive]}>{t("kalender.allDepartments")}</Text>
            </TouchableOpacity>
            {departments.map((d) => (
              <TouchableOpacity
                key={d.id}
                onPress={() => setDepartmentFilter(d.id)}
                style={[styles.chip, departmentFilter === d.id && styles.chipActive]}
              >
                <Text style={[styles.chipText, departmentFilter === d.id && styles.chipTextActive]}>{d.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? (
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        ) : (
          weekDays.map((date) => {
            const iso = toIsoDate(date);
            const dayAbsences = absencesForDay(iso);
            const dayServices = servicesForDay(iso);
            const dayCancellations = cancellationsForDay(iso);
            const dayActive = iso === todayIso ? activeNow : [];
            const hasContent = dayActive.length > 0 || dayAbsences.length > 0 || dayServices.length > 0 || dayCancellations.length > 0;
            const isToday = iso === todayIso;
            const isAdding = activeAddDayIso === iso;
            return (
              <View key={iso} style={[styles.dayCard, isToday && styles.dayCardToday]}>
                <Text style={[styles.dayCardTitle, isToday && styles.dayCardTitleToday]}>
                  {date.toLocaleDateString(language === "en" ? "en-GB" : "nb-NO", { weekday: "long", day: "numeric", month: "short" })}
                </Text>
                {!hasContent ? (
                  <Text style={styles.dayCardEmpty}>{t("kalender.noEntriesForDay")}</Text>
                ) : (
                  <View style={{ gap: 4 }}>
                    {dayActive.map((e) => (
                      <View key={`active-${e.id}`} style={styles.sectionRow}>
                        <View style={styles.liveDotSmall} />
                        <Text style={styles.sectionRowText}>{profiles[e.user_id]?.full_name ?? "?"}</Text>
                      </View>
                    ))}
                    {dayAbsences.map((a) =>
                      editingAbsenceId === a.id ? (
                        <View key={a.id} style={styles.editAbsenceCard}>
                          <Text style={styles.editAbsenceName}>{profiles[a.user_id]?.full_name ?? "?"}</Text>
                          <View style={styles.typeRow}>
                            {(isAdmin ? ABSENCE_TYPES : ABSENCE_TYPES.filter((v) => !ADMIN_ONLY_ABSENCE_TYPES.includes(v))).map((tp) => (
                              <TouchableOpacity
                                key={tp}
                                onPress={() => setEditAbsenceType(tp)}
                                style={[styles.typeChip, editAbsenceType === tp && styles.typeChipActive]}
                              >
                                <Text style={[styles.typeChipText, editAbsenceType === tp && styles.typeChipTextActive]}>
                                  {t(`absenceType.${tp}`)}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          <PickerField
                            label={t("fravaer.from")}
                            value={editAbsenceStartDate}
                            mode="date"
                            onChange={setEditAbsenceStartDate}
                          />
                          <PickerField
                            label={t("kalender.toDate")}
                            value={editAbsenceEndDate}
                            mode="date"
                            onChange={setEditAbsenceEndDate}
                          />
                          <TextInput
                            style={styles.input}
                            value={editAbsenceNote}
                            onChangeText={setEditAbsenceNote}
                            placeholder={t("timer.noteOptional")}
                            placeholderTextColor={colors.textMuted}
                          />
                          {editAbsenceError ? <Text style={styles.error}>{editAbsenceError}</Text> : null}
                          <View style={styles.editAbsenceButtonRow}>
                            <TouchableOpacity style={styles.editAbsenceCancelBtn} onPress={cancelEditAbsence}>
                              <Text style={styles.editAbsenceCancelText}>{t("common.cancel")}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.addSubmitBtn} onPress={requestSaveEditAbsence}>
                              <Text style={styles.addSubmitText}>{t("common.save")}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : (
                        <View key={a.id} style={styles.absenceRow}>
                          <View style={[styles.absenceChip, { backgroundColor: TYPE_CHIP_BG[a.type] ?? colors.card }]}>
                            <Text
                              style={[styles.absenceChipText, { color: TYPE_CHIP_TEXT[a.type] ?? colors.text }]}
                              numberOfLines={1}
                            >
                              {profiles[a.user_id]?.full_name ?? "?"} — {t(`absenceType.${a.type as AbsenceType}`)}
                            </Text>
                          </View>
                          {canManageAbsence(a) && (
                            <View style={styles.absenceActions}>
                              <TouchableOpacity onPress={() => startEditAbsence(a)}>
                                <Text style={styles.actionText}>{t("common.edit")}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setPendingDeleteAbsenceId(a.id)}>
                                <Text style={styles.actionTextDanger}>{t("common.delete")}</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )
                    )}
                    {dayServices.map((b) => (
                      <View key={b.id} style={styles.sectionRow}>
                        <View style={[styles.smallDot, { backgroundColor: SERVICE_DOT }]} />
                        <Text style={styles.sectionRowText}>
                          {vehicles[b.vehicle_id] ? vehicleLabel(vehicles[b.vehicle_id]) : "?"}
                          {b.note ? ` — ${b.note}` : ""}
                        </Text>
                      </View>
                    ))}
                    {dayCancellations.map((c) => (
                      <View key={c.id} style={styles.sectionRow}>
                        <View style={[styles.smallDot, { backgroundColor: CANCEL_DOT }]} />
                        <Text style={styles.sectionRowText}>
                          {routes[c.route_id]?.name ?? "?"}
                          {c.note ? ` — ${c.note}` : ""}
                        </Text>
                        {isStaff && (
                          <TouchableOpacity onPress={() => setPendingRemoveCancellationId(c.id)}>
                            <Text style={styles.removeText}>{t("common.delete")}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}

                {isStaff && (
                  <View style={styles.addSection}>
                    <TouchableOpacity onPress={() => toggleAddPanel(iso)}>
                      <Text style={styles.addToggleText}>{isAdding ? t("common.close") : `+ ${t("ansatte.add")}`}</Text>
                    </TouchableOpacity>

                    {isAdding && (
                      <View style={styles.addPanel}>
                        <View style={styles.addModeRow}>
                          <TouchableOpacity
                            onPress={() => setAddMode("fravaer")}
                            style={[styles.addModeBtn, addMode === "fravaer" && styles.addModeBtnActive]}
                          >
                            <Text style={[styles.addModeText, addMode === "fravaer" && styles.addModeTextActive]}>
                              {t("kalender.showAddAbsence")}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setAddMode("verksted")}
                            style={[styles.addModeBtn, addMode === "verksted" && styles.addModeBtnActive]}
                          >
                            <Text style={[styles.addModeText, addMode === "verksted" && styles.addModeTextActive]}>
                              {t("kalender.showAddService")}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => setAddMode("innstill")}
                            style={[styles.addModeBtn, addMode === "innstill" && styles.addModeBtnActive]}
                          >
                            <Text style={[styles.addModeText, addMode === "innstill" && styles.addModeTextActive]}>
                              {t("kalender.showAddCancellation")}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {addMode === "fravaer" && (
                          <View>
                            <SearchPickerField
                              label={t("ansatte.selectEmployee")}
                              placeholder={t("ansatte.selectEmployeePlaceholder")}
                              items={employeesForFilter.map((p) => ({ id: p.id, label: employeeLabel(p) }))}
                              value={absenceEmployeeId}
                              onChange={setAbsenceEmployeeId}
                            />
                            <Text style={styles.label}>{t("fravaer.type")}</Text>
                            <View style={styles.typeRow}>
                              {availableAbsenceTypes.map((tp) => (
                                <TouchableOpacity
                                  key={tp}
                                  onPress={() => setAbsenceType(tp)}
                                  style={[styles.typeChip, absenceType === tp && styles.typeChipActive]}
                                >
                                  <Text style={[styles.typeChipText, absenceType === tp && styles.typeChipTextActive]}>
                                    {t(`absenceType.${tp}`)}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                            <PickerField label={t("kalender.toDate")} value={absenceEndDate} mode="date" onChange={setAbsenceEndDate} />
                            <TextInput
                              style={styles.input}
                              value={absenceNote}
                              onChangeText={setAbsenceNote}
                              placeholder={t("timer.noteOptional")}
                              placeholderTextColor={colors.textMuted}
                            />
                            {formError ? <Text style={styles.error}>{formError}</Text> : null}
                            <TouchableOpacity
                              style={[styles.addSubmitBtn, saving && styles.buttonDisabled]}
                              onPress={handleAddAbsence}
                              disabled={saving}
                            >
                              <Text style={styles.addSubmitText}>{saving ? t("common.saving") : t("ansatte.add")}</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {addMode === "verksted" && (
                          <View>
                            <SearchPickerField
                              label={t("timer.vehicle")}
                              placeholder={t("timer.vehicleSelect")}
                              items={vehiclesForFilter.map((v) => ({ id: v.id, label: vehicleLabel(v) }))}
                              value={serviceVehicleId}
                              onChange={setServiceVehicleId}
                            />
                            <PickerField label={t("timer.fromTime")} value={serviceTime} mode="time" onChange={setServiceTime} />
                            <TextInput
                              style={styles.input}
                              value={serviceNote}
                              onChangeText={setServiceNote}
                              placeholder={t("timer.noteOptional")}
                              placeholderTextColor={colors.textMuted}
                            />
                            {formError ? <Text style={styles.error}>{formError}</Text> : null}
                            <TouchableOpacity
                              style={[styles.addSubmitBtn, saving && styles.buttonDisabled]}
                              onPress={handleAddService}
                              disabled={saving}
                            >
                              <Text style={styles.addSubmitText}>{saving ? t("common.saving") : t("ansatte.add")}</Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {addMode === "innstill" && (
                          <View>
                            <SearchPickerField
                              label={t("timer.route")}
                              placeholder={t("timer.routeSelect")}
                              items={routesForFilter.map((r) => ({ id: r.id, label: r.name }))}
                              value={cancelRouteId}
                              onChange={setCancelRouteId}
                            />
                            <TextInput
                              style={styles.input}
                              value={cancelNote}
                              onChangeText={setCancelNote}
                              placeholder={t("timer.noteOptional")}
                              placeholderTextColor={colors.textMuted}
                            />
                            {formError ? <Text style={styles.error}>{formError}</Text> : null}
                            <TouchableOpacity
                              style={[styles.addSubmitBtn, saving && styles.buttonDisabled]}
                              onPress={handleAddCancellation}
                              disabled={saving}
                            >
                              <Text style={styles.addSubmitText}>{saving ? t("common.saving") : t("ansatte.add")}</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {pendingRemoveCancellationId && (
        <ReasonDialog
          title={t("kalender.removeCancellationTitle")}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={confirmRemoveCancellation}
          onCancel={() => setPendingRemoveCancellationId(null)}
        />
      )}

      {pendingSaveAbsenceId && (
        <ReasonDialog
          title={t("kalender.saveAbsenceTitle")}
          confirmLabel={t("common.save")}
          requireReason
          onConfirm={confirmSaveEditAbsence}
          onCancel={() => setPendingSaveAbsenceId(null)}
        />
      )}

      {pendingDeleteAbsenceId && (
        <ReasonDialog
          title={t("kalender.deleteAbsenceTitle")}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={confirmDeleteAbsence}
          onCancel={() => setPendingDeleteAbsenceId(null)}
        />
      )}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    weekNavRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 8, marginBottom: 10 },
    weekNavBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
    weekNavBtnText: { fontSize: 14, color: colors.text },
    weekRange: { fontSize: 13, fontWeight: "600", color: colors.text, textTransform: "capitalize", width: 170, textAlign: "center" },
    thisWeekLink: { alignSelf: "center", marginTop: -6, marginBottom: 12 },
    thisWeekLinkText: { fontSize: 12, color: colors.primary, fontWeight: "700" },
    loadingText: { color: colors.textMuted, fontSize: 13, marginTop: 12 },
    activeCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    activeHeaderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    activeHeading: { fontSize: 13, fontWeight: "700", color: colors.text },
    activeCountBadge: {
      backgroundColor: colors.badgeBg,
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 1,
      marginLeft: 2,
    },
    activeCountText: { fontSize: 11, fontWeight: "700", color: colors.badgeText },
    activeToggle: { paddingVertical: 6, marginTop: 2 },
    activeToggleText: { fontSize: 12, color: colors.primary, fontWeight: "700" },
    activeEmpty: { fontSize: 12.5, color: colors.textMuted },
    activeRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
    activeName: { fontSize: 13, color: colors.text, flex: 1 },
    activeTime: { fontSize: 11.5, color: colors.textMuted },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#16A34A" },
    liveDotSmall: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16A34A" },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.text },
    chipTextActive: { color: colors.primaryText, fontWeight: "600" },
    dayCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    dayCardToday: { borderColor: colors.primary },
    dayCardTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text, textTransform: "capitalize", marginBottom: 6 },
    dayCardTitleToday: { color: colors.primary },
    dayCardEmpty: { fontSize: 12.5, color: colors.textMuted },
    sectionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
    sectionRowText: { fontSize: 13, color: colors.text, flex: 1 },
    smallDot: { width: 8, height: 8, borderRadius: 4 },
    removeText: { fontSize: 11, color: colors.textMuted },
    absenceRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 },
    absenceChip: { flex: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
    absenceChipText: { fontSize: 12.5, fontWeight: "600" },
    absenceActions: { flexDirection: "row", gap: 10, flexShrink: 0 },
    actionText: { fontSize: 11.5, color: colors.primary, fontWeight: "600" },
    actionTextDanger: { fontSize: 11.5, color: colors.danger, fontWeight: "600" },
    editAbsenceCard: { backgroundColor: colors.inputBg, borderRadius: 10, padding: 10, marginVertical: 4 },
    editAbsenceName: { fontSize: 12.5, fontWeight: "600", color: colors.text, marginBottom: 6 },
    editAbsenceButtonRow: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 10 },
    editAbsenceCancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
    editAbsenceCancelText: { fontSize: 13, color: colors.text },
    addSection: { marginTop: 10, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: 8 },
    addToggleText: { fontSize: 12.5, color: colors.primary, fontWeight: "700" },
    addPanel: { marginTop: 10 },
    addModeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
    addModeBtn: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    addModeBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    addModeText: { fontSize: 12, color: colors.text },
    addModeTextActive: { color: colors.primaryText, fontWeight: "600" },
    label: { fontSize: 12.5, color: colors.textMuted, marginBottom: 6, marginTop: 10 },
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
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14.5,
      backgroundColor: colors.inputBg,
      color: colors.text,
      marginTop: 4,
    },
    error: { color: colors.danger, fontSize: 13, marginTop: 10 },
    addSubmitBtn: { backgroundColor: colors.primary, borderRadius: 8, padding: 10, alignItems: "center", marginTop: 12 },
    buttonDisabled: { opacity: 0.6 },
    addSubmitText: { color: colors.primaryText, fontSize: 13.5, fontWeight: "600" },
  });
}

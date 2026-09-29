import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  RefreshControl,
} from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import PickerField from "../components/PickerField";
import SearchPickerField from "../components/SearchPickerField";
import ReasonDialog from "../components/ReasonDialog";
import { Department, Profile, Route, TimeEntry, Vehicle, VehicleServiceBooking, vehicleLabel } from "../lib/types";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { isBusinessDay, toIsoDate } from "../lib/calendar";
import { timeEntryErrorKey } from "../lib/absences";

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function startOfWeekIso() {
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek);
  return toIsoDate(monday);
}

function startOfMonthIso() {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

type Mode = "punch" | "times";

const PAGE_SIZE = 10;

export default function HomeScreen({ userId, profile }: { userId: string; profile: Profile | null }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [hasMoreEntries, setHasMoreEntries] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [weekTotal, setWeekTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [openPunch, setOpenPunch] = useState<TimeEntry | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [todaysServiceBookings, setTodaysServiceBookings] = useState<VehicleServiceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("punch");
  const [entryDate, setEntryDate] = useState(new Date());
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  });
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setHours(15, 0, 0, 0);
    return d;
  });
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState(() => {
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  });
  const [editEndTime, setEditEndTime] = useState(() => {
    const d = new Date();
    d.setHours(15, 0, 0, 0);
    return d;
  });
  const [editDescription, setEditDescription] = useState("");
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const myDepartmentId = profile?.department_id ?? null;
  const isSjafor = profile?.role === "sjafor";
  const todayIsBusinessDay = isBusinessDay(new Date());

  const loadEntries = useCallback(async () => {
    const monthStart = startOfMonthIso();
    const weekStart = startOfWeekIso();

    const [{ data: page }, { data: monthData }, { data: deps }, { data: rts }, { data: vhs }, { data: bookingData }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(0, PAGE_SIZE),
      supabase.from("time_entries").select("entry_date, hours").eq("user_id", userId).gte("entry_date", monthStart),
      supabase.from("departments").select("*").order("name"),
      supabase.from("routes").select("*").order("name"),
      supabase.from("vehicles").select("*").order("name"),
      supabase.from("vehicle_service_bookings").select("*").eq("service_date", toIsoDate(new Date())),
    ]);
    if (page) {
      setEntries(page.slice(0, PAGE_SIZE) as TimeEntry[]);
      setHasMoreEntries(page.length > PAGE_SIZE);
      setOpenPunch((page as TimeEntry[]).find((e) => e.clock_in && !e.clock_out) ?? null);
    }
    if (monthData) {
      let week = 0;
      let month = 0;
      for (const e of monthData as { entry_date: string; hours: number | null }[]) {
        const h = Number(e.hours ?? 0);
        month += h;
        if (e.entry_date >= weekStart) week += h;
      }
      setWeekTotal(week);
      setMonthTotal(month);
    }
    if (deps) setDepartments(deps as Department[]);
    if (rts) setRoutes(rts as Route[]);
    if (vhs) setVehicles(vhs as Vehicle[]);
    if (bookingData) setTodaysServiceBookings(bookingData as VehicleServiceBooking[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function loadMoreEntries() {
    if (loadingMore || !hasMoreEntries) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from("time_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(entries.length, entries.length + PAGE_SIZE);
    setLoadingMore(false);
    if (data) {
      setEntries((prev) => [...prev, ...(data.slice(0, PAGE_SIZE) as TimeEntry[])]);
      setHasMoreEntries(data.length > PAGE_SIZE);
    }
  }

  useEffect(() => {
    if (myDepartmentId) setDepartmentId(myDepartmentId);
  }, [myDepartmentId]);

  async function handleClockIn() {
    setError(null);
    if (!routeId) {
      setError(t("timer.selectRouteError"));
      return;
    }
    if (!vehicleId) {
      setError(t("timer.selectVehicleError"));
      return;
    }

    const { data: inUse } = await supabase.rpc("vehicle_is_in_use", { p_vehicle_id: vehicleId });
    if (inUse) {
      setError(t("timer.vehicleInUseError"));
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("time_entries").insert({
      user_id: userId,
      entry_date: toIsoDate(new Date()),
      clock_in: new Date().toISOString(),
      department_id: departmentId || null,
      route_id: routeId || null,
      vehicle_id: vehicleId || null,
      description: description.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(t(timeEntryErrorKey(error, error.code === "23505" ? "timer.vehicleInUseError" : "timer.clockInFailed")));
      return;
    }
    setDescription("");
    loadEntries();
  }

  async function handleClockOut() {
    if (!openPunch) return;
    setError(null);
    setSaving(true);
    const { error } = await supabase
      .from("time_entries")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", openPunch.id);
    setSaving(false);
    if (error) {
      setError(t("timer.clockOutFailed"));
      return;
    }
    loadEntries();
  }

  async function handleManualSubmit() {
    setError(null);

    const base: Record<string, unknown> = {
      user_id: userId,
      entry_date: toIsoDate(entryDate),
      department_id: departmentId || null,
      route_id: routeId || null,
      vehicle_id: vehicleId || null,
      description: description.trim() || null,
    };

    const clockIn = new Date(entryDate);
    clockIn.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    const clockOut = new Date(entryDate);
    clockOut.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    if (clockOut <= clockIn) {
      setError(t("timer.toBeforeFromError"));
      return;
    }
    base.clock_in = clockIn.toISOString();
    base.clock_out = clockOut.toISOString();

    setSaving(true);
    const { error } = await supabase.from("time_entries").insert(base);
    setSaving(false);
    if (error) {
      setError(
        t(timeEntryErrorKey(error, error.message.includes("row-level security") ? "timer.threeDayLimitError" : "timer.saveEntryFailed"))
      );
      return;
    }
    setDescription("");
    loadEntries();
  }

  function startEdit(entry: TimeEntry) {
    setEditingId(entry.id);
    if (entry.clock_in && entry.clock_out) {
      setEditStartTime(new Date(entry.clock_in));
      setEditEndTime(new Date(entry.clock_out));
    } else {
      // Eldre registrering korrigert før klokkeslett-basert redigering -- sett
      // et fornuftig utgangspunkt basert på timetallet.
      const start = new Date();
      start.setHours(7, 0, 0, 0);
      const end = new Date(start.getTime() + Math.round(Number(entry.hours ?? 0) * 60) * 60000);
      setEditStartTime(start);
      setEditEndTime(end);
    }
    setEditDescription(entry.description ?? "");
  }

  async function logCorrection(entryId: string, action: "time_entry.corrected" | "time_entry.deleted", reason: string, details: string) {
    await supabase.from("audit_log").insert({
      actor_id: userId,
      action,
      target_type: "time_entries",
      target_id: entryId,
      reason: reason || null,
      details,
    });
  }

  async function confirmSaveEdit(reason: string) {
    const id = pendingSaveId;
    setPendingSaveId(null);
    if (!id) return;

    const original = entries.find((e) => e.id === id);
    if (!original) return;

    const entryDay = new Date(original.entry_date + "T00:00:00");
    const clockIn = new Date(entryDay);
    clockIn.setHours(editStartTime.getHours(), editStartTime.getMinutes(), 0, 0);
    const clockOut = new Date(entryDay);
    clockOut.setHours(editEndTime.getHours(), editEndTime.getMinutes(), 0, 0);
    if (clockOut <= clockIn) {
      setError(t("timer.toBeforeFromError"));
      return;
    }

    // Sjåfør kan ikke endre klokke inn-tidspunktet -- feltet sendes derfor
    // ikke med i det hele tatt, så den originale (fullpresise) verdien i
    // databasen forblir uendret. Håndheves også av trg_prevent_sjafor_clock_in_edit.
    const updatePayload: Record<string, unknown> = {
      clock_out: clockOut.toISOString(),
      description: editDescription.trim() || null,
    };
    if (!isSjafor) {
      updatePayload.clock_in = clockIn.toISOString();
    }

    const { error } = await supabase.from("time_entries").update(updatePayload).eq("id", id);

    if (error) {
      setError(t(timeEntryErrorKey(error, "timer.saveEditFailed")));
      return;
    }

    const oldTimes = original.clock_in && original.clock_out
      ? `${formatTime(original.clock_in)}–${formatTime(original.clock_out)}`
      : `${original.hours ?? "?"} t`;
    const newTimes = `${formatTime(clockIn.toISOString())}–${formatTime(clockOut.toISOString())}`;
    await logCorrection(id, "time_entry.corrected", reason, `Klokkeslett endret fra ${oldTimes} til ${newTimes}`);
    setEditingId(null);
    loadEntries();
  }

  async function confirmDelete(reason: string) {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;

    const original = entries.find((e) => e.id === id);
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) {
      setError(t("timer.deleteFailed"));
      return;
    }

    await logCorrection(id, "time_entry.deleted", reason, `Slettet registrering på ${original?.entry_date} (${original?.hours ?? "?"} t)`);
    loadEntries();
  }

  const routesForDepartment = departmentId ? routes.filter((r) => r.department_id === departmentId) : routes;
  const vehiclesForDepartment = departmentId ? vehicles.filter((v) => v.department_id === departmentId) : vehicles;
  const vehicleServiceToday = vehicleId ? todaysServiceBookings.find((b) => b.vehicle_id === vehicleId) : undefined;

  return (
    <>
    <FlatList
      style={styles.wrap}
      data={entries}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadEntries();
          }}
        />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>{t("timer.title")}</Text>
          <Text style={styles.subtitle}>
            {t("timer.weekAndMonth", { week: weekTotal.toFixed(1), month: monthTotal.toFixed(1) })}
          </Text>

          <View style={styles.card}>
            {myDepartmentId ? (
              <Text style={styles.lockedDepartment}>
                {departments.find((d) => d.id === myDepartmentId)?.name ?? "…"}
              </Text>
            ) : (
              departments.length > 0 && (
                <View style={styles.chipRow}>
                  {departments.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => {
                        setDepartmentId(departmentId === d.id ? "" : d.id);
                        setRouteId("");
                        setVehicleId("");
                      }}
                      style={[styles.chip, departmentId === d.id && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, departmentId === d.id && styles.chipTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )
            )}
            {routesForDepartment.length > 0 && (
              <SearchPickerField
                label={t("timer.route")}
                placeholder={t("timer.routeSelect")}
                items={routesForDepartment.map((r) => ({ id: r.id, label: r.name }))}
                value={routeId}
                onChange={setRouteId}
              />
            )}
            {vehiclesForDepartment.length > 0 && (
              <SearchPickerField
                label={mode === "punch" || isSjafor ? t("timer.vehicle") : t("timer.vehicleOptional")}
                placeholder={t("timer.vehicleSelect")}
                items={vehiclesForDepartment.map((v) => ({ id: v.id, label: vehicleLabel(v) }))}
                value={vehicleId}
                onChange={setVehicleId}
              />
            )}
            {vehicleServiceToday && (
              <Text style={styles.serviceWarning}>
                {t("timer.vehicleServiceWarning")}
                {vehicleServiceToday.service_time
                  ? ` ${t("timer.vehicleServiceWarningTime", { time: vehicleServiceToday.service_time.slice(0, 5) })}`
                  : ""}
                {vehicleServiceToday.note ? `: ${vehicleServiceToday.note}` : ""}
              </Text>
            )}

            {isSjafor ? (
              <View style={styles.punchSpacer} />
            ) : (
              <View style={styles.modeRow}>
                <TouchableOpacity
                  onPress={() => setMode("punch")}
                  style={[styles.modeBtn, mode === "punch" && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeText, mode === "punch" && styles.modeTextActive]}>{t("timer.modePunch")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setMode("times")}
                  style={[styles.modeBtn, mode === "times" && styles.modeBtnActive]}
                >
                  <Text style={[styles.modeText, mode === "times" && styles.modeTextActive]}>{t("timer.modeTimes")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {mode === "punch" || isSjafor ? (
              openPunch ? (
                <View style={{ alignItems: "center" }}>
                  <Text style={styles.punchText}>{t("timer.clockedInAt", { time: formatTime(openPunch.clock_in!) })}</Text>
                  <TouchableOpacity
                    style={[styles.button, saving && styles.buttonDisabled]}
                    onPress={handleClockOut}
                    disabled={saving}
                  >
                    <Text style={styles.buttonText}>{saving ? "…" : t("timer.clockOut")}</Text>
                  </TouchableOpacity>
                </View>
              ) : isSjafor && !todayIsBusinessDay ? (
                <Text style={styles.hint}>{t("timer.closedForBusinessDay")}</Text>
              ) : (
                <View>
                  <TextInput
                    style={styles.input}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={t("timer.noteOptional")}
                    placeholderTextColor={colors.textMuted}
                  />
                  <TouchableOpacity
                    style={[styles.button, (saving || !routeId || !vehicleId) && styles.buttonDisabled]}
                    onPress={handleClockIn}
                    disabled={saving || !routeId || !vehicleId}
                  >
                    <Text style={styles.buttonText}>{saving ? "…" : t("timer.clockIn")}</Text>
                  </TouchableOpacity>
                  {!routeId ? (
                    <Text style={styles.hint}>{t("timer.selectRouteHint")}</Text>
                  ) : !vehicleId ? (
                    <Text style={styles.hint}>{t("timer.selectVehicleHint")}</Text>
                  ) : null}
                </View>
              )
            ) : (
              <View>
                <PickerField label={t("timer.date")} value={entryDate} mode="date" onChange={setEntryDate} />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <PickerField label={t("timer.fromTime")} value={startTime} mode="time" onChange={setStartTime} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PickerField label={t("timer.toTime")} value={endTime} mode="time" onChange={setEndTime} />
                  </View>
                </View>
                <Text style={styles.label}>{t("timer.noteOptional")}</Text>
                <TextInput
                  style={styles.input}
                  value={description}
                  onChangeText={setDescription}
                  placeholderTextColor={colors.textMuted}
                />
                <TouchableOpacity
                  style={[styles.button, saving && styles.buttonDisabled]}
                  onPress={handleManualSubmit}
                  disabled={saving}
                >
                  <Text style={styles.buttonText}>{saving ? t("common.saving") : t("timer.register")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <Text style={styles.sectionTitle}>{t("timer.latestEntries")}</Text>
        </View>
      }
      renderItem={({ item }) =>
        editingId === item.id ? (
          <View style={[styles.entryRow, styles.entryRowEditing]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryDate}>{formatDate(item.entry_date)}</Text>
              <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                <View style={{ flex: 1 }}>
                  {isSjafor ? (
                    <>
                      <Text style={styles.label}>{t("timer.fromTime")}</Text>
                      <Text style={styles.lockedTime}>
                        {editStartTime.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </>
                  ) : (
                    <PickerField label={t("timer.fromTime")} value={editStartTime} mode="time" onChange={setEditStartTime} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <PickerField label={t("timer.toTime")} value={editEndTime} mode="time" onChange={setEditEndTime} />
                </View>
              </View>
              <TextInput
                style={[styles.input, { marginTop: 6 }]}
                value={editDescription}
                onChangeText={setEditDescription}
                placeholder={t("timer.noteOptional")}
                placeholderTextColor={colors.textMuted}
              />
              <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                <TouchableOpacity onPress={() => setPendingSaveId(item.id)}>
                  <Text style={styles.saveText}>{t("common.save")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditingId(null)}>
                  <Text style={styles.deleteText}>{t("common.cancel")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.entryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryDate}>{formatDate(item.entry_date)}</Text>
              {item.vehicle_id ? (
                <Text style={styles.entryDesc}>
                  {vehicleLabel(vehicles.find((v) => v.id === item.vehicle_id) ?? { name: "—", make: null })}
                </Text>
              ) : null}
              {item.description ? <Text style={styles.entryDesc}>{item.description}</Text> : null}
            </View>
            <Text style={styles.entryHours}>
              {item.hours != null ? `${Number(item.hours).toFixed(1)} ${t("timer.hours")}` : t("timer.inProgress")}
            </Text>
            {item.hours != null && (
              <TouchableOpacity onPress={() => startEdit(item)} style={styles.deleteBtn}>
                <Text style={styles.deleteText}>{t("common.edit")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setPendingDeleteId(item.id)} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>{t("common.delete")}</Text>
            </TouchableOpacity>
          </View>
        )
      }
      ListEmptyComponent={
        !loading ? <Text style={styles.emptyText}>{t("timer.noEntries")}</Text> : null
      }
      ListFooterComponent={
        hasMoreEntries ? (
          <TouchableOpacity onPress={loadMoreEntries} disabled={loadingMore} style={styles.loadMoreBtn}>
            <Text style={styles.loadMoreText}>{loadingMore ? t("common.loading") : t("timer.loadMore")}</Text>
          </TouchableOpacity>
        ) : null
      }
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    />

    {pendingSaveId && (
      <ReasonDialog
        title={t("timer.saveCorrectionTitle")}
        message={t("timer.saveCorrectionMessage")}
        confirmLabel={t("timer.saveCorrectionConfirm")}
        requireReason
        onConfirm={confirmSaveEdit}
        onCancel={() => setPendingSaveId(null)}
      />
    )}

    {pendingDeleteId && (
      <ReasonDialog
        title={t("timer.deleteEntryTitle")}
        message={t("timer.deleteEntryMessage")}
        confirmLabel={t("common.delete")}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
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
    label: { fontSize: 12.5, color: colors.textMuted, marginBottom: 6, marginTop: 10 },
    lockedTime: {
      fontSize: 14.5,
      color: colors.textMuted,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14.5,
      backgroundColor: colors.inputBg,
      color: colors.text,
      marginBottom: 8,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 12,
      marginRight: 6,
      marginBottom: 6,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, color: colors.text },
    chipTextActive: { color: colors.primaryText },
    lockedDepartment: {
      fontSize: 13,
      color: colors.textMuted,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 8,
      alignSelf: "flex-start",
    },
    modeRow: { flexDirection: "row", backgroundColor: colors.background, borderRadius: 8, padding: 3, marginBottom: 12 },
    punchSpacer: { marginBottom: 12 },
    modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
    modeBtnActive: { backgroundColor: colors.card },
    modeText: { fontSize: 12.5, color: colors.textMuted, fontWeight: "600" },
    modeTextActive: { color: colors.primary },
    punchText: { fontSize: 14, color: colors.text, marginBottom: 12 },
    serviceWarning: {
      fontSize: 12,
      color: "#92400e",
      backgroundColor: "#fffbeb",
      borderWidth: 1,
      borderColor: "#fcd34d",
      borderRadius: 8,
      padding: 8,
      marginBottom: 10,
    },
    hint: { fontSize: 11.5, color: colors.textMuted, marginTop: 8, textAlign: "center" },
    error: { color: colors.danger, fontSize: 13, marginTop: 10 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 14,
      alignItems: "center",
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
    entryRowEditing: { backgroundColor: colors.background },
    entryDate: { fontSize: 13.5, color: colors.text, textTransform: "capitalize" },
    entryDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    entryHours: { fontSize: 14, fontWeight: "600", color: colors.text, marginRight: 10 },
    deleteBtn: { padding: 4, marginLeft: 8 },
    deleteText: { fontSize: 11.5, color: colors.textMuted },
    saveText: { fontSize: 12.5, color: colors.primary, fontWeight: "700" },
    emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 20, fontSize: 13 },
    loadMoreBtn: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
    loadMoreText: { fontSize: 13, color: colors.primary, fontWeight: "600" },
  });
}

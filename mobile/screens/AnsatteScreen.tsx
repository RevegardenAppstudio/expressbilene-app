import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, RefreshControl } from "react-native";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import PickerField from "../components/PickerField";
import SearchPickerField from "../components/SearchPickerField";
import ReasonDialog from "../components/ReasonDialog";
import { AbsenceType, ADMIN_ONLY_ABSENCE_TYPES, Absence, Department, Profile, Route, TimeEntry, Vehicle, vehicleLabel } from "../lib/types";
import { toIsoDate, formatTime } from "../lib/calendar";
import { ABSENCE_TYPES, insertStaffAbsence, absenceErrorKey, timeEntryErrorKey } from "../lib/absences";
import { useLanguage } from "../lib/i18n/LanguageContext";

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

type Mode = "timer" | "fravaer";
type PendingDelete = { id: string; kind: "timer" | "fravaer" };

export default function AnsatteScreen({
  userId,
  profile,
  initialEmployeeId = "",
}: {
  userId: string;
  profile: Profile | null;
  initialEmployeeId?: string;
}) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isAdmin = profile?.role === "admin";
  const availableAbsenceTypes = isAdmin ? ABSENCE_TYPES : ABSENCE_TYPES.filter((v) => !ADMIN_ONLY_ABSENCE_TYPES.includes(v));

  const [employees, setEmployees] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(initialEmployeeId);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEmployee, setLoadingEmployee] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [mode, setMode] = useState<Mode>("timer");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
  const [routeId, setRouteId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [note, setNote] = useState("");

  const [absenceType, setAbsenceType] = useState<AbsenceType>("sykdom_egenmelding");
  const [absenceStart, setAbsenceStart] = useState(new Date());
  const [absenceEnd, setAbsenceEnd] = useState(new Date());
  const [absenceNote, setAbsenceNote] = useState("");

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
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
  const [pendingSaveEntryId, setPendingSaveEntryId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const loadEmployees = useCallback(async () => {
    const [{ data }, { data: deps }, { data: rts }, { data: vhs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("is_employee", true).order("full_name"),
      supabase.from("departments").select("*").order("name"),
      supabase.from("routes").select("*").order("name"),
      supabase.from("vehicles").select("*").order("name"),
    ]);
    if (data) setEmployees(data as Profile[]);
    if (deps) setDepartments(deps as Department[]);
    if (rts) setRoutes(rts as Route[]);
    if (vhs) setVehicles(vhs as Vehicle[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const loadForEmployee = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setEntries([]);
      setAbsences([]);
      return;
    }
    setLoadingEmployee(true);
    const [{ data: entryData }, { data: absenceData }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", employeeId)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(20),
      supabase.from("absences").select("*").eq("user_id", employeeId).order("start_date", { ascending: false }).limit(20),
    ]);
    if (entryData) setEntries(entryData as TimeEntry[]);
    if (absenceData) setAbsences(absenceData as Absence[]);
    setLoadingEmployee(false);
  }, []);

  useEffect(() => {
    loadForEmployee(selectedEmployeeId);
  }, [selectedEmployeeId, loadForEmployee]);

  async function logAction(action: string, targetType: string, targetId: string, reason: string, details: string) {
    await supabase.from("audit_log").insert({
      actor_id: userId,
      action,
      target_type: targetType,
      target_id: targetId,
      reason: reason || null,
      details,
    });
  }

  async function handleAddTimeEntry() {
    setFormError(null);
    const clockIn = new Date(entryDate);
    clockIn.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    const clockOut = new Date(entryDate);
    clockOut.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    if (clockOut <= clockIn) {
      setFormError(t("timer.toBeforeFromError"));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("time_entries").insert({
      user_id: selectedEmployeeId,
      entry_date: toIsoDate(entryDate),
      clock_in: clockIn.toISOString(),
      clock_out: clockOut.toISOString(),
      route_id: routeId || null,
      vehicle_id: vehicleId || null,
      description: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      setFormError(t(timeEntryErrorKey(error, "ansatte.addTimeFailed")));
      return;
    }
    setNote("");
    setRouteId("");
    setVehicleId("");
    loadForEmployee(selectedEmployeeId);
  }

  async function handleAddAbsence() {
    setFormError(null);
    if (toIsoDate(absenceEnd) < toIsoDate(absenceStart)) {
      setFormError(t("fravaer.endBeforeStartError"));
      return;
    }
    setSaving(true);
    const { error } = await insertStaffAbsence({
      userId: selectedEmployeeId,
      type: absenceType,
      startDate: toIsoDate(absenceStart),
      endDate: toIsoDate(absenceEnd),
      note: absenceNote.trim() || null,
    });
    setSaving(false);

    if (error) {
      setFormError(t(absenceErrorKey(error, "ansatte.addAbsenceFailed")));
      return;
    }

    setAbsenceNote("");
    loadForEmployee(selectedEmployeeId);
  }

  function startEditEntry(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    if (entry.clock_in && entry.clock_out) {
      setEditStartTime(new Date(entry.clock_in));
      setEditEndTime(new Date(entry.clock_out));
    } else {
      const start = new Date();
      start.setHours(7, 0, 0, 0);
      const end = new Date(start.getTime() + Math.round(Number(entry.hours ?? 0) * 60) * 60000);
      setEditStartTime(start);
      setEditEndTime(end);
    }
    setEditDescription(entry.description ?? "");
  }

  async function confirmSaveEntry(reason: string) {
    const id = pendingSaveEntryId;
    setPendingSaveEntryId(null);
    if (!id) return;
    const original = entries.find((e) => e.id === id);
    if (!original) return;

    const entryDay = new Date(original.entry_date + "T00:00:00");
    const clockIn = new Date(entryDay);
    clockIn.setHours(editStartTime.getHours(), editStartTime.getMinutes(), 0, 0);
    const clockOut = new Date(entryDay);
    clockOut.setHours(editEndTime.getHours(), editEndTime.getMinutes(), 0, 0);
    if (clockOut <= clockIn) {
      setFormError(t("timer.toBeforeFromError"));
      return;
    }

    const { error } = await supabase
      .from("time_entries")
      .update({
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        description: editDescription.trim() || null,
      })
      .eq("id", id);

    if (error) {
      setFormError(t(timeEntryErrorKey(error, "ansatte.saveEntryFailed")));
      return;
    }

    const oldTimes =
      original.clock_in && original.clock_out
        ? `${formatTime(original.clock_in)}–${formatTime(original.clock_out)}`
        : `${original.hours ?? "?"} t`;
    const newTimes = `${formatTime(clockIn.toISOString())}–${formatTime(clockOut.toISOString())}`;
    await logAction("time_entry.corrected", "time_entries", id, reason, `Klokkeslett endret fra ${oldTimes} til ${newTimes}`);
    setEditingEntryId(null);
    loadForEmployee(selectedEmployeeId);
  }

  async function confirmDelete(reason: string) {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    if (target.kind === "timer") {
      const original = entries.find((e) => e.id === target.id);
      const { error } = await supabase.from("time_entries").delete().eq("id", target.id);
      if (error) {
        setFormError(t("ansatte.deleteEntryFailed"));
        return;
      }
      await logAction(
        "time_entry.deleted",
        "time_entries",
        target.id,
        reason,
        `Slettet registrering på ${original?.entry_date} (${original?.hours ?? "?"} t)`
      );
    } else {
      const original = absences.find((a) => a.id === target.id);
      const { error } = await supabase.from("absences").delete().eq("id", target.id);
      if (error) {
        setFormError(t("ansatte.deleteAbsenceFailed"));
        return;
      }
      await logAction(
        "absence.deleted",
        "absences",
        target.id,
        reason,
        `Slettet ${original ? t(`absenceType.${original.type}`) : "fravær"} på ${original?.start_date}`
      );
    }
    loadForEmployee(selectedEmployeeId);
  }

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) ?? null;
  const routesForEmployee = selectedEmployee?.department_id ? routes.filter((r) => r.department_id === selectedEmployee.department_id) : routes;
  const vehiclesForEmployee = selectedEmployee?.department_id
    ? vehicles.filter((v) => v.department_id === selectedEmployee.department_id)
    : vehicles;

  function departmentName(departmentId: string | null) {
    return departmentId ? departments.find((d) => d.id === departmentId)?.name ?? null : null;
  }

  const employeeLabel = (e: Profile) => {
    const dept = departmentName(e.department_id);
    return dept ? `${e.full_name} · ${dept}` : e.full_name;
  };

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
              loadEmployees();
              if (selectedEmployeeId) loadForEmployee(selectedEmployeeId);
            }}
          />
        }
      >
        <Text style={styles.title}>{t("ansatte.title")}</Text>
        <Text style={styles.subtitle}>{t("ansatte.subtitle")}</Text>

        {!loading && !selectedEmployeeId && (
          <SearchPickerField
            label={t("ansatte.selectEmployee")}
            placeholder={t("ansatte.selectEmployeePlaceholder")}
            items={employees.map((e) => ({ id: e.id, label: employeeLabel(e) }))}
            value={selectedEmployeeId}
            onChange={setSelectedEmployeeId}
          />
        )}

        {!selectedEmployeeId ? (
          <Text style={styles.hint}>{t("ansatte.selectEmployeeHint")}</Text>
        ) : (
          <>
            <View style={styles.selectedEmployeeRow}>
              <Text style={styles.selectedEmployeeName} numberOfLines={1}>
                {selectedEmployee ? employeeLabel(selectedEmployee) : ""}
              </Text>
              <TouchableOpacity onPress={() => setSelectedEmployeeId("")}>
                <Text style={styles.changeEmployeeText}>{t("ansatte.changeEmployee")}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modeRow}>
              <TouchableOpacity onPress={() => setMode("timer")} style={[styles.modeBtn, mode === "timer" && styles.modeBtnActive]}>
                <Text style={[styles.modeText, mode === "timer" && styles.modeTextActive]}>{t("tabs.home")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode("fravaer")} style={[styles.modeBtn, mode === "fravaer" && styles.modeBtnActive]}>
                <Text style={[styles.modeText, mode === "fravaer" && styles.modeTextActive]}>{t("tabs.fravaer")}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              {mode === "timer" ? (
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
                  {routesForEmployee.length > 0 && (
                    <SearchPickerField
                      label={t("timer.route")}
                      placeholder={t("timer.routeSelect")}
                      items={routesForEmployee.map((r) => ({ id: r.id, label: r.name }))}
                      value={routeId}
                      onChange={setRouteId}
                    />
                  )}
                  {vehiclesForEmployee.length > 0 && (
                    <SearchPickerField
                      label={t("timer.vehicleOptional")}
                      placeholder={t("timer.vehicleSelect")}
                      items={vehiclesForEmployee.map((v) => ({ id: v.id, label: vehicleLabel(v) }))}
                      value={vehicleId}
                      onChange={setVehicleId}
                    />
                  )}
                  <Text style={styles.label}>{t("timer.noteOptional")}</Text>
                  <TextInput style={styles.input} value={note} onChangeText={setNote} placeholderTextColor={colors.textMuted} />
                  {formError ? <Text style={styles.error}>{formError}</Text> : null}
                  <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleAddTimeEntry} disabled={saving}>
                    <Text style={styles.buttonText}>{saving ? t("common.saving") : t("ansatte.add")}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View>
                  <Text style={styles.label}>{t("fravaer.type")}</Text>
                  <View style={styles.typeRow}>
                    {availableAbsenceTypes.map((absenceTypeOption) => (
                      <TouchableOpacity
                        key={absenceTypeOption}
                        onPress={() => setAbsenceType(absenceTypeOption)}
                        style={[styles.typeChip, absenceType === absenceTypeOption && styles.typeChipActive]}
                      >
                        <Text style={[styles.typeChipText, absenceType === absenceTypeOption && styles.typeChipTextActive]}>
                          {t(`absenceType.${absenceTypeOption}`)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <PickerField label={t("fravaer.from")} value={absenceStart} mode="date" onChange={setAbsenceStart} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <PickerField label={t("fravaer.to")} value={absenceEnd} mode="date" onChange={setAbsenceEnd} />
                    </View>
                  </View>
                  <Text style={styles.label}>{t("fravaer.comment")}</Text>
                  <TextInput style={styles.input} value={absenceNote} onChangeText={setAbsenceNote} placeholderTextColor={colors.textMuted} />
                  {formError ? <Text style={styles.error}>{formError}</Text> : null}
                  <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleAddAbsence} disabled={saving}>
                    <Text style={styles.buttonText}>{saving ? t("common.saving") : t("ansatte.add")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={styles.sectionTitle}>{t("ansatte.recentEntries")}</Text>
            {loadingEmployee ? (
              <Text style={styles.emptyText}>{t("common.loading")}</Text>
            ) : entries.length === 0 ? (
              <Text style={styles.emptyText}>{t("timer.noEntries")}</Text>
            ) : (
              entries.map((entry) =>
                editingEntryId === entry.id ? (
                  <View key={entry.id} style={[styles.entryRow, styles.entryRowEditing]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryDate}>{formatDate(entry.entry_date)}</Text>
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
                        <View style={{ flex: 1 }}>
                          <PickerField label={t("timer.fromTime")} value={editStartTime} mode="time" onChange={setEditStartTime} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <PickerField label={t("timer.toTime")} value={editEndTime} mode="time" onChange={setEditEndTime} />
                        </View>
                      </View>
                      <TextInput
                        style={[styles.input, { marginTop: 6 }]}
                        value={editDescription}
                        onChangeText={setEditDescription}
                        placeholderTextColor={colors.textMuted}
                      />
                      <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
                        <TouchableOpacity onPress={() => setPendingSaveEntryId(entry.id)}>
                          <Text style={styles.saveText}>{t("common.save")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingEntryId(null)}>
                          <Text style={styles.deleteText}>{t("common.cancel")}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View key={entry.id} style={styles.entryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.entryDate}>{formatDate(entry.entry_date)}</Text>
                      {entry.description ? <Text style={styles.entryDesc}>{entry.description}</Text> : null}
                    </View>
                    <Text style={styles.entryHours}>
                      {entry.hours != null ? `${Number(entry.hours).toFixed(1)} ${t("timer.hours")}` : t("timer.inProgress")}
                    </Text>
                    {entry.hours != null && (
                      <TouchableOpacity onPress={() => startEditEntry(entry)} style={styles.rowBtn}>
                        <Text style={styles.deleteText}>{t("common.edit")}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => setPendingDelete({ id: entry.id, kind: "timer" })} style={styles.rowBtn}>
                      <Text style={styles.deleteText}>{t("common.delete")}</Text>
                    </TouchableOpacity>
                  </View>
                )
              )
            )}

            <Text style={styles.sectionTitle}>{t("ansatte.recentAbsences")}</Text>
            {absences.length === 0 ? (
              <Text style={styles.emptyText}>{t("fravaer.noApplications")}</Text>
            ) : (
              absences.map((a) => (
                <View key={a.id} style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryDate}>
                      {formatDate(a.start_date)}
                      {a.end_date !== a.start_date ? ` – ${formatDate(a.end_date)}` : ""}
                    </Text>
                    <Text style={styles.entryDesc}>
                      {t(`absenceType.${a.type}`)} · {t(`absenceStatus.${a.status}`)}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setPendingDelete({ id: a.id, kind: "fravaer" })} style={styles.rowBtn}>
                    <Text style={styles.deleteText}>{t("common.delete")}</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {pendingSaveEntryId && (
        <ReasonDialog
          title={t("timer.saveCorrectionTitle")}
          message={t("timer.saveCorrectionMessage")}
          confirmLabel={t("timer.saveCorrectionConfirm")}
          requireReason
          onConfirm={confirmSaveEntry}
          onCancel={() => setPendingSaveEntryId(null)}
        />
      )}

      {pendingDelete && (
        <ReasonDialog
          title={pendingDelete.kind === "timer" ? t("timer.deleteEntryTitle") : t("ansatte.deleteAbsenceTitle")}
          message={pendingDelete.kind === "timer" ? t("timer.deleteEntryMessage") : t("ansatte.deleteAbsenceMessage")}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 14 },
    hint: { fontSize: 13, color: colors.textMuted, marginTop: 16 },
    selectedEmployeeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 16,
      paddingBottom: 4,
    },
    selectedEmployeeName: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text, marginRight: 8 },
    changeEmployeeText: { fontSize: 12.5, color: colors.primary, fontWeight: "700" },
    modeRow: { flexDirection: "row", backgroundColor: colors.background, borderRadius: 8, padding: 3, marginTop: 12, marginBottom: 12 },
    modeBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
    modeBtnActive: { backgroundColor: colors.card },
    modeText: { fontSize: 12.5, color: colors.textMuted, fontWeight: "600" },
    modeTextActive: { color: colors.primary },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
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
    error: { color: colors.danger, fontSize: 13, marginTop: 10 },
    button: { backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: "center", marginTop: 16 },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.primaryText, fontSize: 14.5, fontWeight: "600" },
    sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 24, marginBottom: 8 },
    emptyText: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
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
    rowBtn: { padding: 4, marginLeft: 8 },
    deleteText: { fontSize: 11.5, color: colors.textMuted },
    saveText: { fontSize: 12.5, color: colors.primary, fontWeight: "700" },
  });
}

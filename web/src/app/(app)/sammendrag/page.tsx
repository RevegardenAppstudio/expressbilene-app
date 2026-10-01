"use client";

import { useEffect, useState, useCallback, useMemo, FormEvent, Fragment } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toIsoDate, clampDate } from "@/lib/calendar";
import {
  ABSENCE_TYPE_LABELS,
  ADMIN_ONLY_ABSENCE_TYPES,
  vehicleLabel,
  type Absence,
  type AbsenceType,
  type Department,
  type Profile,
  type Route,
  type TimeEntry,
  type Vehicle,
} from "@/lib/types";
import ReasonDialog from "@/components/ReasonDialog";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { generatePdfReport } from "@/lib/pdf";
import { buildDayDetails, departmentName, addDaysIso } from "@/lib/reports";
import { logAuditEvent } from "@/lib/auditLog";
import type { RowInput } from "jspdf-autotable";

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

function toHHMM(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function monthStart() {
  const d = new Date();
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function daysOverlap(startA: string, endA: string, startB: string, endB: string) {
  const start = clampDate(startA, startB, endB);
  const end = clampDate(endA, startB, endB);
  if (end < start) return 0;
  const ms = new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime();
  return Math.round(ms / 86400000) + 1;
}

type Summary = {
  workedHours: number;
  wageHours: number;
  overtimeHours: number;
  sickDays: number;
  vacationDays: number;
  leaveDays: number;
  friDays: number;
};

const EMPTY_SUMMARY: Summary = {
  workedHours: 0,
  wageHours: 0,
  overtimeHours: 0,
  sickDays: 0,
  vacationDays: 0,
  leaveDays: 0,
  friDays: 0,
};

export default function SammendragPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [isStaff, setIsStaff] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [fromDate, setFromDate] = useState(monthStart());
  const [toDate, setToDate] = useState(toIsoDate(new Date()));
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfName, setSelfName] = useState("");
  const [selfDepartmentId, setSelfDepartmentId] = useState<string | null>(null);
  const [pendingAbsenceCount, setPendingAbsenceCount] = useState(0);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [addMode, setAddMode] = useState<"timer" | "fravaer" | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newEntryDate, setNewEntryDate] = useState(toIsoDate(new Date()));
  const [newStartTime, setNewStartTime] = useState("07:00");
  const [newEndTime, setNewEndTime] = useState("15:00");
  const [newEntryRouteId, setNewEntryRouteId] = useState("");
  const [newEntryVehicleId, setNewEntryVehicleId] = useState("");
  const [newEntryNote, setNewEntryNote] = useState("");
  const [newAbsenceType, setNewAbsenceType] = useState<AbsenceType>("ferie");
  const [newAbsenceStart, setNewAbsenceStart] = useState(toIsoDate(new Date()));
  const [newAbsenceEnd, setNewAbsenceEnd] = useState(toIsoDate(new Date()));
  const [newAbsenceNote, setNewAbsenceNote] = useState("");

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState("07:00");
  const [editEndTime, setEditEndTime] = useState("15:00");
  const [editDescription, setEditDescription] = useState("");
  const [pendingSaveEntryId, setPendingSaveEntryId] = useState<string | null>(null);
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<{ id: string; kind: "timer" | "fravaer" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setSelfId(user.id);

    const { data: myProfile } = await supabase
      .from("profiles")
      .select("role, department_id, full_name")
      .eq("id", user.id)
      .single();
    const staff = myProfile?.role === "admin" || myProfile?.role === "moderator";
    setIsStaff(staff);
    setIsAdmin(myProfile?.role === "admin");
    setSelfName(myProfile?.full_name ?? "");
    setSelfDepartmentId(myProfile?.department_id ?? null);

    if (staff) {
      const [{ data: allProfiles }, { data: deps }, { data: pending }] = await Promise.all([
        supabase.from("profiles").select("*").eq("is_employee", true).order("full_name"),
        supabase.from("departments").select("*").order("name"),
        supabase.from("absences").select("id").eq("status", "venter"),
      ]);
      if (allProfiles) setProfiles(allProfiles as Profile[]);
      if (deps) setDepartments(deps as Department[]);
      setPendingAbsenceCount(pending?.length ?? 0);
    }

    // Standardvalg: forespurt ansatt (?user=) hvis satt, ellers meg selv.
    const requestedUser = searchParams.get("user");
    const initialSelection = selectedUserId || requestedUser || user.id;
    if (!selectedUserId) setSelectedUserId(initialSelection);

    const targetUserId = !staff ? user.id : initialSelection === "__all__" ? null : initialSelection;

    let entryQuery = supabase.from("time_entries").select("*").gte("entry_date", fromDate).lte("entry_date", toDate);
    let absenceQuery = supabase
      .from("absences")
      .select("*")
      .lte("start_date", toDate)
      .gte("end_date", fromDate)
      .eq("status", "godkjent");

    if (targetUserId) {
      entryQuery = entryQuery.eq("user_id", targetUserId);
      absenceQuery = absenceQuery.eq("user_id", targetUserId);
    }

    const [{ data: entryData }, { data: absenceData }, { data: routeData }, { data: vehicleData }] = await Promise.all([
      entryQuery,
      absenceQuery,
      supabase.from("routes").select("*"),
      supabase.from("vehicles").select("*"),
    ]);
    if (entryData) setEntries(entryData as TimeEntry[]);
    if (absenceData) setAbsences(absenceData as Absence[]);
    if (routeData) setRoutes(routeData as Route[]);
    if (vehicleData) setVehicles(vehicleData as Vehicle[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, selectedUserId, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  async function logAction(action: string, targetType: string, targetId: string, reason: string, details: string) {
    await logAuditEvent(supabase, { action, targetType, targetId, reason, details });
  }

  async function handleAddTimeEntry(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const clockIn = new Date(`${newEntryDate}T${newStartTime}:00`);
    const clockOut = new Date(`${newEntryDate}T${newEndTime}:00`);
    if (clockOut <= clockIn) {
      setFormError(t("timer.toBeforeFromError"));
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("time_entries").insert({
      user_id: selectedUserId,
      entry_date: newEntryDate,
      clock_in: clockIn.toISOString(),
      clock_out: clockOut.toISOString(),
      route_id: newEntryRouteId || null,
      vehicle_id: newEntryVehicleId || null,
      description: newEntryNote.trim() || null,
    });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("overlapping_time_entry") ? t("timer.overlapError") : t("sammendrag.addTimeFailed");
      setFormError(msg);
      showToast(msg, "error");
      return;
    }
    setNewEntryRouteId("");
    setNewEntryVehicleId("");
    setNewEntryNote("");
    setAddMode(null);
    showToast(t("sammendrag.timeAdded"));
    load();
  }

  async function handleAddAbsence(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (newAbsenceEnd < newAbsenceStart) {
      setFormError(t("fravaer.endBeforeStartError"));
      return;
    }
    setSaving(true);
    // Godkjennes automatisk av databasen siden admin/moderator legger den
    // til direkte (se handle_absence_insert() i schema.sql).
    const { error } = await supabase.from("absences").insert({
      user_id: selectedUserId,
      type: newAbsenceType,
      start_date: newAbsenceStart,
      end_date: newAbsenceEnd,
      note: newAbsenceNote.trim() || null,
    });

    if (error) {
      setSaving(false);
      const msg = error.message.includes("duplicate_absence") ? t("fravaer.overlapError") : t("sammendrag.addAbsenceFailed");
      setFormError(msg);
      showToast(msg, "error");
      return;
    }

    setSaving(false);
    setNewAbsenceNote("");
    setAddMode(null);
    showToast(t("sammendrag.absenceAdded"));
    load();
  }

  function startEditEntry(entry: TimeEntry) {
    setEditingEntryId(entry.id);
    if (entry.clock_in && entry.clock_out) {
      setEditStartTime(toHHMM(entry.clock_in));
      setEditEndTime(toHHMM(entry.clock_out));
    } else {
      // Eldre registrering korrigert før klokkeslett-basert redigering -- sett
      // et fornuftig utgangspunkt basert på timetallet.
      setEditStartTime("07:00");
      const endMinutes = 7 * 60 + Math.round(Number(entry.hours ?? 0) * 60);
      setEditEndTime(`${String(Math.floor(endMinutes / 60) % 24).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`);
    }
    setEditDescription(entry.description ?? "");
  }

  async function confirmSaveEntry(reason: string) {
    const id = pendingSaveEntryId;
    setPendingSaveEntryId(null);
    if (!id) return;
    const original = entries.find((e) => e.id === id);
    if (!original) return;

    const clockIn = new Date(`${original.entry_date}T${editStartTime}:00`);
    const clockOut = new Date(`${original.entry_date}T${editEndTime}:00`);
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
      showToast(t("sammendrag.saveEntryFailed"), "error");
      return;
    }
    const oldTimes = original.clock_in && original.clock_out
      ? `${formatTime(original.clock_in)}–${formatTime(original.clock_out)}`
      : `${original.hours ?? "?"} t`;
    await logAction(
      "time_entry.corrected",
      "time_entries",
      id,
      reason,
      `Klokkeslett endret fra ${oldTimes} til ${editStartTime}–${editEndTime}`
    );
    setEditingEntryId(null);
    showToast(t("sammendrag.entryUpdated"));
    load();
  }

  async function confirmDeleteRow(reason: string) {
    const target = pendingDeleteEntry;
    setPendingDeleteEntry(null);
    if (!target) return;
    if (target.kind === "timer") {
      const original = entries.find((e) => e.id === target.id);
      const { error } = await supabase.from("time_entries").delete().eq("id", target.id);
      if (error) {
        showToast(t("sammendrag.deleteEntryFailed"), "error");
        return;
      }
      await logAction(
        "time_entry.deleted",
        "time_entries",
        target.id,
        reason,
        `Slettet registrering på ${original?.entry_date} (${original?.hours ?? "?"} t)`
      );
      showToast(t("sammendrag.entryDeleted"));
    } else {
      const original = absences.find((a) => a.id === target.id);
      const { error } = await supabase.from("absences").delete().eq("id", target.id);
      if (error) {
        showToast(t("sammendrag.deleteAbsenceFailed"), "error");
        return;
      }
      await logAction(
        "absence.deleted",
        "absences",
        target.id,
        reason,
        `Slettet ${original ? ABSENCE_TYPE_LABELS[original.type] : "fravær"} på ${original?.start_date}`
      );
      showToast(t("sammendrag.absenceDeleted"));
    }
    load();
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const routeName = (id: string | null) => (id ? routes.find((r) => r.id === id)?.name ?? null : null);
  const vehicleForEntry = (id: string | null) => (id ? vehicles.find((v) => v.id === id) ?? null : null);

  const visibleProfiles = departmentFilter ? profiles.filter((p) => p.department_id === departmentFilter) : profiles;

  const selectedEmployeeDepartmentId = isStaff ? profiles.find((p) => p.id === selectedUserId)?.department_id ?? null : null;
  const routesForNewEntry = selectedEmployeeDepartmentId
    ? routes.filter((r) => r.department_id === selectedEmployeeDepartmentId)
    : routes;
  const vehiclesForNewEntry = selectedEmployeeDepartmentId
    ? vehicles.filter((v) => v.department_id === selectedEmployeeDepartmentId)
    : vehicles;

  useEffect(() => {
    if (isStaff && selectedUserId && selectedUserId !== "__all__" && !visibleProfiles.some((p) => p.id === selectedUserId)) {
      setSelectedUserId("__all__");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentFilter, profiles, isStaff]);

  const summaryByUser = useMemo(() => {
    const map = new Map<string, Summary>();
    const ensure = (id: string) => {
      if (!map.has(id)) map.set(id, { ...EMPTY_SUMMARY });
      return map.get(id)!;
    };

    // Lønnsgrunnlag har et gulv på 8t for enhver dag det faktisk er jobbet
    // (sjåføren får aldri mindre enn 8t betalt), og overtid er timene som
    // overstiger 8t samme dag -- derfor grupperes timene pr. dag pr. ansatt
    // først. Fakturering grunnlag er workedHours (faktiske timer, ufiltrert).
    const dailyTotals = new Map<string, number>();
    for (const e of entries) {
      if (e.hours == null) continue;
      ensure(e.user_id).workedHours += Number(e.hours);
      const key = `${e.user_id}__${e.entry_date}`;
      dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + Number(e.hours));
    }
    for (const [key, dayTotal] of dailyTotals) {
      const userId = key.split("__")[0];
      const s = ensure(userId);
      s.wageHours += Math.max(dayTotal, 8);
      s.overtimeHours += Math.max(dayTotal - 8, 0);
    }

    for (const a of absences) {
      const days = daysOverlap(a.start_date, a.end_date, fromDate, toDate);
      const s = ensure(a.user_id);
      if (a.type === "ferie") s.vacationDays += days;
      else if (a.type === "permisjon") s.leaveDays += days;
      else if (a.type === "fri") s.friDays += days;
      else s.sickDays += days;

      // Sykemelding (legeerklært): arbeidsgiverperioden er de første 16
      // sammenhengende dagene av SYKEMELDINGEN (ikke av rapportperioden) --
      // disse dagene telles med i lønnsgrunnlaget med 8t/dag. Fra dag 17
      // overtar NAV betalingsansvaret, så de dagene gir 0t i lønnsgrunnlaget
      // (men telles fortsatt som sykedager over).
      if (a.type === "sykdom_legemeldt") {
        const employerPeriodEnd = addDaysIso(a.start_date, 15);
        const payableEnd = employerPeriodEnd < a.end_date ? employerPeriodEnd : a.end_date;
        const payableDays = daysOverlap(a.start_date, payableEnd, fromDate, toDate);
        s.wageHours += payableDays * Number(a.hours ?? 8);
      }
    }

    return map;
  }, [entries, absences, fromDate, toDate]);

  const showAll = isStaff && selectedUserId === "__all__";
  const singleSummary: Summary = showAll
    ? EMPTY_SUMMARY
    : summaryByUser.get((isStaff ? selectedUserId : selfId) ?? "") ?? EMPTY_SUMMARY;

  function handleExportEmployeePdf() {
    const targetId = isStaff ? selectedUserId : selfId;
    if (!targetId) return;
    const targetProfile = profiles.find((p) => p.id === targetId);
    const targetName = targetProfile?.full_name ?? selfName;
    const targetDepartmentId = targetProfile?.department_id ?? selfDepartmentId;

    const days = buildDayDetails(entries, absences, fromDate, toDate, routes, vehicles, departments, targetDepartmentId);
    const rows = days.map((d) => [
      formatDate(d.date),
      targetName,
      d.departmentLabel,
      d.routeLabel,
      d.vehicleLabel,
      d.clockRange,
      d.workedHours > 0 ? d.workedHours.toFixed(1) : "—",
      d.breakRange,
      d.overtimeHours > 0 ? d.overtimeHours.toFixed(1) : "—",
      d.sickLabel ?? "—",
    ]);

    const totalHours = days.reduce((sum, d) => sum + d.workedHours, 0);
    const totalOvertime = days.reduce((sum, d) => sum + d.overtimeHours, 0);
    const totalSickDays = days.filter((d) => d.sickLabel).length;

    generatePdfReport({
      title: t("sammendrag.pdfEmployeeTitle", { name: targetName }),
      subtitle: `${formatDate(fromDate)} – ${formatDate(toDate)}`,
      columns: [
        t("sammendrag.date"),
        t("sammendrag.employee"),
        t("sammendrag.department"),
        t("sammendrag.route"),
        t("sammendrag.vehicle"),
        t("sammendrag.clockTime"),
        t("timer.hoursColumn"),
        t("sammendrag.breakTime"),
        t("sammendrag.overtimeHoursCol"),
        t("sammendrag.sickDaysCol"),
      ],
      rows,
      foot: [
        [
          t("sammendrag.total"),
          "",
          "",
          "",
          "",
          "",
          totalHours.toFixed(1),
          "",
          totalOvertime.toFixed(1),
          String(totalSickDays),
        ],
      ],
      filename: `timeliste-${targetName.replace(/\s+/g, "_")}-${fromDate}_${toDate}.pdf`,
    });
  }

  function handleExportOverviewPdf() {
    const userIds = new Set<string>([...entries.map((e) => e.user_id), ...absences.map((a) => a.user_id)]);
    const relevantProfiles = profiles
      .filter((p) => userIds.has(p.id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));

    const rowsByDepartment = new Map<string, (string | number)[][]>();
    let totalWageHours = 0;
    let totalWorkedHours = 0;
    let totalSickDays = 0;
    for (const profile of relevantProfiles) {
      const userEntries = entries.filter((e) => e.user_id === profile.id);
      const userAbsences = absences.filter((a) => a.user_id === profile.id);
      // buildDayDetails returner allerede dagene i kronologisk rekkefølge --
      // rekkefølgen på ansatte (alfabetisk, satt over) bevares fordi rader
      // for hver ansatt legges til samlet, én ansatt om gangen.
      const days = buildDayDetails(userEntries, userAbsences, fromDate, toDate, routes, vehicles, departments, profile.department_id);
      const depName = departmentName(departments, profile.department_id);
      const rows = rowsByDepartment.get(depName) ?? [];
      for (const d of days) {
        rows.push([
          formatDate(d.date),
          profile.full_name,
          d.wageHours > 0 ? d.wageHours.toFixed(1) : "—",
          d.workedHours > 0 ? d.workedHours.toFixed(1) : "—",
          d.sickLabel ?? "—",
        ]);
        totalWageHours += d.wageHours;
        totalWorkedHours += d.workedHours;
        if (d.sickLabel) totalSickDays += 1;
      }
      rowsByDepartment.set(depName, rows);
    }

    const allRows: RowInput[] = [];
    for (const depName of [...rowsByDepartment.keys()].sort((a, b) => a.localeCompare(b))) {
      const rows = rowsByDepartment.get(depName)!;
      if (rows.length === 0) continue;
      allRows.push([{ content: depName, colSpan: 5, styles: { fontStyle: "bold", fillColor: [226, 232, 240] } }]);
      allRows.push(...(rows as RowInput[]));
    }

    generatePdfReport({
      title: t("sammendrag.pdfOverviewTitle"),
      subtitle: `${formatDate(fromDate)} – ${formatDate(toDate)}`,
      columns: [
        t("sammendrag.date"),
        t("sammendrag.employee"),
        t("sammendrag.workedHoursCol"),
        t("sammendrag.billingBasisCol"),
        t("sammendrag.sickDaysCol"),
      ],
      rows: allRows,
      foot: [[t("sammendrag.total"), "", totalWageHours.toFixed(1), totalWorkedHours.toFixed(1), String(totalSickDays)]],
      filename: `totaloversikt-${fromDate}_${toDate}.pdf`,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("sammendrag.title")}</h1>
        <p className="text-sm text-slate-500">{t("sammendrag.subtitle")}</p>
      </div>

      {isStaff && pendingAbsenceCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {pendingAbsenceCount} {t("sammendrag.pendingWord")}
            {pendingAbsenceCount === 1 ? "" : t("sammendrag.pendingSuffix")} {t("sammendrag.pendingRest")}
          </p>
          <Link href="/varsler" className="text-sm font-medium text-amber-700 underline hover:text-amber-900">
            {t("sammendrag.viewApplications")}
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.from")}</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.to")}</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {isStaff && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.department")}</label>
              <select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">{t("sammendrag.allDepartments")}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.employee")}</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="__all__">{departmentFilter ? t("sammendrag.allEmployeesInDept") : t("sammendrag.allEmployees")}</option>
                {visibleProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                    {p.id === selfId ? t("sammendrag.selfSuffix") : ""}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {showAll ? (
          <button
            onClick={handleExportOverviewPdf}
            className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("sammendrag.exportOverviewPdf")}
          </button>
        ) : (
          <button
            onClick={handleExportEmployeePdf}
            className="ml-auto rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            {t("sammendrag.exportPdf")}
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      ) : showAll ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">{t("sammendrag.employee")}</th>
                <th className="px-4 py-2">{t("sammendrag.workedHoursCol")}</th>
                <th className="px-4 py-2">{t("sammendrag.wageHoursCol")}</th>
                <th className="px-4 py-2">{t("sammendrag.overtimeHoursCol")}</th>
                <th className="px-4 py-2">{t("sammendrag.sickDaysCol")}</th>
                <th className="px-4 py-2">{t("sammendrag.vacationDaysCol")}</th>
                <th className="px-4 py-2">{t("sammendrag.leaveDaysCol")}</th>
                <th className="px-4 py-2">{t("sammendrag.friDaysCol")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleProfiles.map((p) => {
                const s = summaryByUser.get(p.id) ?? EMPTY_SUMMARY;
                return (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-800" data-label={t("sammendrag.employee")}>{p.full_name}</td>
                    <td className="px-4 py-2" data-label={t("sammendrag.workedHoursCol")}>
                      {s.workedHours.toFixed(1)} {t("sammendrag.hoursUnit")}
                    </td>
                    <td className="px-4 py-2" data-label={t("sammendrag.wageHoursCol")}>
                      {s.wageHours.toFixed(1)} {t("sammendrag.hoursUnit")}
                    </td>
                    <td className="px-4 py-2" data-label={t("sammendrag.overtimeHoursCol")}>
                      {s.overtimeHours.toFixed(1)} {t("sammendrag.hoursUnit")}
                    </td>
                    <td className="px-4 py-2" data-label={t("sammendrag.sickDaysCol")}>{s.sickDays}</td>
                    <td className="px-4 py-2" data-label={t("sammendrag.vacationDaysCol")}>{s.vacationDays}</td>
                    <td className="px-4 py-2" data-label={t("sammendrag.leaveDaysCol")}>{s.leaveDays}</td>
                    <td className="px-4 py-2" data-label={t("sammendrag.friDaysCol")}>{s.friDays}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-900">{singleSummary.workedHours.toFixed(1)}</div>
            <div className="text-xs text-slate-500">{t("sammendrag.workedHoursCol")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-900">{singleSummary.wageHours.toFixed(1)}</div>
            <div className="text-xs text-slate-500">{t("sammendrag.wageHoursCol")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-orange-600">{singleSummary.overtimeHours.toFixed(1)}</div>
            <div className="text-xs text-slate-500">{t("sammendrag.overtimeHoursCol")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-amber-600">{singleSummary.sickDays}</div>
            <div className="text-xs text-slate-500">{t("sammendrag.sickDaysCol")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-sky-600">{singleSummary.vacationDays}</div>
            <div className="text-xs text-slate-500">{t("sammendrag.vacationDaysCol")}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-600">{singleSummary.friDays}</div>
            <div className="text-xs text-slate-500">{t("sammendrag.friDaysCol")}</div>
          </div>
        </div>
      )}

      {isStaff && !showAll && !loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setAddMode(addMode === "timer" ? null : "timer")}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t("sammendrag.addTime")}
            </button>
            <button
              onClick={() => {
                if (addMode !== "fravaer" && !isAdmin) setNewAbsenceType("sykdom_egenmelding");
                setAddMode(addMode === "fravaer" ? null : "fravaer");
              }}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {t("sammendrag.addAbsence")}
            </button>
          </div>

          {addMode === "timer" && (
            <form onSubmit={handleAddTimeEntry} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.date")}</label>
                <input
                  type="date"
                  required
                  value={newEntryDate}
                  onChange={(e) => setNewEntryDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.fromTime")}</label>
                <input
                  type="time"
                  required
                  value={newStartTime}
                  onChange={(e) => setNewStartTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.toTime")}</label>
                <input
                  type="time"
                  required
                  value={newEndTime}
                  onChange={(e) => setNewEndTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.route")}</label>
                <select
                  value={newEntryRouteId}
                  onChange={(e) => setNewEntryRouteId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t("common.noneSelected")}</option>
                  {routesForNewEntry.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.vehicle")}</label>
                <select
                  value={newEntryVehicleId}
                  onChange={(e) => setNewEntryVehicleId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t("common.noneSelected")}</option>
                  {vehiclesForNewEntry.map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.noteOptional")}</label>
                <input
                  type="text"
                  value={newEntryNote}
                  onChange={(e) => setNewEntryNote(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {formError && <p className="text-sm text-red-600 sm:col-span-4">{formError}</p>}
              <div className="sm:col-span-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                >
                  {saving ? t("common.saving") : t("sammendrag.add")}
                </button>
              </div>
            </form>
          )}

          {addMode === "fravaer" && (
            <form onSubmit={handleAddAbsence} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.type")}</label>
                <select
                  value={newAbsenceType}
                  onChange={(e) => setNewAbsenceType(e.target.value as AbsenceType)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[])
                    .filter((value) => isAdmin || !ADMIN_ONLY_ABSENCE_TYPES.includes(value))
                    .map((value) => (
                      <option key={value} value={value}>
                        {t(`absenceType.${value}`)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.from")}</label>
                <input
                  type="date"
                  required
                  value={newAbsenceStart}
                  onChange={(e) => setNewAbsenceStart(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.to")}</label>
                <input
                  type="date"
                  required
                  value={newAbsenceEnd}
                  onChange={(e) => setNewAbsenceEnd(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("sammendrag.noteOptional")}</label>
                <input
                  type="text"
                  value={newAbsenceNote}
                  onChange={(e) => setNewAbsenceNote(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              {formError && <p className="text-sm text-red-600 sm:col-span-4">{formError}</p>}
              <div className="sm:col-span-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                >
                  {saving ? t("common.saving") : t("sammendrag.add")}
                </button>
                <p className="mt-1 text-xs text-slate-400">{t("sammendrag.autoApproveNote")}</p>
              </div>
            </form>
          )}
        </div>
      )}

      {!loading && !showAll && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">{t("sammendrag.date")}</th>
                <th className="px-4 py-2">{t("sammendrag.type")}</th>
                <th className="px-4 py-2">{t("sammendrag.details")}</th>
                {isStaff && <th className="px-4 py-2"></th>}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && absences.length === 0 ? (
                <tr>
                  <td colSpan={isStaff ? 4 : 3} className="px-4 py-6 text-center text-slate-400">
                    {t("sammendrag.noEntries")}
                  </td>
                </tr>
              ) : (
                [
                  ...entries.map((e) => ({ sortDate: e.entry_date, node: (
                    editingEntryId === e.id ? (
                      <tr key={`e-${e.id}`} className="border-b border-slate-100 bg-slate-50 last:border-0">
                        <td className="px-4 py-2 whitespace-nowrap" data-label={t("sammendrag.date")}>{formatDate(e.entry_date)}</td>
                        <td className="px-4 py-2" data-label={t("sammendrag.type")}>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{t("nav.timer")}</span>
                        </td>
                        <td className="px-4 py-2" data-label={t("sammendrag.details")}>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="time"
                              value={editStartTime}
                              onChange={(ev) => setEditStartTime(ev.target.value)}
                              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                            <input
                              type="time"
                              value={editEndTime}
                              onChange={(ev) => setEditEndTime(ev.target.value)}
                              className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                            <input
                              value={editDescription}
                              onChange={(ev) => setEditDescription(ev.target.value)}
                              placeholder={t("sammendrag.notePlaceholder")}
                              className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                          <button onClick={() => setPendingSaveEntryId(e.id)} className="mr-2 text-xs font-medium text-brand-dark">
                            {t("common.save")}
                          </button>
                          <button onClick={() => setEditingEntryId(null)} className="text-xs text-slate-400">
                            {t("common.cancel")}
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <Fragment key={`e-${e.id}`}>
                        <tr className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2 whitespace-nowrap" data-label={t("sammendrag.date")}>{formatDate(e.entry_date)}</td>
                          <td className="px-4 py-2" data-label={t("sammendrag.type")}>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{t("nav.timer")}</span>
                          </td>
                          <td className="px-4 py-2 text-slate-500" data-label={t("sammendrag.details")}>
                            <button
                              onClick={() => toggleExpanded(e.id)}
                              className="mr-1.5 text-slate-400 hover:text-brand-dark"
                              aria-label={expandedIds.has(e.id) ? t("sammendrag.hideDetails") : t("sammendrag.showDetails")}
                            >
                              {expandedIds.has(e.id) ? "▾" : "▸"}
                            </button>
                            {e.hours != null ? `${Number(e.hours).toFixed(1)} ${t("sammendrag.hoursUnit")}` : t("timer.inProgress")}
                            {e.clock_in ? ` · ${formatTime(e.clock_in)}${e.clock_out ? ` – ${formatTime(e.clock_out)}` : ""}` : ""}
                            {e.description ? ` · ${e.description}` : ""}
                          </td>
                          {isStaff && (
                            <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                              {e.hours != null && (
                                <button onClick={() => startEditEntry(e)} className="mr-3 text-xs text-slate-400 hover:text-brand-dark">
                                  {t("common.edit")}
                                </button>
                              )}
                              <button
                                onClick={() => setPendingDeleteEntry({ id: e.id, kind: "timer" })}
                                className="text-xs text-slate-400 hover:text-red-600"
                              >
                                {t("common.delete")}
                              </button>
                            </td>
                          )}
                        </tr>
                        {expandedIds.has(e.id) && (
                          <tr className="border-b border-slate-100 last:border-0">
                            <td colSpan={isStaff ? 4 : 3} className="bg-slate-50 px-4 py-3">
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <div>
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t("sammendrag.route")}</div>
                                  <div className="text-xs text-slate-700">{routeName(e.route_id) ?? "—"}</div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t("sammendrag.vehicle")}</div>
                                  <div className="text-xs text-slate-700">
                                    {vehicleForEntry(e.vehicle_id) ? (
                                      <Link href={`/bil/${e.vehicle_id}`} className="hover:text-brand-dark hover:underline">
                                        {vehicleLabel(vehicleForEntry(e.vehicle_id)!)}
                                      </Link>
                                    ) : (
                                      "—"
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t("sammendrag.clockTime")}</div>
                                  <div className="text-xs text-slate-700">
                                    {e.clock_in ? `${formatTime(e.clock_in)}${e.clock_out ? ` – ${formatTime(e.clock_out)}` : ""}` : "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t("sammendrag.breakTime")}</div>
                                  <div className="text-xs text-slate-700">
                                    {e.break_start && e.break_end ? `${formatTime(e.break_start)} – ${formatTime(e.break_end)}` : "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{t("sammendrag.note")}</div>
                                  <div className="text-xs text-slate-700">{e.description || "—"}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  ) })),
                  ...absences.map((a) => ({ sortDate: a.start_date, node: (
                    <tr key={`a-${a.id}`} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap" data-label={t("sammendrag.date")}>
                        {formatDate(a.start_date)}
                        {a.end_date !== a.start_date ? ` – ${formatDate(a.end_date)}` : ""}
                      </td>
                      <td className="px-4 py-2" data-label={t("sammendrag.type")}>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t("nav.fravaer")}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-500" data-label={t("sammendrag.details")}>
                        {t(`absenceType.${a.type}`)} · {t(`absenceStatus.${a.status}`)}
                        {a.note ? ` · ${a.note}` : ""}
                      </td>
                      {isStaff && (
                        <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                          <button
                            onClick={() => setPendingDeleteEntry({ id: a.id, kind: "fravaer" })}
                            className="text-xs text-slate-400 hover:text-red-600"
                          >
                            {t("common.delete")}
                          </button>
                        </td>
                      )}
                    </tr>
                  ) })),
                ]
                  .sort((a, b) => (a.sortDate < b.sortDate ? 1 : a.sortDate > b.sortDate ? -1 : 0))
                  .map((row) => row.node)
              )}
            </tbody>
          </table>
        </div>
      )}

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

      {pendingDeleteEntry && (
        <ReasonDialog
          title={pendingDeleteEntry.kind === "timer" ? t("timer.deleteEntryTitle") : t("sammendrag.deleteAbsenceTitle")}
          message={t("sammendrag.deleteRowMessage")}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={confirmDeleteRow}
          onCancel={() => setPendingDeleteEntry(null)}
        />
      )}
    </div>
  );
}

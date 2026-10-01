"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { buildMonthGrid, buildWeekGrid, addDaysIso, monthLabels, weekdayLabels, toIsoDate } from "@/lib/calendar";
import {
  ABSENCE_TYPE_LABELS,
  ADMIN_ONLY_ABSENCE_TYPES,
  vehicleLabel,
  type Absence,
  type AbsenceType,
  type Department,
  type Profile,
  type Route,
  type RouteCancellation,
  type Vehicle,
  type VehicleServiceBooking,
} from "@/lib/types";
import ReasonDialog from "@/components/ReasonDialog";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { logAuditEvent } from "@/lib/auditLog";

const TYPE_DOT: Record<string, string> = {
  sykdom_egenmelding: "bg-amber-500",
  sykdom_legemeldt: "bg-red-500",
  sykt_barn: "bg-pink-500",
  ferie: "bg-sky-500",
  permisjon: "bg-purple-500",
  fri: "bg-green-500",
};

// Fyller hele feltet i månedsrutenettet med fargen til fraværstypen (i
// stedet for bare en liten prikk), slik at typen er synlig uten å måtte
// klikke inn på dagen -- se TYPE_DOT for samme fargefamilie som prikken.
const TYPE_CHIP: Record<string, string> = {
  sykdom_egenmelding: "bg-amber-100 text-amber-800",
  sykdom_legemeldt: "bg-red-100 text-red-800",
  sykt_barn: "bg-pink-100 text-pink-800",
  ferie: "bg-sky-100 text-sky-800",
  permisjon: "bg-purple-100 text-purple-800",
  fri: "bg-green-100 text-green-800",
};

const SERVICE_DOT = "bg-orange-600";
const CANCEL_DOT = "bg-slate-500";

type AddMode = "fravaer" | "verksted" | "innstill" | null;
type ViewMode = "month" | "week";

export default function KalenderPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { language, t } = useLanguage();
  const now = new Date();
  const todayIso = toIsoDate(now);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [weekAnchor, setWeekAnchor] = useState(todayIso);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [serviceBookings, setServiceBookings] = useState<VehicleServiceBooking[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [routes, setRoutes] = useState<Route[]>([]);
  const [routeCancellations, setRouteCancellations] = useState<RouteCancellation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [selectedDayIso, setSelectedDayIso] = useState<string | null>(null);

  const [addMode, setAddMode] = useState<AddMode>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [absenceEmployeeId, setAbsenceEmployeeId] = useState("");
  const [absenceType, setAbsenceType] = useState<AbsenceType>("sykdom_egenmelding");
  const [absenceEndDate, setAbsenceEndDate] = useState("");
  const [absenceNote, setAbsenceNote] = useState("");
  const [serviceVehicleId, setServiceVehicleId] = useState("");
  const [serviceTime, setServiceTime] = useState("");
  const [serviceNote, setServiceNote] = useState("");
  const [cancelRouteId, setCancelRouteId] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [pendingRemoveCancellationId, setPendingRemoveCancellationId] = useState<string | null>(null);

  const [editingAbsenceId, setEditingAbsenceId] = useState<string | null>(null);
  const [editAbsenceType, setEditAbsenceType] = useState<AbsenceType>("sykdom_egenmelding");
  const [editAbsenceStartDate, setEditAbsenceStartDate] = useState("");
  const [editAbsenceEndDate, setEditAbsenceEndDate] = useState("");
  const [editAbsenceNote, setEditAbsenceNote] = useState("");
  const [editAbsenceError, setEditAbsenceError] = useState<string | null>(null);
  const [pendingSaveAbsenceId, setPendingSaveAbsenceId] = useState<string | null>(null);
  const [pendingDeleteAbsenceId, setPendingDeleteAbsenceId] = useState<string | null>(null);

  const grid = useMemo(
    () => (viewMode === "week" ? buildWeekGrid(weekAnchor) : buildMonthGrid(year, month)),
    [viewMode, year, month, weekAnchor]
  );
  const gridStart = toIsoDate(grid[0]);
  const gridEnd = toIsoDate(grid[grid.length - 1]);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [
      { data: absenceData },
      { data: profileData },
      { data: deps },
      { data: vehicleData },
      { data: bookingData },
      { data: routeData },
      { data: cancellationData },
      meResult,
    ] = await Promise.all([
      supabase
        .from("absences")
        .select("*")
        .lte("start_date", gridEnd)
        .gte("end_date", gridStart)
        .neq("status", "avslatt"),
      supabase.from("profiles").select("*"),
      supabase.from("departments").select("*").order("name"),
      supabase.from("vehicles").select("*"),
      supabase.from("vehicle_service_bookings").select("*").lte("service_date", gridEnd).gte("service_date", gridStart),
      supabase.from("routes").select("*").order("name"),
      supabase.from("route_cancellations").select("*").lte("cancellation_date", gridEnd).gte("cancellation_date", gridStart),
      user ? supabase.from("profiles").select("role, department_id").eq("id", user.id).single() : Promise.resolve({ data: null }),
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
    if (routeData) setRoutes(routeData as Route[]);
    if (cancellationData) setRouteCancellations(cancellationData as RouteCancellation[]);
    if (meResult.data?.role === "moderator") setIsModerator(true);
    if (meResult.data?.role === "admin") setIsAdmin(true);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStart, gridEnd]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("eb_kalender_skjulte_typer");
      if (saved) setHiddenTypes(new Set(JSON.parse(saved)));
    } catch {
      // Ignorerer -- kalenderen fungerer fint uten en husket preferanse.
    }
  }, []);

  function toggleType(key: string) {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem("eb_kalender_skjulte_typer", JSON.stringify([...next]));
      } catch {
        // Ignorerer -- ikke kritisk om preferansen ikke lar seg lagre.
      }
      return next;
    });
  }

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

  const routeById = useMemo(() => {
    const map: Record<string, Route> = {};
    for (const r of routes) map[r.id] = r;
    return map;
  }, [routes]);

  function cancellationsForDay(iso: string) {
    return routeCancellations.filter((c) => {
      if (c.cancellation_date !== iso) return false;
      if (!departmentFilter) return true;
      return routeById[c.route_id]?.department_id === departmentFilter;
    });
  }

  const isStaff = isAdmin || isModerator;
  const routesForFilter = departmentFilter ? routes.filter((r) => r.department_id === departmentFilter) : routes;
  const vehiclesForFilter = departmentFilter
    ? Object.values(vehicles).filter((v) => v.department_id === departmentFilter)
    : Object.values(vehicles);
  const employeesForFilter = departmentFilter
    ? Object.values(profiles).filter((p) => p.department_id === departmentFilter)
    : Object.values(profiles);

  function openDay(iso: string) {
    setSelectedDayIso(iso);
    setAddMode(null);
    setFormError(null);
    setAbsenceEmployeeId("");
    setAbsenceType("sykdom_egenmelding");
    setAbsenceEndDate(iso);
    setAbsenceNote("");
    setServiceVehicleId("");
    setServiceTime("");
    setServiceNote("");
    setCancelRouteId("");
    setCancelNote("");
    setEditingAbsenceId(null);
    setEditAbsenceError(null);
  }

  function canManageAbsence(a: Absence) {
    return isAdmin || (isModerator && !ADMIN_ONLY_ABSENCE_TYPES.includes(a.type));
  }

  function startEditAbsence(a: Absence) {
    setEditingAbsenceId(a.id);
    setEditAbsenceType(a.type);
    setEditAbsenceStartDate(a.start_date);
    setEditAbsenceEndDate(a.end_date);
    setEditAbsenceNote(a.note ?? "");
    setEditAbsenceError(null);
  }

  function cancelEditAbsence() {
    setEditingAbsenceId(null);
    setEditAbsenceError(null);
  }

  function requestSaveEditAbsence() {
    if (editAbsenceEndDate < editAbsenceStartDate) {
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
        start_date: editAbsenceStartDate,
        end_date: editAbsenceEndDate,
        note: editAbsenceNote.trim() || null,
      })
      .eq("id", id);
    if (error) {
      showToast(t("kalender.saveAbsenceFailed"), "error");
      return;
    }
    await logAuditEvent(supabase, {
      action: "absence.updated",
      targetType: "absences",
      targetId: id,
      reason,
      details: `${profiles[original?.user_id ?? ""]?.full_name ?? "?"}: ${
        original ? t(`absenceType.${original.type}`) : "?"
      } (${original?.start_date}–${original?.end_date}) → ${t(`absenceType.${editAbsenceType}`)} (${editAbsenceStartDate}–${editAbsenceEndDate})`,
    });
    setEditingAbsenceId(null);
    showToast(t("kalender.absenceUpdated"));
    await load();
  }

  async function confirmDeleteAbsence(reason: string) {
    const id = pendingDeleteAbsenceId;
    setPendingDeleteAbsenceId(null);
    if (!id) return;
    const original = absences.find((a) => a.id === id);
    const { error } = await supabase.from("absences").delete().eq("id", id);
    if (error) {
      showToast(t("kalender.deleteAbsenceFailed"), "error");
      return;
    }
    await logAuditEvent(supabase, {
      action: "absence.deleted",
      targetType: "absences",
      targetId: id,
      reason,
      details: `${profiles[original?.user_id ?? ""]?.full_name ?? "?"}: ${
        original ? t(`absenceType.${original.type}`) : "?"
      } (${original?.start_date}–${original?.end_date})`,
    });
    showToast(t("kalender.absenceDeleted"));
    await load();
  }

  async function handleAddAbsence() {
    if (!selectedDayIso || !absenceEmployeeId) {
      setFormError(t("kalender.selectEmployeeError"));
      return;
    }
    if (absenceEndDate < selectedDayIso) {
      setFormError(t("timer.toBeforeFromError"));
      return;
    }
    setSaving(true);
    setFormError(null);
    const { data: inserted, error } = await supabase
      .from("absences")
      .insert({
        user_id: absenceEmployeeId,
        type: absenceType,
        start_date: selectedDayIso,
        end_date: absenceEndDate,
        note: absenceNote.trim() || null,
      })
      .select("id, type")
      .single();

    if (error || !inserted) {
      setSaving(false);
      setFormError(t("kalender.addAbsenceFailed"));
      showToast(t("kalender.addAbsenceFailed"), "error");
      return;
    }

    // Ferie/permisjon/fri settes til "venter" av databasen -- siden en
    // admin/moderator legger dette til direkte, godkjenner vi det med det
    // samme (samme mønster som Sammendrag-siden).
    if (inserted.type === "ferie" || inserted.type === "permisjon" || inserted.type === "fri") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase
        .from("absences")
        .update({ status: "godkjent", decided_by: user?.id ?? null, decided_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }

    setSaving(false);
    showToast(t("kalender.absenceAdded"));
    setAddMode(null);
    await load();
  }

  async function handleAddService() {
    if (!selectedDayIso || !serviceVehicleId) {
      setFormError(t("kalender.selectVehicleError"));
      return;
    }
    setSaving(true);
    setFormError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("vehicle_service_bookings").insert({
      vehicle_id: serviceVehicleId,
      service_date: selectedDayIso,
      service_time: serviceTime || null,
      note: serviceNote.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      setFormError(t("kalender.addServiceFailed"));
      showToast(t("kalender.addServiceFailed"), "error");
      return;
    }
    showToast(t("kalender.serviceAdded"));
    setAddMode(null);
    await load();
  }

  async function handleAddCancellation() {
    if (!selectedDayIso || !cancelRouteId) {
      setFormError(t("kalender.selectRouteError"));
      return;
    }
    setSaving(true);
    setFormError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("route_cancellations").insert({
      route_id: cancelRouteId,
      cancellation_date: selectedDayIso,
      note: cancelNote.trim() || null,
      created_by: user?.id ?? null,
    });
    setSaving(false);
    if (error) {
      setFormError(t("kalender.addCancellationFailed"));
      showToast(t("kalender.addCancellationFailed"), "error");
      return;
    }
    showToast(t("kalender.cancellationAdded"));
    setAddMode(null);
    await load();
  }

  async function confirmRemoveCancellation() {
    const id = pendingRemoveCancellationId;
    setPendingRemoveCancellationId(null);
    if (!id) return;
    const { error } = await supabase.from("route_cancellations").delete().eq("id", id);
    if (error) {
      showToast(t("kalender.removeCancellationFailed"), "error");
      return;
    }
    showToast(t("kalender.cancellationRemoved"));
    await load();
  }

  function goToPrev() {
    if (viewMode === "week") {
      setWeekAnchor((iso) => addDaysIso(iso, -7));
      return;
    }
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNext() {
    if (viewMode === "week") {
      setWeekAnchor((iso) => addDaysIso(iso, 7));
      return;
    }
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }

  // Når man bytter visning, følger man med til samme periode i den andre
  // visningen i stedet for å hoppe tilbake til der man sist var.
  function switchToWeekView() {
    if (viewMode !== "week") {
      setWeekAnchor(year === now.getFullYear() && month === now.getMonth() ? todayIso : toIsoDate(new Date(year, month, 1)));
      setViewMode("week");
    }
  }

  function switchToMonthView() {
    if (viewMode !== "month") {
      const d = new Date(weekAnchor + "T00:00:00");
      setYear(d.getFullYear());
      setMonth(d.getMonth());
      setViewMode("month");
    }
  }

  function weekRangeLabel(weekStart: Date, weekEnd: Date) {
    const months = monthLabels(language);
    const start = `${weekStart.getDate()} ${months[weekStart.getMonth()].slice(0, 3)}`;
    const end = `${weekEnd.getDate()} ${months[weekEnd.getMonth()].slice(0, 3)} ${weekEnd.getFullYear()}`;
    return `${start} – ${end}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t("kalender.title")}</h1>
          <p className="text-sm text-slate-500">{t("kalender.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-slate-300 text-sm">
            <button
              onClick={switchToMonthView}
              className={`rounded-l-md px-2.5 py-1.5 transition-colors ${
                viewMode === "month" ? "bg-brand font-medium text-black" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t("kalender.monthView")}
            </button>
            <button
              onClick={switchToWeekView}
              className={`rounded-r-md border-l border-slate-300 px-2.5 py-1.5 transition-colors ${
                viewMode === "week" ? "bg-brand font-medium text-black" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t("kalender.weekView")}
            </button>
          </div>
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">{t("kalender.allDepartments")}</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button
            onClick={goToPrev}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            ←
          </button>
          <span className="min-w-[9rem] text-center text-sm font-medium text-slate-700">
            {viewMode === "week" ? weekRangeLabel(grid[0], grid[grid.length - 1]) : `${monthLabels(language)[month]} ${year}`}
          </span>
          <button
            onClick={goToNext}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            →
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {(Object.keys(ABSENCE_TYPE_LABELS) as (keyof typeof ABSENCE_TYPE_LABELS)[]).map((value) => (
          <button
            key={value}
            onClick={() => toggleType(value)}
            className={`flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors ${
              hiddenTypes.has(value) ? "border-slate-200 text-slate-400 opacity-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${TYPE_DOT[value]}`} />
            {t(`absenceType.${value}`)}
          </button>
        ))}
        <button
          onClick={() => toggleType("service")}
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors ${
            hiddenTypes.has("service") ? "border-slate-200 text-slate-400 opacity-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${SERVICE_DOT}`} />
          {t("kalender.service")}
        </button>
        <button
          onClick={() => toggleType("cancellation")}
          className={`flex items-center gap-1.5 rounded-full border px-2 py-1 transition-colors ${
            hiddenTypes.has("cancellation") ? "border-slate-200 text-slate-400 opacity-50" : "border-slate-200 text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${CANCEL_DOT}`} />
          {t("kalender.cancellation")}
        </button>
      </div>
      <p className="-mt-2 text-xs text-slate-400">{t("kalender.toggleHint")}</p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          {weekdayLabels(language).map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.map((date) => {
            const iso = toIsoDate(date);
            const inMonth = viewMode === "week" || date.getMonth() === month;
            const dayAbsences = absencesForDay(iso);
            const visibleAbsences = dayAbsences.filter((a) => !hiddenTypes.has(a.type));
            const visibleServices = hiddenTypes.has("service") ? [] : servicesForDay(iso);
            const visibleCancellations = hiddenTypes.has("cancellation") ? [] : cancellationsForDay(iso);
            const hasContent =
              visibleAbsences.length > 0 || visibleServices.length > 0 || visibleCancellations.length > 0;
            const isClickable = hasContent || isStaff;
            const maxVisible = viewMode === "week" ? 8 : 3;
            return (
              <div
                key={iso}
                onClick={isClickable ? () => openDay(iso) : undefined}
                className={`${viewMode === "week" ? "min-h-[200px]" : "min-h-[92px]"} border-b border-r border-slate-100 p-1.5 last:border-r-0 ${
                  inMonth ? "bg-white" : "bg-slate-50 text-slate-300"
                } ${iso === todayIso ? "ring-1 ring-inset ring-brand" : ""} ${isClickable ? "cursor-pointer hover:bg-slate-50" : ""}`}
              >
                <div className="text-xs font-medium">{date.getDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {visibleAbsences.slice(0, maxVisible).map((a) => (
                    <div
                      key={a.id}
                      title={`${profiles[a.user_id]?.full_name ?? "?"} — ${t(`absenceType.${a.type}`)}`}
                      className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${TYPE_CHIP[a.type]}`}
                    >
                      {profiles[a.user_id]?.full_name.split(" ")[0] ?? "?"} {t(`absenceType.${a.type}`)}
                    </div>
                  ))}
                  {visibleAbsences.length > maxVisible && (
                    <div className="text-[10px] text-slate-400">{t("kalender.more", { count: visibleAbsences.length - maxVisible })}</div>
                  )}
                  {visibleServices.slice(0, maxVisible).map((b) => (
                    <div
                      key={b.id}
                      title={`${vehicles[b.vehicle_id] ? vehicleLabel(vehicles[b.vehicle_id]) : "?"}${b.note ? ` — ${b.note}` : ""}`}
                      className="flex items-center gap-1 truncate rounded bg-orange-50 px-1 py-0.5 text-[10px] text-orange-800"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SERVICE_DOT}`} />
                      <span className="truncate">{vehicles[b.vehicle_id] ? vehicleLabel(vehicles[b.vehicle_id]) : "?"}</span>
                    </div>
                  ))}
                  {visibleServices.length > maxVisible && (
                    <div className="text-[10px] text-orange-700">{t("kalender.moreService", { count: visibleServices.length - maxVisible })}</div>
                  )}
                  {visibleCancellations.slice(0, maxVisible).map((c) => (
                    <div
                      key={c.id}
                      title={`${routeById[c.route_id]?.name ?? "?"}${c.note ? ` — ${c.note}` : ""}`}
                      className="flex items-center gap-1 truncate rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-600"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CANCEL_DOT}`} />
                      <span className="truncate">{routeById[c.route_id]?.name ?? "?"}</span>
                    </div>
                  ))}
                  {visibleCancellations.length > maxVisible && (
                    <div className="text-[10px] text-slate-500">{t("kalender.moreCancellation", { count: visibleCancellations.length - maxVisible })}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {selectedDayIso && (() => {
        const dayDate = new Date(selectedDayIso + "T00:00:00");
        const visibleAbsences = absencesForDay(selectedDayIso).filter((a) => !hiddenTypes.has(a.type));
        const visibleServices = hiddenTypes.has("service") ? [] : servicesForDay(selectedDayIso);
        const visibleCancellations = hiddenTypes.has("cancellation") ? [] : cancellationsForDay(selectedDayIso);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setSelectedDayIso(null)}>
            <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold capitalize text-slate-900">
                  {dayDate.toLocaleDateString(language === "en" ? "en-GB" : "nb-NO", { weekday: "long", day: "numeric", month: "long" })}
                </h2>
                <button onClick={() => setSelectedDayIso(null)} className="text-sm text-slate-400 hover:text-slate-600">
                  {t("kalender.close")}
                </button>
              </div>

              {visibleAbsences.length === 0 &&
              visibleServices.length === 0 &&
              visibleCancellations.length === 0 ? (
                <p className="text-sm text-slate-400">{t("kalender.noEntriesForDay")}</p>
              ) : (
                <div className="space-y-3">
                  {visibleAbsences.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{t("kalender.absenceHeading")}</p>
                      <div className="space-y-1">
                        {visibleAbsences.map((a) =>
                          editingAbsenceId === a.id ? (
                            <div key={a.id} className="space-y-2 rounded-lg bg-slate-50 p-3">
                              <p className="text-xs font-medium text-slate-600">
                                {profiles[a.user_id]?.full_name ?? t("kalender.unknown")}
                              </p>
                              <select
                                value={editAbsenceType}
                                onChange={(e) => setEditAbsenceType(e.target.value as AbsenceType)}
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                              >
                                {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[])
                                  .filter((value) => isAdmin || !ADMIN_ONLY_ABSENCE_TYPES.includes(value))
                                  .map((value) => (
                                    <option key={value} value={value}>
                                      {t(`absenceType.${value}`)}
                                    </option>
                                  ))}
                              </select>
                              <div className="flex items-center gap-2">
                                <label className="w-8 text-xs text-slate-500">{t("kalender.fromDate")}</label>
                                <input
                                  type="date"
                                  value={editAbsenceStartDate}
                                  onChange={(e) => setEditAbsenceStartDate(e.target.value)}
                                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="w-8 text-xs text-slate-500">{t("kalender.toDate")}</label>
                                <input
                                  type="date"
                                  min={editAbsenceStartDate}
                                  value={editAbsenceEndDate}
                                  onChange={(e) => setEditAbsenceEndDate(e.target.value)}
                                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                                />
                              </div>
                              <input
                                type="text"
                                value={editAbsenceNote}
                                onChange={(e) => setEditAbsenceNote(e.target.value)}
                                placeholder={t("sammendrag.noteOptional")}
                                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                              />
                              {editAbsenceError && <p className="text-xs text-red-600">{editAbsenceError}</p>}
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={cancelEditAbsence}
                                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                >
                                  {t("reasonDialog.cancel")}
                                </button>
                                <button
                                  onClick={requestSaveEditAbsence}
                                  className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-black hover:brightness-90"
                                >
                                  {t("common.save")}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div key={a.id} className="flex items-center gap-2 text-sm text-slate-700">
                              <span className={`h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[a.type]}`} />
                              {profiles[a.user_id]?.full_name ?? t("kalender.unknown")}
                              <span className="text-slate-400">— {t(`absenceType.${a.type}`)}</span>
                              {canManageAbsence(a) && (
                                <span className="ml-auto flex shrink-0 gap-2">
                                  <button
                                    onClick={() => startEditAbsence(a)}
                                    className="text-xs text-slate-400 hover:text-brand-dark"
                                  >
                                    {t("common.edit")}
                                  </button>
                                  <button
                                    onClick={() => setPendingDeleteAbsenceId(a.id)}
                                    className="text-xs text-slate-400 hover:text-red-600"
                                  >
                                    {t("common.delete")}
                                  </button>
                                </span>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                  {visibleServices.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{t("kalender.serviceHeading")}</p>
                      <div className="space-y-1">
                        {visibleServices.map((b) => (
                          <div key={b.id} className="flex items-center gap-2 text-sm text-slate-700">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${SERVICE_DOT}`} />
                            <Link href={`/bil/${b.vehicle_id}`} className="hover:text-brand-dark hover:underline">
                              {vehicles[b.vehicle_id] ? vehicleLabel(vehicles[b.vehicle_id]) : t("kalender.unknown")}
                            </Link>
                            {b.note && <span className="text-slate-400">— {b.note}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {visibleCancellations.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">{t("kalender.cancellationHeading")}</p>
                      <div className="space-y-1">
                        {visibleCancellations.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                            <span className={`h-2 w-2 shrink-0 rounded-full ${CANCEL_DOT}`} />
                            {routeById[c.route_id]?.name ?? t("kalender.unknown")}
                            {c.note && <span className="text-slate-400">— {c.note}</span>}
                            {isStaff && (
                              <button
                                onClick={() => setPendingRemoveCancellationId(c.id)}
                                className="ml-auto text-xs text-slate-400 hover:text-red-600"
                              >
                                {t("common.delete")}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isStaff && (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setAddMode(addMode === "fravaer" ? null : "fravaer")}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {t("kalender.showAddAbsence")}
                    </button>
                    <button
                      onClick={() => setAddMode(addMode === "verksted" ? null : "verksted")}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {t("kalender.showAddService")}
                    </button>
                    <button
                      onClick={() => setAddMode(addMode === "innstill" ? null : "innstill")}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {t("kalender.showAddCancellation")}
                    </button>
                  </div>

                  {addMode === "fravaer" && (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                      <select
                        value={absenceEmployeeId}
                        onChange={(e) => setAbsenceEmployeeId(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">{t("common.noneSelected")}</option>
                        {employeesForFilter
                          .sort((a, b) => a.full_name.localeCompare(b.full_name))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.full_name}
                            </option>
                          ))}
                      </select>
                      <select
                        value={absenceType}
                        onChange={(e) => setAbsenceType(e.target.value as AbsenceType)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[])
                          .filter((value) => isAdmin || !ADMIN_ONLY_ABSENCE_TYPES.includes(value))
                          .map((value) => (
                            <option key={value} value={value}>
                              {t(`absenceType.${value}`)}
                            </option>
                          ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500">{t("kalender.toDate")}</label>
                        <input
                          type="date"
                          min={selectedDayIso}
                          value={absenceEndDate}
                          onChange={(e) => setAbsenceEndDate(e.target.value)}
                          className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <input
                        type="text"
                        value={absenceNote}
                        onChange={(e) => setAbsenceNote(e.target.value)}
                        placeholder={t("sammendrag.noteOptional")}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={handleAddAbsence}
                        disabled={saving}
                        className="w-full rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                      >
                        {saving ? t("common.saving") : t("kalender.add")}
                      </button>
                    </div>
                  )}

                  {addMode === "verksted" && (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                      <select
                        value={serviceVehicleId}
                        onChange={(e) => setServiceVehicleId(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">{t("common.noneSelected")}</option>
                        {vehiclesForFilter.map((v) => (
                          <option key={v.id} value={v.id}>
                            {vehicleLabel(v)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={serviceTime}
                        onChange={(e) => setServiceTime(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        value={serviceNote}
                        onChange={(e) => setServiceNote(e.target.value)}
                        placeholder={t("sammendrag.noteOptional")}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={handleAddService}
                        disabled={saving}
                        className="w-full rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                      >
                        {saving ? t("common.saving") : t("kalender.add")}
                      </button>
                    </div>
                  )}

                  {addMode === "innstill" && (
                    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                      <select
                        value={cancelRouteId}
                        onChange={(e) => setCancelRouteId(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">{t("common.noneSelected")}</option>
                        {routesForFilter.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={cancelNote}
                        onChange={(e) => setCancelNote(e.target.value)}
                        placeholder={t("sammendrag.noteOptional")}
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={handleAddCancellation}
                        disabled={saving}
                        className="w-full rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                      >
                        {saving ? t("common.saving") : t("kalender.add")}
                      </button>
                    </div>
                  )}

                  {formError && <p className="text-xs text-red-600">{formError}</p>}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
    </div>
  );
}

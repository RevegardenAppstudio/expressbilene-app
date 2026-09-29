"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { vehicleLabel, type Department, type Route, type TimeEntry, type UserRole, type Vehicle, type VehicleServiceBooking } from "@/lib/types";
import { isBusinessDay, toIsoDate } from "@/lib/calendar";
import { logAuditEvent } from "@/lib/auditLog";
import ReasonDialog from "@/components/ReasonDialog";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function todayIso() {
  return toIsoDate(new Date());
}

function minEditableDate() {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return toIsoDate(d);
}

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

function toHHMM(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

type Mode = "punch" | "times";

export default function TimerPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [openPunch, setOpenPunch] = useState<TimeEntry | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [todaysServiceBookings, setTodaysServiceBookings] = useState<VehicleServiceBooking[]>([]);
  const [myDepartmentId, setMyDepartmentId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("punch");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("07:00");
  const [endTime, setEndTime] = useState("15:00");
  const [description, setDescription] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartTime, setEditStartTime] = useState("07:00");
  const [editEndTime, setEditEndTime] = useState("15:00");
  const [editDescription, setEditDescription] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data }, { data: deps }, { data: rts }, { data: vhs }, { data: bookingData }, { data: myProfile }] = await Promise.all([
      supabase
        .from("time_entries")
        .select("*")
        .eq("user_id", user.id)
        .order("entry_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabase.from("departments").select("*").order("name"),
      supabase.from("routes").select("*").order("name"),
      supabase.from("vehicles").select("*").order("name"),
      supabase.from("vehicle_service_bookings").select("*").eq("service_date", todayIso()),
      supabase.from("profiles").select("department_id, role").eq("id", user.id).single(),
    ]);

    if (data) {
      setEntries(data as TimeEntry[]);
      setOpenPunch((data as TimeEntry[]).find((e) => e.clock_in && !e.clock_out) ?? null);
    }
    if (deps) setDepartments(deps as Department[]);
    if (rts) setRoutes(rts as Route[]);
    if (vhs) setVehicles(vhs as Vehicle[]);
    if (bookingData) setTodaysServiceBookings(bookingData as VehicleServiceBooking[]);
    if (myProfile) {
      setMyDepartmentId(myProfile.department_id);
      setMyRole(myProfile.role as UserRole);
      if (myProfile.department_id) setDepartmentId(myProfile.department_id);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

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
      const msg = t("timer.vehicleInUseError");
      setError(msg);
      showToast(msg, "error");
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("time_entries").insert({
      user_id: user.id,
      entry_date: todayIso(),
      clock_in: new Date().toISOString(),
      department_id: departmentId || null,
      route_id: routeId || null,
      vehicle_id: vehicleId || null,
      description: description.trim() || null,
    });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("overlapping_time_entry")
        ? t("timer.overlapError")
        : error.code === "23505"
        ? t("timer.vehicleInUseError")
        : t("timer.clockInFailed");
      setError(msg);
      showToast(msg, "error");
      return;
    }
    setDescription("");
    showToast(t("timer.clockedIn"));
    load();
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
      showToast(t("timer.clockOutFailed"), "error");
      return;
    }
    showToast(t("timer.clockedOut"));
    load();
  }

  async function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const base: Record<string, unknown> = {
      user_id: user.id,
      entry_date: entryDate,
      department_id: departmentId || null,
      route_id: routeId || null,
      vehicle_id: vehicleId || null,
      description: description.trim() || null,
    };

    const clockIn = new Date(`${entryDate}T${startTime}:00`);
    const clockOut = new Date(`${entryDate}T${endTime}:00`);
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
      const msg = error.message.includes("overlapping_time_entry")
        ? t("timer.overlapError")
        : error.message.includes("row-level security")
        ? t("timer.threeDayLimitError")
        : t("timer.saveEntryFailed");
      setError(msg);
      showToast(msg, "error");
      return;
    }

    setDescription("");
    showToast(t("timer.entryRegistered"));
    load();
  }

  function startEdit(entry: TimeEntry) {
    setEditingId(entry.id);
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

  async function logCorrection(entryId: string, action: "time_entry.corrected" | "time_entry.deleted", reason: string, details: string) {
    await logAuditEvent(supabase, { action, targetType: "time_entries", targetId: entryId, reason, details });
  }

  async function confirmSaveEdit(reason: string) {
    const id = pendingSaveId;
    setPendingSaveId(null);
    if (!id) return;

    const original = entries.find((e) => e.id === id);
    if (!original) return;

    const clockIn = new Date(`${original.entry_date}T${editStartTime}:00`);
    const clockOut = new Date(`${original.entry_date}T${editEndTime}:00`);
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
      const msg = error.message.includes("overlapping_time_entry") ? t("timer.overlapError") : t("timer.saveEditFailed");
      setError(msg);
      showToast(msg, "error");
      return;
    }

    const oldTimes = original.clock_in && original.clock_out
      ? `${formatTime(original.clock_in)}–${formatTime(original.clock_out)}`
      : `${original.hours ?? "?"} t`;
    await logCorrection(
      id,
      "time_entry.corrected",
      reason,
      `Klokkeslett endret fra ${oldTimes} til ${editStartTime}–${editEndTime}`
    );

    setEditingId(null);
    showToast(t("timer.entryUpdated"));
    load();
  }

  async function confirmDelete(reason: string) {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    if (!id) return;

    const original = entries.find((e) => e.id === id);
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) {
      setError(t("timer.deleteFailed"));
      showToast(t("timer.deleteFailed"), "error");
      return;
    }

    await logCorrection(id, "time_entry.deleted", reason, `Slettet registrering på ${original?.entry_date} (${original?.hours ?? "?"} t)`);
    showToast(t("timer.entryDeleted"));
    load();
  }

  const weekTotal = entries
    .filter((e) => {
      const d = new Date(e.entry_date + "T00:00:00");
      const now = new Date();
      const dayOfWeek = (now.getDay() + 6) % 7;
      const monday = new Date(now);
      monday.setDate(now.getDate() - dayOfWeek);
      monday.setHours(0, 0, 0, 0);
      return d >= monday;
    })
    .reduce((sum, e) => sum + Number(e.hours ?? 0), 0);

  const routesForDepartment = departmentId ? routes.filter((r) => r.department_id === departmentId) : routes;
  const vehiclesForDepartment = departmentId ? vehicles.filter((v) => v.department_id === departmentId) : vehicles;
  const vehicleServiceToday = vehicleId ? todaysServiceBookings.find((b) => b.vehicle_id === vehicleId) : undefined;
  const myDepartmentName = myDepartmentId ? departments.find((d) => d.id === myDepartmentId)?.name : null;
  const vehicleName = (id: string | null) => {
    const v = id ? vehicles.find((v) => v.id === id) : null;
    return v ? vehicleLabel(v) : null;
  };

  const isSjafor = myRole === "sjafor";
  const todayIsBusinessDay = isBusinessDay(new Date());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("timer.title")}</h1>
        <p className="text-sm text-slate-500">{t("timer.thisWeek", { hours: weekTotal.toFixed(1) })}</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("timer.department")}</label>
            {myDepartmentId ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-600">
                {myDepartmentName ?? "…"}
              </p>
            ) : (
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setRouteId("");
                }}
                className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">{t("common.noneSelected")}</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("timer.route")}</label>
            <select
              value={routeId}
              onChange={(e) => setRouteId(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">{t("common.noneSelected")}</option>
              {routesForDepartment.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!isSjafor && (
          <div className="mb-4 flex gap-1 rounded-md bg-slate-100 p-1 text-sm">
            {(
              [
                ["punch", t("timer.modePunch")],
                ["times", t("timer.modeTimes")],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded px-2 py-1.5 font-medium transition-colors ${
                  mode === m ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {mode === "punch" || isSjafor ? (
          <div className="text-center">
            {openPunch ? (
              <>
                <p className="mb-3 text-sm text-slate-600">
                  {t("timer.clockedInAt", { time: formatTime(openPunch.clock_in!) })}
                </p>
                <button
                  onClick={handleClockOut}
                  disabled={saving}
                  className="w-full rounded-md bg-brand px-4 py-3 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                >
                  {saving ? "…" : t("timer.clockOut")}
                </button>
              </>
            ) : isSjafor && !todayIsBusinessDay ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500">
                {t("timer.closedForBusinessDay")}
              </p>
            ) : (
              <>
                <div className="mb-3 flex gap-2">
                  <select
                    value={vehicleId}
                    onChange={(e) => setVehicleId(e.target.value)}
                    className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  >
                    <option value="">{t("timer.vehicleSelect")}</option>
                    {vehiclesForDepartment.map((v) => (
                      <option key={v.id} value={v.id}>
                        {vehicleLabel(v)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder={t("timer.noteOptional")}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {vehicleServiceToday && (
                  <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
                    {t("timer.vehicleServiceWarning")}
                    {vehicleServiceToday.service_time
                      ? ` ${t("timer.vehicleServiceWarningTime", { time: vehicleServiceToday.service_time.slice(0, 5) })}`
                      : ""}
                    {vehicleServiceToday.note ? `: ${vehicleServiceToday.note}` : ""}
                  </p>
                )}
                <button
                  onClick={handleClockIn}
                  disabled={saving || !routeId || !vehicleId}
                  className="w-full rounded-md bg-brand px-4 py-3 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
                >
                  {saving ? "…" : t("timer.clockIn")}
                </button>
                {!routeId ? (
                  <p className="mt-2 text-xs text-slate-400">{t("timer.selectRouteHint")}</p>
                ) : !vehicleId ? (
                  <p className="mt-2 text-xs text-slate-400">{t("timer.selectVehicleHint")}</p>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("timer.date")}</label>
                <input
                  type="date"
                  required
                  min={minEditableDate()}
                  max={todayIso()}
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("timer.fromTime")}</label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("timer.toTime")}</label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("timer.vehicleOptional")}</label>
                <select
                  value={vehicleId}
                  onChange={(e) => setVehicleId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">{t("common.noneSelected")}</option>
                  {vehiclesForDepartment.map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("timer.noteOptional")}</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60 sm:w-auto"
            >
              {saving ? t("common.saving") : t("timer.register")}
            </button>
          </form>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">{t("timer.date")}</th>
              <th className="px-4 py-2">{t("timer.hoursColumn")}</th>
              <th className="px-4 py-2">{t("timer.timeColumn")}</th>
              <th className="px-4 py-2">{t("timer.vehicleColumn")}</th>
              <th className="px-4 py-2">{t("timer.noteColumn")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("common.loading")}
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("timer.noEntries")}
                </td>
              </tr>
            ) : (
              entries.map((entry) =>
                editingId === entry.id ? (
                  <tr key={entry.id} className="border-b border-slate-100 bg-slate-50 last:border-0">
                    <td className="px-4 py-2 capitalize" data-label={t("timer.date")}>{formatDate(entry.entry_date)}</td>
                    <td className="px-4 py-2 text-xs text-slate-400" data-label={t("timer.hoursColumn")}>{t("timer.calculating")}</td>
                    <td className="px-4 py-2" data-label={t("timer.timeColumn")}>
                      <div className="flex items-center gap-1">
                        {isSjafor ? (
                          <span
                            className="w-24 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-500"
                            title={t("timer.clockInLocked")}
                          >
                            {editStartTime}
                          </span>
                        ) : (
                          <input
                            type="time"
                            value={editStartTime}
                            onChange={(e) => setEditStartTime(e.target.value)}
                            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                        )}
                        <span className="text-slate-400">–</span>
                        <input
                          type="time"
                          value={editEndTime}
                          onChange={(e) => setEditEndTime(e.target.value)}
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("timer.vehicleColumn")}>{vehicleName(entry.vehicle_id) || "—"}</td>
                    <td className="px-4 py-2" data-label={t("timer.noteColumn")}>
                      <input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                      <button onClick={() => setPendingSaveId(entry.id)} className="mr-2 text-xs font-medium text-brand-dark hover:text-brand-dark">
                        {t("common.save")}
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">
                        {t("common.cancel")}
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 capitalize" data-label={t("timer.date")}>{formatDate(entry.entry_date)}</td>
                    <td className="px-4 py-2" data-label={t("timer.hoursColumn")}>
                      {entry.hours != null ? `${Number(entry.hours).toFixed(1)} ${t("timer.hoursShort")}` : t("timer.inProgress")}
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("timer.timeColumn")}>
                      {entry.clock_in ? formatTime(entry.clock_in) : "—"}
                      {entry.clock_out ? ` – ${formatTime(entry.clock_out)}` : entry.clock_in ? " – …" : ""}
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("timer.vehicleColumn")}>
                      {entry.vehicle_id ? (
                        <Link href={`/bil/${entry.vehicle_id}`} className="hover:text-brand-dark hover:underline">
                          {vehicleName(entry.vehicle_id) || "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("timer.noteColumn")}>{entry.description || "—"}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap" data-label="">
                      {entry.hours != null && (
                        <button onClick={() => startEdit(entry)} className="mr-3 text-xs text-slate-400 hover:text-brand-dark">
                          {t("common.edit")}
                        </button>
                      )}
                      <button onClick={() => setPendingDeleteId(entry.id)} className="text-xs text-slate-400 hover:text-red-600">
                        {t("common.delete")}
                      </button>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}

"use client";

import { useEffect, useState, FormEvent, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ABSENCE_TYPE_LABELS, ADMIN_ONLY_ABSENCE_TYPES, type Absence, type AbsenceType } from "@/lib/types";
import { toIsoDate, daysOverlapWithYear } from "@/lib/calendar";
import ConfirmDialog from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

function todayIso() {
  return toIsoDate(new Date());
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const STATUS_STYLES: Record<string, string> = {
  venter: "bg-amber-100 text-amber-800",
  godkjent: "bg-green-100 text-green-800",
  avslatt: "bg-red-100 text-red-800",
};

export default function FravaerPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const QUICK_SICK_TYPES: { type: AbsenceType; label: string; confirmTitle: string }[] = [
    { type: "sykdom_egenmelding", label: t("fravaer.quickSickToday"), confirmTitle: t("fravaer.confirmSickTitle") },
    { type: "sykt_barn", label: t("fravaer.quickSickChildToday"), confirmTitle: t("fravaer.confirmSickChildTitle") },
  ];
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<AbsenceType>("sykdom_egenmelding");
  const [isAdmin, setIsAdmin] = useState(false);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [pendingQuickSick, setPendingQuickSick] = useState<AbsenceType | null>(null);
  const [vacationQuota, setVacationQuota] = useState<number | null>(null);
  const [vacationUsed, setVacationUsed] = useState<number | null>(null);
  const [egenmeldingPeriods, setEgenmeldingPeriods] = useState<number | null>(null);

  const loadAbsences = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const currentYear = new Date().getFullYear();
    const [{ data }, { data: profile }, { data: used }, { data: egenmelding }] = await Promise.all([
      supabase.from("absences").select("*").eq("user_id", user.id).order("start_date", { ascending: false }).limit(30),
      supabase.from("profiles").select("vacation_days_per_year, role").eq("id", user.id).single(),
      supabase.rpc("vacation_days_used", { p_user_id: user.id, p_year: currentYear }),
      supabase.rpc("egenmelding_usage", { p_user_id: user.id }),
    ]);

    if (data) setAbsences(data as Absence[]);
    if (profile) {
      setVacationQuota(profile.vacation_days_per_year);
      setIsAdmin(profile.role === "admin");
    }
    if (typeof used === "number") setVacationUsed(used);
    if (egenmelding && egenmelding[0]) setEgenmeldingPeriods(egenmelding[0].period_count);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (endDate < startDate) {
      setError(t("fravaer.endBeforeStartError"));
      return;
    }

    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("absences").insert({
      user_id: user.id,
      type,
      start_date: startDate,
      end_date: endDate,
      note: note.trim() || null,
    });

    setSaving(false);

    if (error) {
      const msg = error.message.includes("duplicate_absence") ? t("fravaer.overlapError") : t("fravaer.submitFailed");
      setError(msg);
      showToast(msg, "error");
      return;
    }

    setNote("");
    showToast(t("fravaer.submitted"));
    loadAbsences();
  }

  async function handleCancel(id: string) {
    const { error } = await supabase.from("absences").delete().eq("id", id);
    if (!error) {
      setAbsences((prev) => prev.filter((a) => a.id !== id));
      showToast(t("fravaer.withdrawn"));
    } else {
      showToast(t("fravaer.withdrawFailed"), "error");
    }
  }

  async function confirmQuickSick() {
    const sickType = pendingQuickSick;
    setPendingQuickSick(null);
    if (!sickType) return;

    setError(null);
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const today = todayIso();
    const { error } = await supabase.from("absences").insert({
      user_id: user.id,
      type: sickType,
      start_date: today,
      end_date: today,
    });
    setSaving(false);
    if (error) {
      const msg = error.message.includes("duplicate_absence") ? t("fravaer.overlapError") : t("fravaer.sickSaveFailed");
      setError(msg);
      showToast(msg, "error");
      return;
    }
    showToast(t("fravaer.sickSaved"));
    loadAbsences();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("fravaer.title")}</h1>
        <p className="text-sm text-slate-500">{t("fravaer.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {QUICK_SICK_TYPES.map((q) => (
          <button
            key={q.type}
            onClick={() => setPendingQuickSick(q.type)}
            disabled={saving}
            className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
          >
            {q.label}
            <div className="mt-0.5 text-xs font-normal text-amber-700">{t("fravaer.quickSickHint")}</div>
          </button>
        ))}
      </div>

      {egenmeldingPeriods != null && (
        <p className={`text-xs ${egenmeldingPeriods >= 4 ? "font-medium text-amber-700" : "text-slate-500"}`}>
          {t("fravaer.egenmeldingUsage", { used: egenmeldingPeriods, quota: 4 })}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("fravaer.type")}</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AbsenceType)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("fravaer.from")}</label>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("fravaer.to")}</label>
            <input
              type="date"
              required
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>
        {type === "ferie" && vacationQuota != null && vacationUsed != null && (
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500">
              {t("fravaer.vacationUsage", {
                used: vacationUsed,
                quota: vacationQuota,
                year: new Date().getFullYear(),
                remaining: Math.max(vacationQuota - vacationUsed, 0),
              })}
            </p>
            {(() => {
              const requestedDays = daysOverlapWithYear(startDate, endDate, new Date(startDate).getFullYear());
              const wouldExceed = vacationUsed + requestedDays > vacationQuota;
              return wouldExceed ? (
                <p className="mt-1 text-xs font-medium text-amber-700">
                  {t("fravaer.vacationExceeded", { days: requestedDays })}
                </p>
              ) : null;
            })()}
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("fravaer.comment")}</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
          >
            {saving ? t("fravaer.sending") : t("fravaer.send")}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm sm:p-0">
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">{t("fravaer.period")}</th>
              <th className="px-4 py-2">{t("fravaer.type")}</th>
              <th className="px-4 py-2">{t("fravaer.status")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  {t("common.loading")}
                </td>
              </tr>
            ) : absences.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  {t("fravaer.noApplications")}
                </td>
              </tr>
            ) : (
              absences.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2" data-label={t("fravaer.period")}>
                    {formatDate(a.start_date)}
                    {a.end_date !== a.start_date ? ` – ${formatDate(a.end_date)}` : ""}
                  </td>
                  <td className="px-4 py-2 text-slate-500" data-label={t("fravaer.type")}>{t(`absenceType.${a.type}`)}</td>
                  <td className="px-4 py-2" data-label={t("fravaer.status")}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[a.status]}`}>
                      {t(`absenceStatus.${a.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right" data-label="">
                    {a.status === "venter" && (
                      <button
                        onClick={() => handleCancel(a.id)}
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        {t("fravaer.withdraw")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pendingQuickSick && (
        <ConfirmDialog
          title={QUICK_SICK_TYPES.find((q) => q.type === pendingQuickSick)?.confirmTitle ?? ""}
          message={t("fravaer.confirmSickMessage", { date: formatDate(todayIso()) })}
          confirmLabel={t("fravaer.confirmSickConfirm")}
          onConfirm={confirmQuickSick}
          onCancel={() => setPendingQuickSick(null)}
        />
      )}
    </div>
  );
}

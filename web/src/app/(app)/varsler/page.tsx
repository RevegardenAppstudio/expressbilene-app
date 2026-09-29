"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  type Absence,
  type AppNotification,
  type AuditLogEntry,
  type EventType,
  type IncidentEvent,
  type Profile,
  type Vehicle,
  vehicleLabel,
} from "@/lib/types";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { daysOverlapWithYear } from "@/lib/calendar";

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const ABSENCE_STATUS_STYLES: Record<string, string> = {
  venter: "bg-amber-100 text-amber-800",
  godkjent: "bg-green-100 text-green-800",
  avslatt: "bg-red-100 text-red-800",
};

const TYPE_ICON: Record<string, string> = {
  sykdom: "🤒",
  egenmelding_grense: "⚠️",
  hendelse: "🚨",
  service_paaminnelse: "🔧",
};

const EVENT_TYPE_STYLES: Record<EventType, string> = {
  utforkjoring: "bg-red-100 text-red-800",
  biltrobbel: "bg-orange-100 text-orange-800",
  verksted_service: "bg-sky-100 text-sky-800",
  annet: "bg-slate-100 text-slate-700",
};

function SykefravaerTab() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [absences, setAbsences] = useState<Absence[]>([]);
  const [absenceProfiles, setAbsenceProfiles] = useState<Record<string, Profile>>({});
  const [vacationUsedByUser, setVacationUsedByUser] = useState<Record<string, number>>({});
  const [showAllAbsences, setShowAllAbsences] = useState(false);
  const [loadingAbsences, setLoadingAbsences] = useState(true);

  const loadAbsences = useCallback(async () => {
    setLoadingAbsences(true);
    let query = supabase.from("absences").select("*").order("start_date", { ascending: false });
    if (!showAllAbsences) query = query.eq("status", "venter");

    const currentYear = new Date().getFullYear();
    const [{ data: absenceData }, { data: profileData }, { data: vacationData }] = await Promise.all([
      query,
      supabase.from("profiles").select("id, email, full_name, role, vacation_days_per_year, created_at"),
      supabase
        .from("absences")
        .select("user_id, start_date, end_date")
        .eq("type", "ferie")
        .in("status", ["venter", "godkjent"]),
    ]);

    if (absenceData) setAbsences(absenceData as Absence[]);
    if (profileData) {
      const map: Record<string, Profile> = {};
      for (const p of profileData as Profile[]) map[p.id] = p;
      setAbsenceProfiles(map);
    }
    if (vacationData) {
      const usedMap: Record<string, number> = {};
      for (const row of vacationData as { user_id: string; start_date: string; end_date: string }[]) {
        const days = daysOverlapWithYear(row.start_date, row.end_date, currentYear);
        usedMap[row.user_id] = (usedMap[row.user_id] ?? 0) + days;
      }
      setVacationUsedByUser(usedMap);
    }
    setLoadingAbsences(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAllAbsences]);

  useEffect(() => {
    loadAbsences();
  }, [loadAbsences]);

  async function handleDecision(id: string, status: "godkjent" | "avslatt") {
    const { error } = await supabase.from("absences").update({ status }).eq("id", id);
    if (!error) {
      showToast(status === "godkjent" ? t("varsler.approved") : t("varsler.declined"));
      loadAbsences();
    } else {
      showToast(t("varsler.updateFailed"), "error");
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{t("varsler.applications")}</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showAllAbsences} onChange={(e) => setShowAllAbsences(e.target.checked)} />
            {t("varsler.showAll")}
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">{t("varsler.employee")}</th>
                <th className="px-4 py-2">{t("fravaer.period")}</th>
                <th className="px-4 py-2">{t("fravaer.type")}</th>
                <th className="px-4 py-2">{t("varsler.comment")}</th>
                <th className="px-4 py-2">{t("fravaer.status")}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {loadingAbsences ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : absences.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    {t("varsler.noApplications")}
                  </td>
                </tr>
              ) : (
                absences.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-800" data-label={t("varsler.employee")}>
                      {absenceProfiles[a.user_id]?.full_name ?? t("varsler.unknown")}
                    </td>
                    <td className="px-4 py-2" data-label={t("fravaer.period")}>
                      {formatDate(a.start_date)}
                      {a.end_date !== a.start_date ? ` – ${formatDate(a.end_date)}` : ""}
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("fravaer.type")}>
                      {t(`absenceType.${a.type}`)}
                      {a.type === "ferie" && absenceProfiles[a.user_id] && (
                        <div
                          className={`mt-0.5 text-xs ${
                            (vacationUsedByUser[a.user_id] ?? 0) > absenceProfiles[a.user_id].vacation_days_per_year
                              ? "font-medium text-amber-700"
                              : "text-slate-400"
                          }`}
                        >
                          {t("varsler.vacationDaysUsed", {
                            used: vacationUsedByUser[a.user_id] ?? 0,
                            quota: absenceProfiles[a.user_id].vacation_days_per_year,
                          })}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("varsler.comment")}>{a.note || "—"}</td>
                    <td className="px-4 py-2" data-label={t("fravaer.status")}>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ABSENCE_STATUS_STYLES[a.status]}`}>
                        {t(`absenceStatus.${a.status}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right" data-label="">
                      {a.status === "venter" && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleDecision(a.id, "godkjent")}
                            className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
                          >
                            {t("varsler.approve")}
                          </button>
                          <button
                            onClick={() => handleDecision(a.id, "avslatt")}
                            className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
                          >
                            {t("varsler.decline")}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AlleVarslerTab() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("notifications")
      .select("*")
      .in("type", ["sykdom", "egenmelding_grense", "hendelse", "service_paaminnelse"])
      .order("created_at", { ascending: false })
      .limit(100);
    if (!showArchived) query = query.is("archived_at", null);
    const { data } = await query;
    if (data) setNotifications(data as AppNotification[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleArchive(id: string) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("notifications")
      .update({ archived_at: new Date().toISOString(), archived_by: user.id })
      .eq("id", id);
    if (!error) {
      showToast(t("varsler.archivedToast"));
      load();
    } else {
      showToast(t("varsler.archiveFailed"), "error");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {t("varsler.showArchivedAlso")}
        </label>
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm text-slate-400">{t("common.loading")}</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-slate-400">{t("varsler.noNotifications")}</p>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span className="text-xl">{TYPE_ICON[n.type] ?? "🔔"}</span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                  <span className="whitespace-nowrap text-xs text-slate-400">{formatDateTime(n.created_at)}</span>
                </div>
                {n.body && <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>}
                {n.archived_at && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t("varsler.archivedAt", { time: formatDateTime(n.archived_at) })}
                  </p>
                )}
              </div>
              {!n.archived_at && (
                <button
                  onClick={() => handleArchive(n.id)}
                  className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                >
                  {t("varsler.archive")}
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function HendelserTab() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("events").select("*").order("occurred_at", { ascending: false });
    if (!showResolved) query = query.eq("resolved", false);

    const [{ data }, { data: profileData }, { data: vehicleData }] = await Promise.all([
      query,
      supabase.from("profiles").select("id, email, full_name, role, department_id, notifications_viewed_at, created_at"),
      supabase.from("vehicles").select("*"),
    ]);

    if (data) setEvents(data as IncidentEvent[]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showResolved]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleResolve(id: string) {
    const { error } = await supabase.from("events").update({ resolved: true }).eq("id", id);
    if (!error) {
      showToast(t("varsler.markedResolved"));
      load();
    } else {
      showToast(t("varsler.resolveFailed"), "error");
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        {t("varsler.showResolvedAlso")}
      </label>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">{t("hendelser.time")}</th>
              <th className="px-4 py-2">{t("varsler.driver")}</th>
              <th className="px-4 py-2">{t("hendelser.type")}</th>
              <th className="px-4 py-2">{t("hendelser.vehicle")}</th>
              <th className="px-4 py-2">{t("hendelser.note")}</th>
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
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                  {t("varsler.noEventsToShow")}
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2" data-label={t("hendelser.time")}>{formatDateTime(ev.occurred_at)}</td>
                  <td className="px-4 py-2 font-medium text-slate-800" data-label={t("varsler.driver")}>
                    {profiles[ev.user_id]?.full_name ?? t("varsler.unknown")}
                  </td>
                  <td className="px-4 py-2" data-label={t("hendelser.type")}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_TYPE_STYLES[ev.type]}`}>
                      {t(`eventType.${ev.type}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500" data-label={t("hendelser.vehicle")}>
                    {ev.vehicle_id ? (
                      <Link href={`/bil/${ev.vehicle_id}`} className="hover:text-brand-dark hover:underline">
                        {ev.vehicle_id && vehicles[ev.vehicle_id] ? vehicleLabel(vehicles[ev.vehicle_id]) : "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500" data-label={t("hendelser.note")}>{ev.note || "—"}</td>
                  <td className="px-4 py-2 text-right" data-label="">
                    {!ev.resolved && (
                      <button
                        onClick={() => handleResolve(ev.id)}
                        className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700"
                      >
                        {t("varsler.markResolved")}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const AUDIT_LOG_PAGE_SIZE = 20;

function EndringsloggTab() {
  const supabase = createClient();
  const { t } = useLanguage();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data }, { data: profileData }] = await Promise.all([
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).range(0, AUDIT_LOG_PAGE_SIZE),
      supabase.from("profiles").select("id, email, full_name, role, department_id, notifications_viewed_at, created_at"),
    ]);
    if (data) {
      setEntries(data.slice(0, AUDIT_LOG_PAGE_SIZE) as AuditLogEntry[]);
      setHasMore(data.length > AUDIT_LOG_PAGE_SIZE);
    }
    if (profileData) {
      const map: Record<string, Profile> = {};
      for (const p of profileData as Profile[]) map[p.id] = p;
      setProfiles(map);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadMore() {
    setLoadingMore(true);
    const { data } = await supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .range(entries.length, entries.length + AUDIT_LOG_PAGE_SIZE);
    setLoadingMore(false);
    if (data) {
      setEntries((prev) => [...prev, ...(data.slice(0, AUDIT_LOG_PAGE_SIZE) as AuditLogEntry[])]);
      setHasMore(data.length > AUDIT_LOG_PAGE_SIZE);
    }
  }

  function performedByFor(entry: AuditLogEntry) {
    return entry.actor_id ? profiles[entry.actor_id]?.full_name ?? t("varsler.unknown") : t("varsler.system");
  }

  const query = search.trim().toLowerCase();
  const filteredEntries = query
    ? entries.filter((entry) => {
        const haystack = [performedByFor(entry), t(`auditAction.${entry.action}`), entry.details, entry.reason]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
    : entries;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("varsler.changeLogDescription")}</p>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("varsler.searchChangeLog")}
        className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm sm:w-auto"
      />
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">{t("hendelser.time")}</th>
              <th className="px-4 py-2">{t("varsler.performedBy")}</th>
              <th className="px-4 py-2">{t("varsler.action")}</th>
              <th className="px-4 py-2">{t("varsler.details")}</th>
              <th className="px-4 py-2">{t("varsler.reason")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {t("common.loading")}
                </td>
              </tr>
            ) : filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                  {query ? t("varsler.noChangeLogMatches") : t("varsler.noChanges")}
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 whitespace-nowrap" data-label={t("hendelser.time")}>{formatDateTime(entry.created_at)}</td>
                  <td className="px-4 py-2" data-label={t("varsler.performedBy")}>{performedByFor(entry)}</td>
                  <td className="px-4 py-2 whitespace-nowrap" data-label={t("varsler.action")}>{t(`auditAction.${entry.action}`)}</td>
                  <td className="max-w-xs break-words px-4 py-2 text-slate-500" data-label={t("varsler.details")}>{entry.details || "—"}</td>
                  <td className="max-w-[10rem] break-words px-4 py-2 text-slate-500" data-label={t("varsler.reason")}>{entry.reason || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {!query && hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="w-full rounded-md border border-slate-300 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          {loadingMore ? t("common.loading") : t("varsler.loadMoreChangeLog")}
        </button>
      )}
    </div>
  );
}

type Tab = "sykefravaer" | "hendelser" | "allevarsler" | "endringslogg";

export default function VarslerPage() {
  const supabase = createClient();
  const { t } = useLanguage();
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState<Tab>("sykefravaer");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      setIsAdmin(data?.role === "admin");
      // Åpning av Varsler-siden (uansett hvilken fane) markerer varslene som
      // sett -- flyttet hit fra SykefravaerTab siden varsel-feeden nå bor i
      // sin egen fane (Alle varsler) og ikke lenger alltid vises først.
      await supabase.from("profiles").update({ notifications_viewed_at: new Date().toISOString() }).eq("id", user.id);
    })();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("varsler.title")}</h1>
        <p className="text-sm text-slate-500">{t("varsler.subtitle")}</p>
      </div>

      <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-sm w-fit">
        <button
          onClick={() => setTab("sykefravaer")}
          className={`rounded px-4 py-1.5 font-medium transition-colors ${
            tab === "sykefravaer" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
          }`}
        >
          {t("varsler.tabSykefravaer")}
        </button>
        <button
          onClick={() => setTab("hendelser")}
          className={`rounded px-4 py-1.5 font-medium transition-colors ${
            tab === "hendelser" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
          }`}
        >
          {t("varsler.tabHendelser")}
        </button>
        <button
          onClick={() => setTab("allevarsler")}
          className={`rounded px-4 py-1.5 font-medium transition-colors ${
            tab === "allevarsler" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
          }`}
        >
          {t("varsler.tabAlleVarsler")}
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab("endringslogg")}
            className={`rounded px-4 py-1.5 font-medium transition-colors ${
              tab === "endringslogg" ? "bg-white text-brand-dark shadow-sm" : "text-slate-500"
            }`}
          >
            {t("varsler.tabEndringslogg")}
          </button>
        )}
      </div>

      {tab === "sykefravaer" ? (
        <SykefravaerTab />
      ) : tab === "hendelser" ? (
        <HendelserTab />
      ) : tab === "allevarsler" ? (
        <AlleVarslerTab />
      ) : (
        <EndringsloggTab />
      )}
    </div>
  );
}

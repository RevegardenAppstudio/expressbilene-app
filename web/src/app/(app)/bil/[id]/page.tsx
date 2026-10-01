"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  vehicleLabel,
  type Department,
  type EventType,
  type IncidentEvent,
  type Profile,
  type Vehicle,
  type VehicleServiceBooking,
} from "@/lib/types";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useToast } from "@/components/Toast";

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("nb-NO", { day: "numeric", month: "short", year: "numeric" });
}

const EVENT_TYPE_STYLES: Record<EventType, string> = {
  utforkjoring: "bg-red-100 text-red-800",
  biltrobbel: "bg-orange-100 text-orange-800",
  verksted_service: "bg-sky-100 text-sky-800",
  annet: "bg-slate-100 text-slate-700",
};

const EVENT_PHOTO_BUCKET = "hendelse-bilder";

export default function BilPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [serviceBookings, setServiceBookings] = useState<VehicleServiceBooking[]>([]);
  const [canManageService, setCanManageService] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newServiceDate, setNewServiceDate] = useState("");
  const [newServiceTime, setNewServiceTime] = useState("");
  const [newServiceNote, setNewServiceNote] = useState("");
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const [{ data: vehicleData }, { data: eventData }, { data: bookingData }, meResult] = await Promise.all([
      supabase.from("vehicles").select("*").eq("id", params.id).single(),
      supabase.from("events").select("*").eq("vehicle_id", params.id).order("occurred_at", { ascending: false }),
      supabase.from("vehicle_service_bookings").select("*").eq("vehicle_id", params.id).order("service_date", { ascending: true }),
      user ? supabase.from("profiles").select("role, department_id").eq("id", user.id).single() : Promise.resolve({ data: null }),
    ]);

    const v = (vehicleData as Vehicle) ?? null;
    setVehicle(v);
    if (v?.department_id) {
      const { data: deptData } = await supabase.from("departments").select("*").eq("id", v.department_id).single();
      setDepartment((deptData as Department) ?? null);
    } else {
      setDepartment(null);
    }

    if (eventData) {
      setEvents(eventData as IncidentEvent[]);
      const userIds = Array.from(new Set((eventData as IncidentEvent[]).map((e) => e.user_id)));
      if (userIds.length > 0) {
        const { data: profileData } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        if (profileData) {
          const map: Record<string, Profile> = {};
          for (const p of profileData as Profile[]) map[p.id] = p as Profile;
          setProfiles(map);
        }
      }
      const imagePaths = (eventData as IncidentEvent[]).map((e) => e.image_path).filter((p): p is string => !!p);
      if (imagePaths.length > 0) {
        const { data: signed } = await supabase.storage.from(EVENT_PHOTO_BUCKET).createSignedUrls(imagePaths, 3600);
        if (signed) {
          const map: Record<string, string> = {};
          for (const s of signed) {
            if (s.signedUrl && s.path) map[s.path] = s.signedUrl;
          }
          setPhotoUrls(map);
        }
      }
    }
    if (bookingData) setServiceBookings(bookingData as VehicleServiceBooking[]);
    const myRole = meResult.data?.role;
    setCanManageService(myRole === "admin" || myRole === "moderator");
    setLoading(false);
  }, [supabase, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddServiceBooking() {
    setServiceError(null);
    if (!newServiceDate || !vehicle) return;
    setSavingService(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("vehicle_service_bookings")
      .insert({
        vehicle_id: vehicle.id,
        service_date: newServiceDate,
        service_time: newServiceTime || null,
        note: newServiceNote.trim() || null,
        created_by: user?.id ?? null,
      })
      .select()
      .single();
    setSavingService(false);
    if (error || !data) {
      setServiceError(t("bil.addServiceBookingFailed"));
      showToast(t("bil.addServiceBookingFailed"), "error");
      return;
    }
    setServiceBookings((prev) =>
      [...prev, data as VehicleServiceBooking].sort((a, b) => (a.service_date < b.service_date ? -1 : 1))
    );
    setNewServiceDate("");
    setNewServiceTime("");
    setNewServiceNote("");
    showToast(t("bil.serviceBookingAdded"));
  }

  async function handleDeleteServiceBooking(id: string) {
    const { error } = await supabase.from("vehicle_service_bookings").delete().eq("id", id);
    if (!error) {
      setServiceBookings((prev) => prev.filter((b) => b.id !== id));
      showToast(t("bil.serviceBookingDeleted"));
    } else {
      showToast(t("bil.deleteServiceBookingFailed"), "error");
    }
  }

  const unresolvedCount = useMemo(() => events.filter((e) => !e.resolved).length, [events]);

  if (loading) {
    return <p className="text-sm text-slate-400">{t("common.loading")}</p>;
  }

  if (!vehicle) {
    return <p className="text-sm text-slate-400">{t("bil.notFound")}</p>;
  }

  return (
    <div className="space-y-6">
      <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-brand-dark">
        {t("bil.back")}
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{vehicleLabel(vehicle)}</h1>
        <p className="mt-1 text-sm text-slate-500">{department?.name ?? t("bil.noDepartment")}</p>

        <div className="mt-5 flex gap-8">
          <div>
            <div className="text-2xl font-bold text-slate-900">{events.length}</div>
            <div className="text-xs text-slate-500">{t("bil.totalEvents")}</div>
          </div>
          <div>
            <div className={`text-2xl font-bold ${unresolvedCount > 0 ? "text-red-600" : "text-slate-900"}`}>{unresolvedCount}</div>
            <div className="text-xs text-slate-500">{t("bil.unresolved")}</div>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t("bil.serviceBookings")}</h2>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {canManageService && (
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("bil.serviceDate")}</label>
                <input
                  type="date"
                  value={newServiceDate}
                  onChange={(e) => setNewServiceDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("bil.serviceTime")}</label>
                <input
                  type="time"
                  value={newServiceTime}
                  onChange={(e) => setNewServiceTime(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("bil.serviceNote")}</label>
                <input
                  type="text"
                  value={newServiceNote}
                  onChange={(e) => setNewServiceNote(e.target.value)}
                  placeholder={t("bil.serviceNotePlaceholder")}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleAddServiceBooking}
                disabled={savingService || !newServiceDate}
                className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
              >
                {savingService ? t("common.saving") : t("bil.addServiceBooking")}
              </button>
            </div>
          )}

          {serviceError && <p className="text-sm text-red-600">{serviceError}</p>}

          {serviceBookings.length === 0 ? (
            <p className="text-sm text-slate-400">{t("bil.noServiceBookings")}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {serviceBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <span className="font-medium text-slate-800">
                      {formatDate(booking.service_date)}
                      {booking.service_time && ` ${t("timer.vehicleServiceWarningTime", { time: booking.service_time.slice(0, 5) })}`}
                    </span>
                    {booking.note && <span className="ml-2 text-slate-500">{booking.note}</span>}
                  </div>
                  {canManageService && (
                    <button
                      onClick={() => handleDeleteServiceBooking(booking.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      {t("common.delete")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">{t("bil.reportedEvents")}</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="responsive-table w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">{t("bil.time")}</th>
                <th className="px-4 py-2">{t("bil.reportedBy")}</th>
                <th className="px-4 py-2">{t("bil.type")}</th>
                <th className="px-4 py-2">{t("bil.note")}</th>
                <th className="px-4 py-2">{t("bil.photo")}</th>
                <th className="px-4 py-2">{t("bil.status")}</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    {t("bil.noEvents")}
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2" data-label={t("bil.time")}>{formatDateTime(ev.occurred_at)}</td>
                    <td className="px-4 py-2 font-medium text-slate-800" data-label={t("bil.reportedBy")}>
                      {profiles[ev.user_id]?.full_name ?? t("bil.unknown")}
                    </td>
                    <td className="px-4 py-2" data-label={t("bil.type")}>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_TYPE_STYLES[ev.type]}`}>
                        {t(`eventType.${ev.type}`)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("bil.note")}>{ev.note || "—"}</td>
                    <td className="px-4 py-2" data-label={t("bil.photo")}>
                      {ev.image_path && photoUrls[ev.image_path] ? (
                        <a href={photoUrls[ev.image_path]} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photoUrls[ev.image_path]}
                            alt=""
                            className="h-10 w-10 rounded-md border border-slate-200 object-cover hover:opacity-80"
                          />
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-500" data-label={t("bil.status")}>{ev.resolved ? t("bil.resolved") : t("bil.unresolved")}</td>
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

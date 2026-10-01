"use client";

import { useEffect, useState, FormEvent, ChangeEvent, useCallback, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { EVENT_TYPE_LABELS, vehicleLabel, type Department, type EventType, type IncidentEvent, type Vehicle } from "@/lib/types";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const EVENT_PHOTO_BUCKET = "hendelse-bilder";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("nb-NO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_STYLES: Record<EventType, string> = {
  utforkjoring: "bg-red-100 text-red-800",
  biltrobbel: "bg-orange-100 text-orange-800",
  verksted_service: "bg-sky-100 text-sky-800",
  annet: "bg-slate-100 text-slate-700",
};

export default function HendelserPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<EventType>("biltrobbel");
  const [note, setNote] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [myDepartmentId, setMyDepartmentId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data }, { data: deps }, { data: vhs }, { data: myProfile }] = await Promise.all([
      supabase.from("events").select("*").eq("user_id", user.id).order("occurred_at", { ascending: false }).limit(30),
      supabase.from("departments").select("*").order("name"),
      supabase.from("vehicles").select("*").order("name"),
      supabase.from("profiles").select("department_id").eq("id", user.id).single(),
    ]);

    if (data) {
      setEvents(data as IncidentEvent[]);
      const paths = (data as IncidentEvent[]).map((ev) => ev.image_path).filter((p): p is string => !!p);
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from(EVENT_PHOTO_BUCKET).createSignedUrls(paths, 3600);
        if (signed) {
          const map: Record<string, string> = {};
          for (const s of signed) {
            if (s.signedUrl && s.path) map[s.path] = s.signedUrl;
          }
          setPhotoUrls(map);
        }
      }
    }
    if (deps) setDepartments(deps as Department[]);
    if (vhs) setVehicles(vhs as Vehicle[]);
    if (myProfile) {
      setMyDepartmentId(myProfile.department_id);
      if (myProfile.department_id) setDepartmentId(myProfile.department_id);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setPhotoError(null);
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(t("hendelser.photoTooLarge"));
      e.target.value = "";
      return;
    }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    setPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let imagePath: string | null = null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(EVENT_PHOTO_BUCKET)
        .upload(path, photoFile, { contentType: photoFile.type || undefined });
      if (uploadError) {
        setSaving(false);
        setError(t("hendelser.uploadFailed"));
        showToast(t("hendelser.uploadFailed"), "error");
        return;
      }
      imagePath = path;
    }

    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      type,
      note: note.trim() || null,
      department_id: departmentId || null,
      vehicle_id: vehicleId || null,
      image_path: imagePath,
    });

    setSaving(false);
    if (error) {
      setError(t("hendelser.reportFailed"));
      showToast(t("hendelser.reportFailed"), "error");
      return;
    }
    setNote("");
    clearPhoto();
    showToast(t("hendelser.reported"));
    load();
  }

  const vehiclesForDepartment = departmentId ? vehicles.filter((v) => v.department_id === departmentId) : vehicles;
  const myDepartmentName = myDepartmentId ? departments.find((d) => d.id === myDepartmentId)?.name : null;
  const vehicleName = (id: string | null) => {
    const v = id ? vehicles.find((v) => v.id === id) : null;
    return v ? vehicleLabel(v) : null;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("hendelser.title")}</h1>
        <p className="text-sm text-slate-500">{t("hendelser.subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("hendelser.type")}</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as EventType)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {(Object.keys(EVENT_TYPE_LABELS) as EventType[]).map((value) => (
              <option key={value} value={value}>
                {t(`eventType.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("hendelser.department")}</label>
            {myDepartmentId ? (
              <p className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {myDepartmentName ?? "…"}
              </p>
            ) : (
              <select
                value={departmentId}
                onChange={(e) => {
                  setDepartmentId(e.target.value);
                  setVehicleId("");
                }}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("hendelser.vehicle")}</label>
            <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">{t("common.noneSelected")}</option>
              {vehiclesForDepartment.map((v) => (
                <option key={v.id} value={v.id}>
                  {vehicleLabel(v)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("hendelser.note")}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder={t("hendelser.notePlaceholder")}
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("hendelser.photo")} <span className="text-slate-400">{t("hendelser.photoOptional")}</span>
          </label>
          {photoPreview ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoPreview} alt="" className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
              <button
                type="button"
                onClick={clearPhoto}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {t("hendelser.removePhoto")}
              </button>
            </div>
          ) : (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-600 hover:file:bg-slate-100"
            />
          )}
          {photoError && <p className="mt-1 text-xs text-red-600">{photoError}</p>}
        </div>

        {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
          >
            {saving ? t("hendelser.sending") : t("hendelser.report")}
          </button>
          <p className="mt-1 text-xs text-slate-400">{t("hendelser.staffNotified")}</p>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="responsive-table w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">{t("hendelser.time")}</th>
              <th className="px-4 py-2">{t("hendelser.type")}</th>
              <th className="px-4 py-2">{t("hendelser.vehicle")}</th>
              <th className="px-4 py-2">{t("hendelser.note")}</th>
              <th className="px-4 py-2">{t("hendelser.photo")}</th>
              <th className="px-4 py-2">{t("hendelser.status")}</th>
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
                  {t("hendelser.noEvents")}
                </td>
              </tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2" data-label={t("hendelser.time")}>{formatDateTime(ev.occurred_at)}</td>
                  <td className="px-4 py-2" data-label={t("hendelser.type")}>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[ev.type]}`}>
                      {t(`eventType.${ev.type}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-500" data-label={t("hendelser.vehicle")}>
                    {ev.vehicle_id ? (
                      <Link href={`/bil/${ev.vehicle_id}`} className="hover:text-brand-dark hover:underline">
                        {vehicleName(ev.vehicle_id) || "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500" data-label={t("hendelser.note")}>{ev.note || "—"}</td>
                  <td className="px-4 py-2" data-label={t("hendelser.photo")}>
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
                  <td className="px-4 py-2 text-slate-500" data-label={t("hendelser.status")}>
                    {ev.resolved ? t("hendelser.resolved") : t("hendelser.unresolved")}
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

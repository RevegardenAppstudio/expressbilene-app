"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/Toast";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Release = { id: string; version_code: number; version_name: string; apk_path: string; notes: string | null; created_at: string };

export default function AppVersjonPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [releases, setReleases] = useState<Release[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [versionCode, setVersionCode] = useState("");
  const [versionName, setVersionName] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    setIsAdmin(me?.role === "admin");
    const { data } = await supabase
      .from("app_releases")
      .select("*")
      .eq("platform", "android")
      .order("version_code", { ascending: false });
    if (data) setReleases(data as Release[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePublish(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const code = Number(versionCode);
    if (!file || !Number.isInteger(code) || code <= 0 || !versionName.trim()) {
      setError(t("appVersion.fillAll"));
      return;
    }
    if (releases.some((r) => r.version_code >= code)) {
      setError(t("appVersion.mustBeHigher"));
      return;
    }
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const path = `android/ekspressbilene-${code}.apk`;
    const { error: uploadError } = await supabase.storage
      .from("app-releases")
      .upload(path, file, { contentType: "application/vnd.android.package-archive", upsert: false });
    if (uploadError) {
      setUploading(false);
      setError(uploadError.message);
      return;
    }
    const { error: insertError } = await supabase.from("app_releases").insert({
      version_code: code,
      version_name: versionName.trim(),
      apk_path: path,
      notes: notes.trim() || null,
      created_by: user?.id ?? null,
    });
    setUploading(false);
    if (insertError) {
      await supabase.storage.from("app-releases").remove([path]);
      setError(insertError.message);
      return;
    }
    setFile(null);
    setVersionCode("");
    setVersionName("");
    setNotes("");
    showToast(t("appVersion.published"));
    load();
  }

  if (isAdmin === null) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;
  if (!isAdmin) return <p className="text-sm text-slate-500">{t("appVersion.adminOnly")}</p>;

  const downloadPageUrl = typeof window !== "undefined" ? `${window.location.origin}/last-ned` : "/last-ned";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{t("appVersion.title")}</h1>
        <p className="text-sm text-slate-500">{t("appVersion.subtitle")}</p>
        <p className="mt-2 text-sm">
          <span className="text-slate-500">{t("appVersion.downloadLink")}: </span>
          <a href="/last-ned" className="font-medium text-brand-dark hover:underline">
            {downloadPageUrl}
          </a>
        </p>
      </div>

      <form onSubmit={handlePublish} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("appVersion.apkFile")}</label>
          <input
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("appVersion.versionCode")}</label>
            <input
              type="number"
              min={1}
              value={versionCode}
              onChange={(e) => setVersionCode(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400">{t("appVersion.versionCodeHint")}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("appVersion.versionName")}</label>
            <input
              type="text"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="1.0.1"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">{t("appVersion.notes")}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={uploading}
          className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-black hover:brightness-90 disabled:opacity-60"
        >
          {uploading ? t("appVersion.uploading") : t("appVersion.publish")}
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {releases.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-400">{t("appVersion.none")}</p>
        ) : (
          releases.map((r) => (
            <div key={r.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm last:border-0">
              <span className="font-medium text-slate-800">
                {r.version_name} <span className="text-xs font-normal text-slate-400">({r.version_code})</span>
              </span>
              <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString("nb-NO")}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Props = {
  title: string;
  message?: string;
  confirmLabel?: string;
  requireReason?: boolean;
  danger?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export default function ReasonDialog({
  title,
  message,
  confirmLabel,
  requireReason = false,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useLanguage();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    if (requireReason && !reason.trim()) {
      setError(t("reasonDialog.reasonRequired"));
      return;
    }
    onConfirm(reason.trim());
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {message && <p className="mt-1 text-sm text-slate-500">{message}</p>}

        <label className="mb-1 mt-4 block text-xs font-medium text-slate-600">
          {t("reasonDialog.reasonLabel")} {requireReason ? "" : t("reasonDialog.optional")}
        </label>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {t("reasonDialog.cancel")}
          </button>
          <button
            onClick={handleConfirm}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${
              danger ? "bg-red-600 text-white hover:bg-red-700" : "bg-brand text-black hover:brightness-90"
            }`}
          >
            {confirmLabel ?? t("reasonDialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

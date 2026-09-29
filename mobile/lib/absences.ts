import { supabase } from "./supabase";
import type { AbsenceType } from "./types";

export const ABSENCE_TYPES: AbsenceType[] = ["sykdom_egenmelding", "sykdom_legemeldt", "sykt_barn", "ferie", "permisjon", "fri"];

// Ferie/permisjon/fri settes til "venter" av databasetriggeren
// handle_absence_insert -- siden stab legger dette til direkte for en annen
// ansatt (fra Ansatte- eller Kalender-skjermen), godkjennes det med det
// samme i stedet (speiler samme mønster på web sin Sammendrag/Kalender-side).
// Sykdomstyper godkjennes/avvises av databasen selv uansett hvem som
// oppretter raden.
const AUTO_APPROVE_TYPES: AbsenceType[] = ["ferie", "permisjon", "fri"];

export async function insertStaffAbsence(params: {
  userId: string;
  decidedBy: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  note: string | null;
}) {
  const { data: inserted, error } = await supabase
    .from("absences")
    .insert({
      user_id: params.userId,
      type: params.type,
      start_date: params.startDate,
      end_date: params.endDate,
      note: params.note,
    })
    .select("id, type")
    .single();

  if (error || !inserted) {
    return { error };
  }

  if (AUTO_APPROVE_TYPES.includes(inserted.type as AbsenceType)) {
    await supabase
      .from("absences")
      .update({ status: "godkjent", decided_by: params.decidedBy, decided_at: new Date().toISOString() })
      .eq("id", inserted.id);
  }

  return { error: null };
}

// De to databasetriggerne prevent_duplicate_absence/prevent_overlapping_time_entries
// (schema.sql) svarer med en ren tekststreng som feilmelding i stedet for en
// vanlig Postgres-feilkode -- disse mapper den til riktig oversettelsesnøkkel,
// med fallbackKey for alt annet.
export function absenceErrorKey(error: { message: string } | null | undefined, fallbackKey: string) {
  return error?.message.includes("duplicate_absence") ? "fravaer.overlapError" : fallbackKey;
}

export function timeEntryErrorKey(error: { message: string } | null | undefined, fallbackKey: string) {
  return error?.message.includes("overlapping_time_entry") ? "timer.overlapError" : fallbackKey;
}

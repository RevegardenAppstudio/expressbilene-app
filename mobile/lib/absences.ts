import { supabase } from "./supabase";
import type { AbsenceType } from "./types";

export const ABSENCE_TYPES: AbsenceType[] = ["sykdom_egenmelding", "sykdom_legemeldt", "sykt_barn", "ferie", "permisjon", "fri"];

// Godkjennes automatisk av databasetriggeren handle_absence_insert siden
// stab legger dette til direkte for en annen ansatt (fra Ansatte- eller
// Kalender-skjermen) -- speiler samme mønster på web sin Oversikt/Kalender.
export async function insertStaffAbsence(params: {
  userId: string;
  type: AbsenceType;
  startDate: string;
  endDate: string;
  note: string | null;
}) {
  const { error } = await supabase.from("absences").insert({
    user_id: params.userId,
    type: params.type,
    start_date: params.startDate,
    end_date: params.endDate,
    note: params.note,
  });
  return { error };
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

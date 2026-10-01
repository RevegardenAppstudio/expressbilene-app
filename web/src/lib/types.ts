export type UserRole = "admin" | "moderator" | "sjafor";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  moderator: "Moderator",
  sjafor: "Sjåfør",
};

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department_id: string | null;
  notifications_viewed_at: string | null;
  vacation_days_per_year: number;
  terms_accepted_at: string | null;
  language: "no" | "en";
  created_at: string;
};

export type Department = {
  id: string;
  name: string;
  created_at: string;
};

export type Route = {
  id: string;
  department_id: string | null;
  name: string;
  created_at: string;
};

export type Vehicle = {
  id: string;
  department_id: string | null;
  name: string;
  make: string | null;
  created_at: string;
};

export function vehicleLabel(v: Pick<Vehicle, "name" | "make">) {
  return v.make ? `${v.make} - ${v.name}` : v.name;
}

export type VehicleServiceBooking = {
  id: string;
  vehicle_id: string;
  service_date: string;
  service_time: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  user_id: string;
  entry_date: string;
  hours: number | null;
  description: string | null;
  clock_in: string | null;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  department_id: string | null;
  route_id: string | null;
  vehicle_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AbsenceType =
  | "sykdom_egenmelding"
  | "sykdom_legemeldt"
  | "sykt_barn"
  | "ferie"
  | "permisjon"
  | "fri";

export type AbsenceStatus = "venter" | "godkjent" | "avslatt";

export type Absence = {
  id: string;
  user_id: string;
  type: AbsenceType;
  start_date: string;
  end_date: string;
  note: string | null;
  status: AbsenceStatus;
  hours: number | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  sykdom_egenmelding: "Sykdom (egenmelding)",
  sykdom_legemeldt: "Sykemelding",
  sykt_barn: "Sykt barn",
  ferie: "Ferie",
  permisjon: "Permisjon",
  fri: "Fri",
};

export const ABSENCE_STATUS_LABELS: Record<AbsenceStatus, string> = {
  venter: "Venter",
  godkjent: "Godkjent",
  avslatt: "Avslått",
};

export const SICK_ABSENCE_TYPES: AbsenceType[] = ["sykdom_egenmelding", "sykdom_legemeldt", "sykt_barn"];

// Ferie/permisjon/sykemelding (legeerklært)/fri er sensitive og skal kun
// administreres av admin -- ikke sjåfør selv eller moderator. Matcher
// RLS-policyene på public.absences i schema.sql.
export const ADMIN_ONLY_ABSENCE_TYPES: AbsenceType[] = ["ferie", "permisjon", "sykdom_legemeldt", "fri"];

export type RouteCancellation = {
  id: string;
  route_id: string;
  cancellation_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type EventType = "utforkjoring" | "biltrobbel" | "verksted_service" | "annet";

export type IncidentEvent = {
  id: string;
  user_id: string;
  department_id: string | null;
  vehicle_id: string | null;
  type: EventType;
  note: string | null;
  image_path: string | null;
  occurred_at: string;
  resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  utforkjoring: "Utforkjøring",
  biltrobbel: "Biltrøbbel",
  verksted_service: "Service/verksted",
  annet: "Annet",
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_table: string | null;
  related_id: string | null;
  created_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
};

export type AuditLogEntry = {
  id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  reason: string | null;
  details: string | null;
  created_at: string;
};

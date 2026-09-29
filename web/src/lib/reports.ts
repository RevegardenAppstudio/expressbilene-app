import { toIsoDate } from "@/lib/calendar";
import {
  vehicleLabel,
  type Absence,
  type Department,
  type Profile,
  type Route,
  type TimeEntry,
  type Vehicle,
} from "@/lib/types";

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

export function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function eachDateIso(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return dates;
}

const SICK_TYPE_LABELS: Record<string, string> = {
  sykdom_egenmelding: "Sykdom (egenmelding)",
  sykdom_legemeldt: "Sykemelding",
  sykt_barn: "Sykt barn",
};

// Én rad pr. dag med aktivitet for en ansatt -- brukt av begge PDF-eksportene.
// Slår sammen alle time_entries den dagen (rute/bil/klokkeslett/pause vises
// samlet hvis flere), og regner lønnstimer med samme regler som Sammendrag:
// gulv på 8t for arbeidede dager, og 16-dagersregelen for sykemelding
// (legeerklært) -- 8t/dag de første 16 sammenhengende dagene av EN periode,
// deretter 0t (NAV overtar).
export type DayDetail = {
  date: string;
  workedHours: number;
  wageHours: number;
  overtimeHours: number;
  sickLabel: string | null;
  departmentLabel: string;
  routeLabel: string;
  vehicleLabel: string;
  clockRange: string;
  breakRange: string;
};

export function buildDayDetails(
  userEntries: TimeEntry[],
  userAbsences: Absence[],
  fromDate: string,
  toDate: string,
  routes: Route[],
  vehicles: Vehicle[],
  departments: Department[],
  fallbackDepartmentId: string | null
): DayDetail[] {
  const dayMap = new Map<string, DayDetail>();
  const parts = new Map<
    string,
    { departments: Set<string>; routes: Set<string>; vehicles: Set<string>; clocks: string[]; breaks: string[] }
  >();

  function ensure(date: string): DayDetail {
    let d = dayMap.get(date);
    if (!d) {
      d = {
        date,
        workedHours: 0,
        wageHours: 0,
        overtimeHours: 0,
        sickLabel: null,
        departmentLabel: "",
        routeLabel: "",
        vehicleLabel: "",
        clockRange: "",
        breakRange: "",
      };
      dayMap.set(date, d);
      parts.set(date, { departments: new Set(), routes: new Set(), vehicles: new Set(), clocks: [], breaks: [] });
    }
    return d;
  }

  for (const e of userEntries) {
    if (e.entry_date < fromDate || e.entry_date > toDate) continue;
    const d = ensure(e.entry_date);
    const hours = Number(e.hours ?? 0);
    d.workedHours += hours;
    const p = parts.get(e.entry_date)!;
    if (e.department_id) {
      const dep = departments.find((dep) => dep.id === e.department_id);
      if (dep) p.departments.add(dep.name);
    }
    if (e.route_id) {
      const r = routes.find((r) => r.id === e.route_id);
      if (r) p.routes.add(r.name);
    }
    if (e.vehicle_id) {
      const v = vehicles.find((v) => v.id === e.vehicle_id);
      if (v) p.vehicles.add(vehicleLabel(v));
    }
    if (e.clock_in && e.clock_out) {
      p.clocks.push(`${formatTime(e.clock_in)}–${formatTime(e.clock_out)}`);
    }
    if (e.break_start && e.break_end) {
      p.breaks.push(`${formatTime(e.break_start)}–${formatTime(e.break_end)}`);
    }
  }

  for (const [date, d] of dayMap) {
    if (d.workedHours > 0) {
      d.wageHours = Math.max(d.workedHours, 8);
      d.overtimeHours = Math.max(d.workedHours - 8, 0);
    }
    const p = parts.get(date)!;
    d.departmentLabel = [...p.departments].join(" / ") || departmentName(departments, fallbackDepartmentId);
    d.routeLabel = [...p.routes].join(" / ") || "—";
    d.vehicleLabel = [...p.vehicles].join(" / ") || "—";
    d.clockRange = p.clocks.join(", ") || "—";
    d.breakRange = p.breaks.join(", ") || "—";
  }

  for (const a of userAbsences) {
    if (!(a.type in SICK_TYPE_LABELS)) continue;
    const start = a.start_date > fromDate ? a.start_date : fromDate;
    const end = a.end_date < toDate ? a.end_date : toDate;
    if (end < start) continue;

    // Arbeidsgiverperioden for sykemelding (legeerklært) er de første 16
    // sammenhengende dagene av DENNE perioden (ikke rapportperioden) --
    // dager utover det gir 0t i lønnsgrunnlaget (NAV overtar).
    const employerPeriodEnd = a.type === "sykdom_legemeldt" ? addDaysIso(a.start_date, 15) : a.end_date;

    for (const date of eachDateIso(start, end)) {
      const d = ensure(date);
      d.sickLabel = SICK_TYPE_LABELS[a.type];
      d.departmentLabel = departmentName(departments, fallbackDepartmentId);
      d.routeLabel = "—";
      d.vehicleLabel = "—";
      d.clockRange = "—";
      d.breakRange = "—";
      d.overtimeHours = 0;
      if (date <= employerPeriodEnd) {
        d.wageHours = Number(a.hours ?? 8);
      }
    }
  }

  return [...dayMap.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function departmentName(departments: Department[], id: string | null) {
  return departments.find((d) => d.id === id)?.name ?? "—";
}

export function profileName(profiles: Profile[], userId: string) {
  return profiles.find((p) => p.id === userId)?.full_name ?? "—";
}

// Bruker lokale datofelter, ikke toISOString() (som konverterer til UTC og
// dermed kan hoppe en dag frem/tilbake i tidssoner som ikke er UTC+0).
export function toIsoDate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });
}

export function startOfMonth(year: number, month: number) {
  return new Date(year, month, 1);
}

export function endOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0);
}

// Bygger en 6x7-rutenett (mandag først) som dekker hele måneden, inkludert
// dager fra forrige/neste måned for å fylle ut ukene.
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = startOfMonth(year, month);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startOffset);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

export const WEEKDAY_LABELS_NO = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
export const WEEKDAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const MONTH_LABELS_NO = [
  "Januar", "Februar", "Mars", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Desember",
];
export const MONTH_LABELS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function weekdayLabels(language: "no" | "en") {
  return language === "en" ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_NO;
}

export function monthLabels(language: "no" | "en") {
  return language === "en" ? MONTH_LABELS_EN : MONTH_LABELS_NO;
}

// Meeus/Jones/Butcher-algoritmen -- samme utregning som easter_sunday() i
// schema.sql (web/src/lib/calendar.ts har en identisk kopi), holdt i sync
// manuelt siden dette er ren utregning (ikke data).
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Norske helligdager -- speiler is_norwegian_public_holiday() i schema.sql.
export function isNorwegianPublicHoliday(d: Date): boolean {
  const year = d.getFullYear();
  const easter = easterSunday(year);
  const holidays = [
    new Date(year, 0, 1),
    addDays(easter, -3),
    addDays(easter, -2),
    easter,
    addDays(easter, 1),
    new Date(year, 4, 1),
    addDays(easter, 39),
    new Date(year, 4, 17),
    addDays(easter, 49),
    addDays(easter, 50),
    new Date(year, 11, 25),
    new Date(year, 11, 26),
  ];
  return holidays.some((h) => sameDate(h, d));
}

// Virkedag = ikke lørdag/søndag og ikke helligdag. Speiler is_business_day()
// i schema.sql -- brukes for umiddelbar UI-tilbakemelding, håndheves reelt av
// RLS-policyen på time_entries.
export function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  return !isNorwegianPublicHoliday(d);
}

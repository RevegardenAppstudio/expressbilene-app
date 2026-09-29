import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Switch } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PickerField from "./PickerField";
import {
  CLOCK_IN_REMINDER_ID,
  CLOCK_OUT_REMINDER_ID,
  cancelReminder,
  requestNotificationPermission,
  scheduleClockInReminder,
  scheduleClockOutReminder,
} from "../lib/notifications";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

const STORAGE_KEY = "eb_reminders_v1";

type ReminderState = {
  clockInEnabled: boolean;
  clockInTime: string; // "HH:MM"
  clockOutEnabled: boolean;
  clockOutTime: string;
};

const DEFAULT_STATE: ReminderState = {
  clockInEnabled: false,
  clockInTime: "07:00",
  clockOutEnabled: false,
  clockOutTime: "15:00",
};

function timeToDate(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function dateToTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function ReminderSettings() {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [state, setState] = useState<ReminderState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setState({ ...DEFAULT_STATE, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function persist(next: ReminderState) {
    setState(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Enhetens lagring er ikke tilgjengelig -- påminnelsen er likevel planlagt
      // for denne økten, bare ikke husket til neste app-start.
    }
  }

  async function handleToggleClockIn(enabled: boolean) {
    setError(null);
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setError(t("reminders.permissionError"));
        return;
      }
      const [h, m] = state.clockInTime.split(":").map(Number);
      await scheduleClockInReminder(h, m);
    } else {
      await cancelReminder(CLOCK_IN_REMINDER_ID);
    }
    persist({ ...state, clockInEnabled: enabled });
  }

  async function handleToggleClockOut(enabled: boolean) {
    setError(null);
    if (enabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        setError(t("reminders.permissionError"));
        return;
      }
      const [h, m] = state.clockOutTime.split(":").map(Number);
      await scheduleClockOutReminder(h, m);
    } else {
      await cancelReminder(CLOCK_OUT_REMINDER_ID);
    }
    persist({ ...state, clockOutEnabled: enabled });
  }

  async function handleClockInTimeChange(date: Date) {
    const time = dateToTime(date);
    if (state.clockInEnabled) {
      await scheduleClockInReminder(date.getHours(), date.getMinutes());
    }
    persist({ ...state, clockInTime: time });
  }

  async function handleClockOutTimeChange(date: Date) {
    const time = dateToTime(date);
    if (state.clockOutEnabled) {
      await scheduleClockOutReminder(date.getHours(), date.getMinutes());
    }
    persist({ ...state, clockOutTime: time });
  }

  if (!loaded) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("reminders.title")}</Text>
      <Text style={styles.hint}>{t("reminders.weekdaysOnlyHint")}</Text>

      <View style={styles.row}>
        <Text style={styles.value}>{t("reminders.clockInLabel")}</Text>
        <Switch value={state.clockInEnabled} onValueChange={handleToggleClockIn} />
      </View>
      {state.clockInEnabled && (
        <PickerField label={t("reminders.timeLabel")} value={timeToDate(state.clockInTime)} mode="time" onChange={handleClockInTimeChange} />
      )}

      <View style={[styles.row, { marginTop: 14 }]}>
        <Text style={styles.value}>{t("reminders.clockOutLabel")}</Text>
        <Switch value={state.clockOutEnabled} onValueChange={handleToggleClockOut} />
      </View>
      {state.clockOutEnabled && (
        <PickerField label={t("reminders.timeLabel")} value={timeToDate(state.clockOutTime)} mode="time" onChange={handleClockOutTimeChange} />
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
    },
    title: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 2 },
    hint: { fontSize: 11.5, color: colors.textMuted, marginBottom: 10 },
    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    value: { fontSize: 14.5, color: colors.text },
    error: { color: colors.danger, fontSize: 12.5, marginTop: 10 },
  });
}

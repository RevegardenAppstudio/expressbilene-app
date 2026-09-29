import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Registrerer denne enheten for push-varsler (admin/moderator får varsel om
// sykdager og hendelser -- se notify-staff-push Edge Function). Krever et
// EAS project ID (kjør "eas init" og bygg på nytt) -- uten det hopper vi
// stille over, siden resten av appen fungerer helt uavhengig av dette.
export async function registerPushToken(userId: string): Promise<void> {
  if (Platform.OS === "web") return;

  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.warn('Mangler EAS project ID -- kan ikke registrere push-token. Kjør "eas init".');
    return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Varsler",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from("push_tokens").upsert({ user_id: userId, token: data, updated_at: new Date().toISOString() });
}

// Lokale, tidsstyrte påminnelser om å klokke inn/ut (kun hverdager) -- helt
// uavhengig av push-token/EAS (se registerPushToken over), så disse
// fungerer i Expo Go.
export const CLOCK_IN_REMINDER_ID = "reminder-clock-in";
export const CLOCK_OUT_REMINDER_ID = "reminder-clock-out";

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Varsler",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

// expo-notifications har ingen "hverdager"-trigger -- bruker derfor fem
// WEEKLY-triggere (man-fre) i stedet for én DAILY. Ukedag-tall følger
// biblioteket sitt format: 1 = søndag ... 7 = lørdag.
const WEEKDAYS = [2, 3, 4, 5, 6];

function weekdayReminderIds(baseId: string): string[] {
  return WEEKDAYS.map((weekday) => `${baseId}-${weekday}`);
}

async function cancelWeekdayReminder(baseId: string): Promise<void> {
  await Promise.all(
    weekdayReminderIds(baseId).map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
  );
}

async function scheduleWeekdayReminder(baseId: string, hour: number, minute: number, title: string, body: string): Promise<void> {
  await ensureAndroidChannel();
  await cancelWeekdayReminder(baseId);
  await Promise.all(
    WEEKDAYS.map((weekday) =>
      Notifications.scheduleNotificationAsync({
        identifier: `${baseId}-${weekday}`,
        content: { title, body, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday, hour, minute },
      })
    )
  );
}

export async function scheduleClockInReminder(hour: number, minute: number): Promise<void> {
  await scheduleWeekdayReminder(
    CLOCK_IN_REMINDER_ID,
    hour,
    minute,
    "Husk å klokke inn",
    "Ikke glem å registrere at arbeidsdagen har startet."
  );
}

export async function scheduleClockOutReminder(hour: number, minute: number): Promise<void> {
  await scheduleWeekdayReminder(
    CLOCK_OUT_REMINDER_ID,
    hour,
    minute,
    "Husk å klokke ut",
    "Ikke glem å registrere at arbeidsdagen er ferdig."
  );
}

export async function cancelReminder(id: string): Promise<void> {
  await cancelWeekdayReminder(id);
}

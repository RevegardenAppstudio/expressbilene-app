import React, { useMemo, useState } from "react";
import { Platform, Text, TouchableOpacity, StyleSheet } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";

type Props = {
  label: string;
  value: Date;
  mode: "date" | "time";
  onChange: (value: Date) => void;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toWebInputValue(value: Date, mode: "date" | "time") {
  if (mode === "date") {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export default function PickerField({ label, value, mode, onChange }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [show, setShow] = useState(false);

  const displayText =
    mode === "date"
      ? value.toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" })
      : value.toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" });

  function handleChange(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === "android") setShow(false);
    if (event.type !== "dismissed" && selected) onChange(selected);
  }

  // @react-native-community/datetimepicker has no web implementation (it
  // renders null there), so on web we fall back to a plain HTML date/time input.
  if (Platform.OS === "web") {
    function handleWebChange(e: React.ChangeEvent<HTMLInputElement>) {
      const raw = e.target.value;
      if (!raw) return;
      const next = new Date(value);
      if (mode === "date") {
        const [y, m, d] = raw.split("-").map(Number);
        next.setFullYear(y, m - 1, d);
      } else {
        const [h, min] = raw.split(":").map(Number);
        next.setHours(h, min, 0, 0);
      }
      onChange(next);
    }

    return (
      <>
        <Text style={styles.label}>{label}</Text>
        <input
          type={mode}
          value={toWebInputValue(value, mode)}
          onChange={handleWebChange}
          style={{
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            padding: 10,
            fontSize: 14.5,
            backgroundColor: colors.inputBg,
            color: colors.text,
            fontFamily: "inherit",
            width: "100%",
            boxSizing: "border-box",
          }}
        />
      </>
    );
  }

  if (Platform.OS === "android") {
    return (
      <>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity style={styles.input} onPress={() => setShow(true)}>
          <Text style={styles.value}>{displayText}</Text>
        </TouchableOpacity>
        {show && <DateTimePicker value={value} mode={mode} display="default" onChange={handleChange} />}
      </>
    );
  }

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <DateTimePicker
        value={value}
        mode={mode}
        display="compact"
        onChange={handleChange}
        style={styles.nativePicker}
      />
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    label: { fontSize: 12.5, color: colors.textMuted, marginBottom: 6, marginTop: 10 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, backgroundColor: colors.inputBg },
    value: { fontSize: 14.5, color: colors.text },
    nativePicker: { alignSelf: "flex-start" },
  });
}

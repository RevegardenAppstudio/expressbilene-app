import React, { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { useLanguage } from "../lib/i18n/LanguageContext";

type Item = { id: string; label: string };

type Props = {
  label: string;
  placeholder: string;
  items: Item[];
  value: string;
  onChange: (id: string) => void;
};

export default function SearchPickerField({ label, placeholder, items, value, onChange }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = items.find((i) => i.id === value);
  const filtered = query.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function handleClose() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.input} onPress={() => setOpen(true)}>
        <Text style={selected ? styles.value : styles.placeholder}>{selected ? selected.label : placeholder}</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={handleClose}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <TouchableOpacity onPress={handleClose}>
                <Text style={styles.closeText}>{t("common.close")}</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder={t("common.search")}
              placeholderTextColor={colors.textMuted}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: 300 }}
              ListHeaderComponent={
                value ? (
                  <TouchableOpacity style={styles.row} onPress={() => handleSelect("")}>
                    <Text style={styles.rowTextMuted}>{t("common.noneSelected")}</Text>
                  </TouchableOpacity>
                ) : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => handleSelect(item.id)}>
                  <Text style={[styles.rowText, item.id === value && styles.rowTextActive]}>{item.label}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.emptyText}>{t("common.noMatches")}</Text>}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    label: { fontSize: 12.5, color: colors.textMuted, marginBottom: 6, marginTop: 10 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      backgroundColor: colors.inputBg,
    },
    value: { fontSize: 14.5, color: colors.text },
    placeholder: { fontSize: 14.5, color: colors.textMuted },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      padding: 16,
      maxHeight: "80%",
    },
    sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    sheetTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
    closeText: { fontSize: 14, color: colors.primary, fontWeight: "600" },
    searchInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14.5,
      backgroundColor: colors.inputBg,
      color: colors.text,
      marginBottom: 8,
    },
    row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
    rowText: { fontSize: 14.5, color: colors.text },
    rowTextActive: { color: colors.primary, fontWeight: "700" },
    rowTextMuted: { fontSize: 14.5, color: colors.textMuted, fontStyle: "italic" },
    emptyText: { textAlign: "center", color: colors.textMuted, fontSize: 13, marginTop: 16 },
  });
}

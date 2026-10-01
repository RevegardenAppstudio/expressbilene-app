import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image, Linking, StyleSheet, FlatList, RefreshControl } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { useTheme } from "../theme/ThemeContext";
import { ThemeColors } from "../theme/colors";
import { Department, EventType, IncidentEvent, Profile, Vehicle, vehicleLabel } from "../lib/types";
import SearchPickerField from "../components/SearchPickerField";
import { useLanguage } from "../lib/i18n/LanguageContext";

const TYPES: EventType[] = ["utforkjoring", "biltrobbel", "verksted_service", "annet"];
const EVENT_PHOTO_BUCKET = "hendelse-bilder";

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString("nb-NO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function HendelserScreen({ userId, profile }: { userId: string; profile: Profile | null }) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<EventType>("biltrobbel");
  const [note, setNote] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoMimeType, setPhotoMimeType] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const myDepartmentId = profile?.department_id ?? null;

  const load = useCallback(async () => {
    const [{ data }, { data: deps }, { data: vhs }] = await Promise.all([
      supabase.from("events").select("*").eq("user_id", userId).order("occurred_at", { ascending: false }).limit(30),
      supabase.from("departments").select("*").order("name"),
      supabase.from("vehicles").select("*").order("name"),
    ]);
    if (data) {
      setEvents(data as IncidentEvent[]);
      const imagePaths = (data as IncidentEvent[]).map((ev) => ev.image_path).filter((p): p is string => !!p);
      if (imagePaths.length > 0) {
        const { data: signed } = await supabase.storage.from(EVENT_PHOTO_BUCKET).createSignedUrls(imagePaths, 3600);
        if (signed) {
          const map: Record<string, string> = {};
          for (const s of signed) {
            if (s.signedUrl && s.path) map[s.path] = s.signedUrl;
          }
          setPhotoUrls(map);
        }
      }
    }
    if (deps) setDepartments(deps as Department[]);
    if (vhs) setVehicles(vhs as Vehicle[]);
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (myDepartmentId) setDepartmentId(myDepartmentId);
  }, [myDepartmentId]);

  function clearPhoto() {
    setPhotoUri(null);
    setPhotoMimeType(null);
  }

  async function pickPhotoFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError(t("hendelser.photoPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? "image/jpeg");
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError(t("hendelser.photoPermissionDenied"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setPhotoMimeType(result.assets[0].mimeType ?? "image/jpeg");
    }
  }

  async function handleSubmit() {
    setError(null);
    setSaving(true);

    let imagePath: string | null = null;
    if (photoUri) {
      setUploadingPhoto(true);
      const ext = photoMimeType === "image/png" ? "png" : "jpg";
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      try {
        const response = await fetch(photoUri);
        const arrayBuffer = await response.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from(EVENT_PHOTO_BUCKET)
          .upload(path, arrayBuffer, { contentType: photoMimeType ?? "image/jpeg" });
        if (uploadError) {
          setUploadingPhoto(false);
          setSaving(false);
          setError(t("hendelser.uploadFailed"));
          return;
        }
        imagePath = path;
      } catch {
        setUploadingPhoto(false);
        setSaving(false);
        setError(t("hendelser.uploadFailed"));
        return;
      }
      setUploadingPhoto(false);
    }

    const { error } = await supabase.from("events").insert({
      user_id: userId,
      type,
      note: note.trim() || null,
      department_id: departmentId || null,
      vehicle_id: vehicleId || null,
      image_path: imagePath,
    });
    setSaving(false);
    if (error) {
      setError(t("hendelser.reportFailed"));
      return;
    }
    setNote("");
    clearPhoto();
    load();
  }

  const vehiclesForDepartment = departmentId ? vehicles.filter((v) => v.department_id === departmentId) : vehicles;
  const vehicleName = (id: string | null) => {
    const v = id ? vehicles.find((v) => v.id === id) : null;
    return v ? vehicleLabel(v) : null;
  };

  return (
    <FlatList
      style={styles.wrap}
      data={events}
      keyExtractor={(item) => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
      ListHeaderComponent={
        <View>
          <Text style={styles.title}>{t("hendelser.title")}</Text>
          <Text style={styles.subtitle}>{t("hendelser.subtitle")}</Text>

          <View style={styles.card}>
            <Text style={styles.label}>{t("hendelser.type")}</Text>
            <View style={styles.typeRow}>
              {TYPES.map((eventType) => (
                <TouchableOpacity
                  key={eventType}
                  onPress={() => setType(eventType)}
                  style={[styles.typeChip, type === eventType && styles.typeChipActive]}
                >
                  <Text style={[styles.typeChipText, type === eventType && styles.typeChipTextActive]}>
                    {t(`eventType.${eventType}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{t("hendelser.department")}</Text>
            {myDepartmentId ? (
              <Text style={styles.lockedDepartment}>
                {departments.find((d) => d.id === myDepartmentId)?.name ?? "…"}
              </Text>
            ) : (
              departments.length > 0 && (
                <View style={styles.typeRow}>
                  {departments.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      onPress={() => {
                        setDepartmentId(departmentId === d.id ? "" : d.id);
                        setVehicleId("");
                      }}
                      style={[styles.typeChip, departmentId === d.id && styles.typeChipActive]}
                    >
                      <Text style={[styles.typeChipText, departmentId === d.id && styles.typeChipTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )
            )}

            {vehiclesForDepartment.length > 0 && (
              <SearchPickerField
                label={t("hendelser.vehicleOptional")}
                placeholder={t("hendelser.vehicleSelect")}
                items={vehiclesForDepartment.map((v) => ({ id: v.id, label: vehicleLabel(v) }))}
                value={vehicleId}
                onChange={setVehicleId}
              />
            )}

            <Text style={styles.label}>{t("hendelser.note")}</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              value={note}
              onChangeText={setNote}
              multiline
              placeholder={t("hendelser.notePlaceholder")}
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>{t("hendelser.photo")}</Text>
            {photoUri ? (
              <View style={styles.photoRow}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                <TouchableOpacity onPress={clearPhoto} style={styles.photoRemoveBtn}>
                  <Text style={styles.photoRemoveText}>{t("hendelser.removePhoto")}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoButtonRow}>
                <TouchableOpacity onPress={takePhoto} style={styles.photoBtn}>
                  <Text style={styles.photoBtnText}>{t("hendelser.takePhoto")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={pickPhotoFromLibrary} style={styles.photoBtn}>
                  <Text style={styles.photoBtnText}>{t("hendelser.choosePhoto")}</Text>
                </TouchableOpacity>
              </View>
            )}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, (saving || uploadingPhoto) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={saving || uploadingPhoto}
            >
              <Text style={styles.buttonText}>{saving || uploadingPhoto ? t("hendelser.sending") : t("hendelser.report")}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>{t("hendelser.staffNotified")}</Text>
          </View>

          <Text style={styles.sectionTitle}>{t("hendelser.myEvents")}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.entryRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.entryDate}>{formatDateTime(item.occurred_at)}</Text>
            <Text style={styles.entryDesc}>
              {t(`eventType.${item.type}`)}
              {vehicleName(item.vehicle_id) ? ` · ${vehicleName(item.vehicle_id)}` : ""}
            </Text>
            {item.note ? <Text style={styles.entryNote}>{item.note}</Text> : null}
          </View>
          {item.image_path && photoUrls[item.image_path] ? (
            <TouchableOpacity onPress={() => Linking.openURL(photoUrls[item.image_path!])}>
              <Image source={{ uri: photoUrls[item.image_path] }} style={styles.entryThumb} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.statusText}>{item.resolved ? t("hendelser.resolved") : t("hendelser.unresolved")}</Text>
        </View>
      )}
      ListEmptyComponent={!loading ? <Text style={styles.emptyText}>{t("hendelser.noEvents")}</Text> : null}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    />
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2, marginBottom: 16 },
    card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border },
    label: { fontSize: 12.5, color: colors.textMuted, marginBottom: 6, marginTop: 10 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 10,
      fontSize: 14.5,
      backgroundColor: colors.inputBg,
      color: colors.text,
    },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    typeChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 10,
      marginRight: 6,
      marginBottom: 6,
    },
    typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    typeChipText: { fontSize: 12, color: colors.text },
    typeChipTextActive: { color: colors.primaryText },
    lockedDepartment: {
      fontSize: 13,
      color: colors.textMuted,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      marginBottom: 8,
      alignSelf: "flex-start",
    },
    photoButtonRow: { flexDirection: "row", gap: 8 },
    photoBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: "center",
    },
    photoBtnText: { fontSize: 12.5, fontWeight: "600", color: colors.text },
    photoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    photoPreview: { width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    photoRemoveBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
    photoRemoveText: { fontSize: 12.5, color: colors.text },
    error: { color: colors.danger, fontSize: 13, marginTop: 10 },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 12,
      alignItems: "center",
      marginTop: 16,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: colors.primaryText, fontSize: 14.5, fontWeight: "600" },
    hint: { fontSize: 11, color: colors.textMuted, textAlign: "center", marginTop: 8 },
    sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.text, marginTop: 24, marginBottom: 8 },
    entryRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      gap: 10,
    },
    entryThumb: { width: 36, height: 36, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
    entryDate: { fontSize: 13.5, color: colors.text },
    entryDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    entryNote: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    statusText: { fontSize: 11.5, color: colors.textMuted },
    emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 20, fontSize: 13 },
  });
}

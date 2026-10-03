// Sideload-APK-en (eas.json profil "sideload") bygges kun for arm64 og armv7
// (ikke x86) for å holde filen under Supabase Storage sin grense på 50 MB
// (gratisplan). Play-bygget (production) er uendret og inneholder alle
// arkitekturer.
module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    ...(process.env.SIDELOAD === "1"
      ? [["expo-build-properties", { android: { buildArchs: ["arm64-v8a", "armeabi-v7a"] } }]]
      : []),
  ],
});

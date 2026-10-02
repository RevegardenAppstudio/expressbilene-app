const { withAndroidManifest } = require("expo/config-plugins");

// expo-image-picker declares android.permission.CAMERA in its native manifest,
// which makes Android/Google Play implicitly require a camera on the device.
// We also support picking from the gallery, so the camera must be optional,
// otherwise Play filters out every camera-less device from the store listing.
function addOptionalFeature(manifest, name) {
  if (!manifest["uses-feature"]) {
    manifest["uses-feature"] = [];
  }
  const exists = manifest["uses-feature"].some((f) => f.$ && f.$["android:name"] === name);
  if (!exists) {
    manifest["uses-feature"].push({
      $: { "android:name": name, "android:required": "false" },
    });
  }
}

function withOptionalCameraFeature(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    addOptionalFeature(manifest, "android.hardware.camera");
    addOptionalFeature(manifest, "android.hardware.camera.autofocus");
    return config;
  });
}

module.exports = withOptionalCameraFeature;

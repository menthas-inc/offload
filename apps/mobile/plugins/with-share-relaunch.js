// A share into an offload that Android killed in the background.
//
// Android keeps the task, so a share starts the process again, recreates the
// activity from the intent it was first opened with, and then delivers the
// share as a new intent. Two things went wrong there (Pixel 9, 2026-10-16):
//
// - Expo's activity delegate drops a new intent that arrives before the app
//   has loaded (`ReactActivityDelegateWrapper.onNewIntent`, expo 57), so the
//   share never reached expo-share-intent and offload opened with nothing.
// - expo-share-intent reads the recreated activity's intent as a fresh share,
//   so a share that opened the app earlier came back into the composer.
//
// So, written into MainActivity at prebuild: a recreated activity forgets a
// share it was opened with, and a share Expo dropped is kept where the
// library looks for it once the app has loaded. A loaded app never reaches
// that listener, since expo-linking claims every new intent then, so nothing
// is taken twice.

const { withMainActivity } = require("expo/config-plugins");

const MARK = "// offload: a share into a killed app (plugins/with-share-relaunch.js)";

const IMPORTS = ["import android.content.Intent", "import expo.modules.shareintent.ExpoShareIntentSingleton"];

const FORGET = `    ${MARK}
    if (savedInstanceState != null && intent?.type != null) {
      intent = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    }
`;

const KEEP = `
    addOnNewIntentListener { next ->
      if (next.action == Intent.ACTION_SEND || next.action == Intent.ACTION_SEND_MULTIPLE) {
        ExpoShareIntentSingleton.intent = next
        ExpoShareIntentSingleton.isPending = true
      }
    }`;

/** MainActivity's source with both changes, unchanged when they are there. */
function shareRelaunch(src) {
  if (src.includes(MARK)) return src;
  const onCreate = /override fun onCreate\(savedInstanceState: Bundle\?\) \{\n/;
  const superCall = "super.onCreate(null)";
  if (!onCreate.test(src) || src.split(superCall).length !== 2) {
    throw new Error("with-share-relaunch: MainActivity.onCreate is not the shape this plugin knows");
  }
  let out = src.replace(onCreate, (m) => m + FORGET).replace(superCall, superCall + KEEP);
  const missing = IMPORTS.filter((line) => !out.includes(line));
  if (missing.length) out = out.replace(/\nimport /, `\n${missing.join("\n")}\nimport `);
  return out;
}

const withShareRelaunch = (config) =>
  withMainActivity(config, (mod) => {
    if (mod.modResults.language !== "kt") throw new Error("with-share-relaunch: MainActivity is not Kotlin");
    mod.modResults.contents = shareRelaunch(mod.modResults.contents);
    return mod;
  });

module.exports = withShareRelaunch;
module.exports.shareRelaunch = shareRelaunch;

# Builds and submissions

`eas.json` is here and complete. Builds and submissions run from this
directory with `npx --yes eas-cli@latest`, signed in as the owner of the
`menthas_offload` account.

## Done

- **Expo login.** `EXPO_TOKEN` is in the repository's `.env`, a robot token
  rather than a password, so it works non-interactively and can be handed to CI
  later.
- **The project exists**, `9b52f487-7c53-4d9d-a389-889ccc79798d`, under the
  `menthas_offload` account. `app.json` names that owner explicitly: the token
  can see two accounts, and a project created under the wrong one is not
  something you notice until builds and credentials are already attached to it.
- **Apple credentials are on EAS.** The distribution certificate, the
  provisioning profiles and an App Store Connect API key. The app in App Store
  Connect is `6814795746`, which the submit profile names so a submission needs
  no sign-in. iOS production 7 reached TestFlight this way on 2026-09-22.
- **The Android keystore is on EAS**, and it is the Play upload key. The first
  bundle, production 5, was uploaded by hand on 2026-09-22 and Play App
  Signing was left on its default, so Google signs what phones install and the
  EAS keystore signs what we upload. **Google sign-in on Android depends on
  the installed app's certificate** since 2026-09-22 (security review, H1):
  the native sheet works only when the sign-in Cloud project has an Android
  OAuth client for the certificate on the phone, so there are two, one with
  the EAS keystore's SHA-1 for what `adb install` puts on a phone and one
  with Play's app signing key for what Play installs (Play Console, Setup,
  App signing). Without the matching client the sheet fails and the sign-in
  fails with it; the browser flow is the fallback only where the native
  module is absent.
- **The Google service account key is on EAS** since 2026-09-24, so Android
  submissions need no sign-in either. Checked by resubmitting build 5: Google
  answered `Version code 5 has already been used`, which it only says after
  the account has authenticated and been matched to the app.
- **Development builds need the update signing key on Metro.** A build made
  after 2026-09-22 asks the dev server for a signed manifest, and a Metro
  started without `--private-key-path keys/private-key.pem` answers 500,
  which the launcher shows as "Failed to download remote update". Nothing in
  the repository passes it yet: `pnpm dev` here is a bare `expo start
  --dev-client`, so add the flag by hand, and to every `eas update`.

## Submitting

Both stores take a submission straight from a finished build:

```
npx --yes eas-cli@latest build --platform all --profile production --auto-submit --non-interactive --no-wait
```

`--auto-submit` uses the submit profile with the build profile's name, so
`production` builds go to TestFlight and to Play's internal testing track. The
submission is queued on EAS when the build finishes, so `--no-wait` is safe.
To submit a build that already exists, `submit --platform android --latest`
or `--id <build id>`; `submit:list` and `submit:status` show what happened.

**How the Android service account was made**, for a key rotation or the next
app. Google Cloud: pick a project (the sign-in project is fine; the account
needs no IAM role there), IAM and admin, Service accounts, create one, then
Keys, Add key, JSON, and enable the Google Play Android Developer API in that
project. Play Console: Users and permissions,
Invite new users, the service account's email, App permissions on offload
with View app information, Release apps to testing tracks, and Manage testing
tracks and edit tester lists. Then `npx --yes eas-cli@latest credentials
--platform android`, production, Google Service Account, Play Store
submissions, upload the JSON. The file never enters the repository; once EAS
holds it, delete the download. A newly invited service account can be refused
for a while with a permission or package-not-found error, which is
propagation, not configuration.

The internal track is deliberate: betas are for friends, and Play's internal
testing skips review. Production is a separate decision, and the service
account is not allowed to release to it until that day.

## Two things to check while you are in the Apple portal

The Services ID `club.offload.web` needs `api.offload.club` as a domain and
`https://api.offload.club/api/auth/callback/apple` as a Return URL. Without it,
Apple sign-in on the web returns `invalid_client` before the account gate is
ever reached.

Sign in with Apple on the phone uses the **App ID** `club.offload.app`, not the
Services ID, and it needs the Sign in with Apple capability enabled on that App
ID. They are separate registrations and it is easy to configure one and assume
the other followed.

## Profiles

`development` is the one to build first: a dev client, internal distribution,
pointed at the production API. `development-simulator` is the same thing for a
simulator, which needs no device registration and is the fastest way to see the
screens. `preview` is a shareable internal build; `production` is the store one.

Every profile pins `EXPO_PUBLIC_API_URL` to `https://api.offload.club`. Pointing
a build at a laptop is a local-only thing and is described in
`docs/local-dev.md`, not here.

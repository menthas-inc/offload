# Builds

`eas.json` is here and complete. What is missing is an Expo project and Apple
credentials, and both need a person to authenticate.

## Done

- **Expo login.** `EXPO_TOKEN` is in the repository's `.env`, a robot token
  rather than a password, so it works non-interactively and can be handed to CI
  later.
- **The project exists**, `9b52f487-7c53-4d9d-a389-889ccc79798d`, under the
  `menthas_offload` account. `app.json` names that owner explicitly: the token
  can see two accounts, and a project created under the wrong one is not
  something you notice until builds and credentials are already attached to it.

## What is left, in order

1. **Apple credentials.** `npx eas-cli credentials` or the first
   `eas build --platform ios`. EAS generates the distribution certificate and
   the provisioning profile itself, but it has to sign in to the Apple
   Developer account to do it, and that means an Apple ID with two-factor.
   **This step cannot be automated and cannot be delegated to a token.**

2. **`npx eas-cli build --profile development --platform ios`.** The custom dev
   build the app needs, because Expo Go cannot load it: Sign in with Apple and
   secure store are native modules a generic client container does not carry.

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

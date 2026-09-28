# Stores: from nothing to a TestFlight link and a Play testing link

The goal first: a few race organizers install the app on their own phone and hear their race.
Not the public stores yet. Everything below is done once; after it, JavaScript ships over the
air (WORKFLOW.md) and only a native change needs a new build.

Identity: bundle id and package `app.sivoov.run` (`.preview`, `.dev` for the other shells),
name "Sivoov", seller the company (D-U-N-S). Expo project `arthur.flam/sivoov` stays (invisible
to users; it can move to an Expo organization later without touching the ids).

## 1. Apple Developer Program (the long pole: start first)
1. Create an Apple ID for the company, on its own domain (e.g. `apple@sivoov.app`), with
   two-factor authentication. Not a personal Gmail: it becomes the Account Holder.
2. developer.apple.com/programs/enroll → **Organization**. It asks for the legal entity name
   exactly as the D-U-N-S record spells it, the D-U-N-S number, the company website (on the
   same domain as the email helps), and that you can sign for the company.
3. Apple calls or emails to verify, then asks for the 99 € fee. Count days to two weeks; a
   D-U-N-S number Apple cannot see yet adds a delay (Apple has its own D-U-N-S lookup page).
4. Once active: App Store Connect → Users → add yourself as Admin if the Account Holder is a
   separate Apple ID.

## 2. The first iOS build (from the laptop, no Mac tools needed)
```bash
cd app && npx eas-cli login
npx eas-cli build --platform ios --profile production
```
EAS asks to sign in to the Apple account and creates the distribution certificate and the
provisioning profile itself; accept. The build runs in the cloud (~20 min). Then:
```bash
npx eas-cli submit --platform ios --latest
```
The first submit offers to create the App Store Connect app: name "Sivoov" (if taken, "Sivoov
Run"), bundle id `app.sivoov.run`, primary language French, SKU `sivoov-run`. The build appears
in TestFlight after Apple processes it (10-30 min). The encryption question is already answered
by the app (`ITSAppUsesNonExemptEncryption = false`).

## 3. TestFlight
- **Internal testing** (you, and anyone added as a user of the App Store Connect team): no
  review, the build is installable at once. Do the first real run here, screen locked, before
  any organizer sees it.
- **External testing** (the organizers): TestFlight → a group "Organisateurs" → add the build →
  Test Information:
  - Beta App Description: « Sivoov Run : courez la course officielle où vous voulez, la course
    dans les oreilles. Démo pour les organisateurs. »
  - Feedback email, Marketing URL `https://run.sivoov.app/organisateurs`, Privacy Policy URL
    `https://run.sivoov.app/confidentialite`.
  - Sign-in required: yes. User `review@example.com`, password `000000` (the review code,
    `REVIEW_CODE`, see ACCESS.md). Notes for the reviewer: « Saisissez l’email, puis le code à 6
    chiffres ci-dessus (aucun email n’est envoyé à cette adresse). Sur l’écran de la course,
    “Écouter la course en 10 minutes” joue le parcours en accéléré sans GPS ; “Courir” mesure une
    vraie course, écran verrouillé. »
  - Submit for Beta App Review (about a day). Then turn on the **public link** and send it:
    the organizer installs TestFlight, opens the link, installs Sivoov.
- A new build of the same version usually skips review; builds expire after 90 days. JS changes
  reach TestFlight users over the air on the `production` channel with no build at all.
- Put the public link on the install page: `IOS_APP_URL` in `api/wrangler.jsonc` (production
  vars). The button then reads « iPhone (TestFlight) ».

### Before the reviewer or an organizer signs in
- Production has the demo: `/org/<race>/settings` → « Course de démonstration » → « Créer la
  démo » (staff only). App Review's runner comes with it.
- Organizers: add them to the **demo** race's Coureurs with their real email. They sign in with
  the code they receive; nothing they do appears in the real race's admin.

## 4. Google Play
1. play.google.com/console → create a developer account as an **Organization** (25 $ once),
   with the D-U-N-S number; Google verifies the organization and a phone (a few days). An
   organization account skips the "12 testers for 14 days" rule personal accounts have.
2. Create the app "Sivoov", default language French, app (not game), free.
3. Build and upload the first bundle by hand (Play does not accept the first one by API):
   ```bash
   cd app && npx eas-cli build --platform android --profile production
   ```
   Download the `.aab` from the EAS page and upload it in **Testing → Internal testing → Create
   release**. Later builds: `eas submit --platform android` with a Play service account key.
4. Internal testing: add the organizers' Google account emails to a testers list (up to 100),
   copy the **opt-in link**, send it. No review; live in minutes. Put that link in
   `ANDROID_APP_URL`.
5. App content, filled once (Play asks before any release it reviews): privacy policy URL,
   data safety (location precise, name, email; collected, not shared, deletion in the app), ads
   none, target audience adults, content rating questionnaire, and the two declarations this
   app needs: **background location** and the **location foreground service**, each with a
   short video of the feature (start a run, lock the screen, the notification stays, the
   distance keeps counting). The S23 can film it.

## What an iPad can and cannot prove
The app is iPhone-only (`supportsTablet: false`), so an iPad runs it in iPhone compatibility
mode, TestFlight included. It proves the iOS sign-in, the French and English permission
prompts, the audio pack, WAV (Gemini) lines, background audio with the screen locked, ducking
over Spotify, and the demo run. It does not prove GPS or battery: a Wi-Fi iPad has no GPS chip
(a cellular one does). A real run needs an iPhone.

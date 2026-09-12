# Status

Updated: 2026-09-12. Race week: 14-15 November 2026. See PRD section 8 for milestones.

## Now: bootstrap (M1)
Nothing is scaffolded yet. The seed contains docs, cloud-session hook and CI only.

Next slices, in order:
1. `shared/`: package with zod 4, vitest; schemas for race, course, entrant, run, audio;
   `domain/course.ts` and `domain/simulate.ts` ported from HARVEST.md with tests.
2. `api/`: `npm create hono@latest` (cloudflare-workers template) in `api/`; D1 migration
   for the domain model; `/api/health`; magic-code sign-in (`/api/auth/code`, `/api/auth/verify`)
   with Resend behind an interface (console in dev); race landing page + sign-in page rendered
   with Hono JSX and the Sivoov tokens; Playwright screenshot of both.
3. `app/`: `npx create-expo-app@latest app --template blank-typescript` then expo-router;
   sign-in, race home, and a run screen driven by the simulation service on the web target;
   Playwright screenshot of a simulated 10 km.
4. EAS: `eas.json` with development/preview/production profiles, `expo-updates` channels;
   first development build (laptop session, see WORKFLOW.md).
5. Audio pack v0: ceremony placeholders + 3 landmarks for the Deauville half, trigger
   function with tests, playback in the app.

## Decisions taken
- New repo, previous one is reference only (HARVEST.md).
- Web first for everything but the run. Course diagram instead of a map in the app.
- Reuse the Expo project and bundle ids from the previous app.

## Decisions pending
- See PRD section 10 and DESIGN.md open decisions.

## Known state of the seed
- Root `npm run typecheck|test|lint` fail with "No workspaces found" until slice 1 creates
  `shared/`. CI is red on the seed for that reason only.
- Session hook validated in a cloud container (npm install no-op, env vars written).

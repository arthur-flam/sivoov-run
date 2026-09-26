# Access: signing in on local and preview

How a session or a phone gets into the app, the web pages and the organizer admin without
waiting for an email. Nothing here applies to production.

## The fixed test code
Local and preview set the `TEST_CODE` var (`000000`, in `api/wrangler.jsonc`). The verify step
accepts it **only** for accounts on `@example.com` (`api/src/lib/testCode.ts`), so the seeded
test accounts sign in with it and real people still get a real code. Production has no
`TEST_CODE`.

| Environment | URL | Codes |
|---|---|---|
| local | http://localhost:8788 (`npm run dev -w api`) | printed in the Worker log, also returned as `devCode` by `POST /api/auth/code`, or `000000` for test accounts |
| preview | https://preview.run.sivoov.app | `000000` for test accounts; real email (Cloudflare Email Sending) for everybody else |
| production | https://run.sivoov.app | real email only |

## Test runners (race `deauville-2026`, seeded by `npm run seed -w api -- <local|preview>`)
| Bib | Email | Course | Code |
|---|---|---|---|
| 1001 | marc@example.com | half | `000000` |
| 1002 | lea@example.com | marathon | `000000` |
| 1003 | arthur.flam@gmail.com | half | by email |

Web: `/deauville-2026/signin`, bib + email, then the code. App: same three fields on the
sign-in screen; point a dev build at preview with `EXPO_PUBLIC_API_URL=https://preview.run.sivoov.app`.
Web target from a session: `npm run dev -w app`, then `/signin` (the simulation is
`/run?sim=1&pace=5:00&speed=30` once signed in).

## Organizer admin (`/org`)
One sign-in for every race: `/org/signin`, email only, then a six-digit code. After it, a person
on one race lands on it; staff land on the list of every race. Roles are per race
(`organizers.role`), staff come from the `STAFF_EMAILS` var in `api/wrangler.jsonc`.

| Email | Role on deauville-2026 | Code |
|---|---|---|
| arthur.flam@gmail.com | Responsable (owner), and staff | by email |
| orga@example.com | Responsable (owner) | `000000` (local and preview) |
| equipe@example.com | Équipe (editor) | `000000` |
| lecture@example.com | Lecture seule (viewer) | `000000` |
| staff@example.com | none, staff on **local only** | `000000` |

Preview is reachable by anyone who knows the test code, so it is fenced: no test staff account,
real email only to `MAIL_ALLOWLIST` (a wrangler var, addresses or `@domains`; the rest is logged
by the Worker), and a test account cannot render the ElevenLabs voice there. Add a real tester
to `MAIL_ALLOWLIST` to let them receive codes and invitations on preview.

What each role may do is one table, `can()` in `shared/src/domain/access.ts`:
viewer looks and downloads; editor also works on runners, activities and the audio;
owner also edits the race settings and the team; staff do everything on every race and create
races. A script or the screenshot rig takes a session with one post:
`POST /org/signin` with `step=code&email=orga@example.com&code=000000`.

## Curl
```bash
curl -s -X POST https://preview.run.sivoov.app/api/auth/code -H 'content-type: application/json' -d '{"raceSlug":"deauville-2026","bib":"1001","email":"marc@example.com"}'
curl -s -X POST https://preview.run.sivoov.app/api/auth/verify -H 'content-type: application/json' -d '{"raceSlug":"deauville-2026","bib":"1001","email":"marc@example.com","code":"000000"}'
```
The token in the reply is a bearer for `/api/me`, `/api/runs/...`. From the cloud sandbox
these hosts are unreachable (docs/MEMORY.md); run the curl from a laptop or the phone.

## Secrets on the Workers (`wrangler secret put <NAME> [--env preview]`)
`MAPBOX_TOKEN` (set on both, the public `pk.` token from `.env`), `EMAIL_FROM` (optional,
defaults to `Sivoov Run <run@sivoov.app>`). Email needs no key: the `EMAIL` binding sends
through Cloudflare Email Sending, and the zone `sivoov.app` is onboarded
(`npx wrangler email sending list`). Local reads `api/.dev.vars`.

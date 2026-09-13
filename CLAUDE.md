# CLAUDE.md

Sivoov Run: virtual race experiences for real races. A race organizer sells virtual
entries; the runner runs the race distance anywhere during race week, hears the race
in their ears, gets an official time, a certificate and the medal.

Web entry point: https://run.sivoov.app. First race: Marathon International de
Deauville, 14-15 November 2026.

## Read before any task
1. `docs/STATUS.md` - where the project is, what is next (keep it updated).
2. `docs/ARCHITECTURE.md` - stack, repo layout, data model, environments.
3. `docs/MEMORY.md` - append-only log of things learned (dead ends, gotchas). Read it, append to it.
4. `docs/WORKFLOW.md` - how work gets validated and shipped from cloud sessions.

Depending on the task:
- `docs/PRD.md` - product requirements, scope, non-goals, timeline.
- `docs/DESIGN.md` - identity, theming contract, screen conventions. Read for any UI work.
- `docs/AUDIO.md` - audio event model and content pipeline. Read for any audio work.
- `docs/DEVICE.md` - testing on a real Android phone over USB. Read for anything native,
  background location, background audio or the upload queue.
- `docs/HARVEST.md` - modules to port from the previous repo (`arthur-flam/sivoov`).

## Repo layout
```
shared/   zod schemas + pure domain logic (course projection, splits, audio triggers). No I/O.
api/      Cloudflare Worker (Hono): JSON API under /api, server-rendered web pages, organizer admin.
app/      Expo app (runner experience only). Everything that can be a web page is not here.
docs/     the documents above
```
Until `shared/`, `api/` and `app/` exist, the first task is bootstrapping them (see STATUS.md).

## Working rules
- Ship vertical slices: schema + tests, then API, then UI, then a Playwright screenshot
  or a device note. One slice per PR.
- Validate in the container before pushing: `npm run typecheck`, `npm test`, `npm run lint`
  at the root. For UI, drive the web target with Playwright and send screenshots.
- Never add a native module (anything needing a new EAS build) without recording the
  decision in ARCHITECTURE.md's native module list. JS-only changes ship over the air.
- Packages: install freely within the stack listed in ARCHITECTURE.md with
  `npx expo install` in `app/` and `npm install -w <workspace>` elsewhere. Anything outside
  that list: propose it in the PR description with the reason, do not install it.
- French first, English second. Every user-facing string goes through the i18n layer.
- Commit and push on the working branch when a slice is validated. Do not open PRs unless asked.

## Code style
- Functional, light: no data mutation, pure functions, composition, array methods over loops.
- Types come from zod schemas (`z.infer`). Domain schemas live in `shared/` and are the only
  source of truth for API, DB rows and app state.
- Tests next to the code as `*.test.ts`, written against the public API of the module, using
  the real schemas. Tests document business behaviour. Never skip or delete a test.
- Small files, small components. A screen composes components; logic lives in `shared/` or
  in a store, never in a screen.

## Commands
```bash
npm install                  # root, installs all workspaces
npm run typecheck            # all workspaces
npm test                     # all workspaces
npm run lint                 # all workspaces
npm run dev -w api           # wrangler dev, local D1/R2, http://localhost:8788
npm run dev -w app           # expo start (web target usable in the container)
npm run db:migrate:local -w api
```

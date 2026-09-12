# Harvest from `arthur-flam/sivoov`

The previous repo is a different product (city discovery + social) and is not a base.
These modules are worth porting, with their tests, into `shared/`. Port means: copy, strip
the app-specific imports, rewrite to the new schemas, keep the test intent.

| From (old repo) | To | Why |
|---|---|---|
| `backend/src/schemas/audio.ts` + `.test.ts` | `shared/schemas/audio.ts` | trigger types, mix modes, categories: the event model in AUDIO.md |
| `app/src/schemas/routePosition.ts` | `shared/domain/course.ts` | precomputed segments, distance-along-course, bounds |
| `app/src/services/mockLocation.ts` (position-at-distance, interpolation) | `shared/domain/simulate.ts` | simulation mode, first-class here |
| `app/src/utils/positionSmoothing.ts`, `distanceSmoothing.ts` + tests | `shared/domain/smoothing.ts` | Kalman filtering of GPS, keeps distance honest |
| `app/src/utils/locationCalculations.ts` (haversine, bearing, speed) | `shared/domain/geo.ts` | |
| `backend/src/utils/gpx.ts`, `elevation.ts` + tests | `api/src/lib/gpx.ts`, `elevation.ts` | course import |
| `backend/src/domains/live/tts.service.ts` (R2 cache pattern) | `api/tools/audio/tts.ts` | ElevenLabs + cache |
| `app/src/services/locationServiceInterface.ts` | `app/src/services/location/` | the device/simulation/replay interface |
| `app/src/services/location.ts` (background tracking setup) | `app/src/services/location/device.ts` | expo-location background config, permission flow |
| `backend/public/styles.css` tokens | `api/src/pages/styles.css` | Sivoov palette and type |

Not ported: social, comments, friends, profiles, challenges/routes library, CRM, link
service, Clerk auth, TanStack Query layer, NativeWind, Mapbox map components, PostHog.

Lessons carried over (also in MEMORY.md):
- Real GPS distance must drive the virtual position; simulation is for dev only.
- Kalman smoothing on distance, not only on position, avoids jitter in splits.
- Keep debug screens out of the production bundle.

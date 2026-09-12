# Memory (append-only)

- 2026-09-12: Previous repo (`arthur-flam/sivoov`) drifted: CLAUDE.md pointed at folders
  that did not exist and referenced docs that were never written. Cost: every session started
  wrong. Rule here: STATUS.md is updated at the end of every session, no exceptions.
- 2026-09-12: In the previous app, virtual runs were a flag on a 1000-line run screen that
  swapped in a debug mock-location adapter. Lesson: the location source is an interface from
  day one (device, simulation, replay), and the run screen does not know which one it has.
- 2026-09-12: Kalman smoothing on distance (not only on lat/lon) is what made splits stable.
- 2026-09-12: Expo SDK is 57 (React Native 0.86) as of June 2026. Pin the SDK, upgrade only
  between milestones.

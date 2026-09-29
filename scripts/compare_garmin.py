# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=1.26"]
# ///
"""
Compare a Sivoov Run trace (the admin's trace.json) with the owner's Garmin recording of the
same run (Strava streams JSON: time, distance, location, velocity_smooth, ...).

  uv run scripts/compare_garmin.py --garmin strava.json --garmin-start 2026-09-29T15:09:36Z \
      [--trace trace.json] [--fixture shared/src/fixtures/firstRealRun.ts]

Without --trace it reports the Garmin side alone. --fixture replays the first real run through
the Python port of the tracker as a self-check (docs/STATUS.md: 9 225 m).
"""
from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass
from datetime import datetime

import numpy as np

R = 6371008.8


def haversine(lat1, lng1, lat2, lng2):
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dl = np.radians(np.asarray(lng2) - np.asarray(lng1))
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))


def pace(sec_per_m: float) -> str:
    s = sec_per_m * 1000
    return f"{int(s // 60)}:{s % 60:04.1f}/km"


# --- Port of shared/src/domain/smoothing.ts + tracker.ts (DEFAULT_FILTER, DEFAULT_KALMAN) ---
@dataclass
class Filt:
    max_acc: float = 30
    max_speed: float = 10
    min_move: float = 8
    min_move_acc: float = 3
    ceil: float = 1.5
    floor: float = 1.15
    stall_acc: float = 2


def judge(prev, nxt, f: Filt):
    acc = nxt.get("accuracy")
    if acc is not None and acc > f.max_acc:
        return None, "accuracy"
    if prev is None:
        return 0.0, None
    dt = (nxt["timestamp"] - prev["timestamp"]) / 1000
    if dt <= 0:
        return None, "time"
    step = float(haversine(prev["lat"], prev["lng"], nxt["lat"], nxt["lng"]))
    if step / dt > f.max_speed:
        return None, "speed"
    if step < max(f.min_move, (acc or 0) * f.min_move_acc):
        return None, "jitter"
    if prev.get("speed") is None or nxt.get("speed") is None:
        return step, None
    dop = (prev["speed"] + nxt["speed"]) / 2 * dt
    floor = dop / f.floor
    stalled = acc is not None and floor - step > f.stall_acc * acc
    return (floor if stalled else min(step, dop * f.ceil)), ("stall" if stalled else ("ceil" if step > dop * f.ceil else None))


def replay(samples, started_at, f: Filt = Filt(), accel_noise=0.5, default_acc=10.0):
    """Returns per-accepted-fix rows (timestamp, distanceM, rawM) and counters."""
    last = None
    raw = 0.0
    dist = 0.0
    k = None
    out = []
    counts: dict[str, int] = {}
    for s in samples:
        if s["timestamp"] < started_at:
            counts["before_gun"] = counts.get("before_gun", 0) + 1
            continue
        step, why = judge(last, s, f)
        if step is None:
            counts[why] = counts.get(why, 0) + 1
            continue
        if why:
            counts[why] = counts.get(why, 0) + 1
        raw += step
        acc = s.get("accuracy")
        if k is None:
            a = acc if acc is not None else default_acc
            k = dict(d=raw, v=s.get("speed") or 0.0, p=[a * a, 0.0, 0.0, 4.0], t=s["timestamp"])
        else:
            dt = max(0.001, (s["timestamp"] - k["t"]) / 1000)
            d_pred = k["d"] + k["v"] * dt
            q = accel_noise**2
            p00, p01, p10, p11 = k["p"]
            pp00 = p00 + dt * (p10 + p01) + dt * dt * p11 + q * dt**4 / 4
            pp01 = p01 + dt * p11 + q * dt**3 / 2
            pp10 = p10 + dt * p11 + q * dt**3 / 2
            pp11 = p11 + q * dt * dt
            r = (acc if acc is not None else default_acc) ** 2
            si = pp00 + r
            k0, k1 = pp00 / si, pp10 / si
            inn = raw - d_pred
            k = dict(d=d_pred + k0 * inn, v=k["v"] + k1 * inn,
                     p=[(1 - k0) * pp00, (1 - k0) * pp01, pp10 - k1 * pp00, pp11 - k1 * pp01], t=s["timestamp"])
        dist = max(dist, min(k["d"], raw))
        out.append((s["timestamp"], dist, raw))
        last = s
    counts["accepted"] = len(out)
    return np.array(out), counts


# --- Garmin (Strava streams) ---
def load_garmin(path, start_iso):
    d = json.load(open(path))
    s = d.get("streams", d)
    get = lambda k: np.asarray(s[k]["data"] if isinstance(s[k], dict) else s[k], dtype=float) if k in s else None
    t0 = datetime.fromisoformat(start_iso.replace("Z", "+00:00")).timestamp() * 1000
    t = get("time")
    loc = get("location")
    g = dict(ms=t0 + t * 1000, t=t, dist=get("distance"), v=get("velocity_smooth"),
             lat=loc[:, 0], lng=loc[:, 1], hr=get("heart_rate"), cad=get("cadence"), alt=get("altitude"))
    return g


def km_splits(ms, dist, upto=None):
    upto = upto or dist[-1]
    marks = np.arange(1000, upto + 1, 1000)
    at = np.interp(marks, dist, ms)
    return marks, at


def garmin_report(g):
    print("== Garmin Fenix 8 (Strava streams of the DotDot/LiveTrack run)")
    dur = g["t"][-1]
    D = g["dist"][-1]
    print(f"  {D:.1f} m in {dur:.0f} s ({dur/60:.1f} min), avg {pace(dur / D)}, {len(g['t'])} samples")
    pos = float(np.nansum(haversine(g["lat"][:-1], g["lng"][:-1], g["lat"][1:], g["lng"][1:])))
    print(f"  Garmin's own positions summed: {pos:.1f} m ({(pos/D-1)*100:+.2f} % vs its distance)")
    gaps = np.diff(g["t"])
    print(f"  sample gaps: median {np.median(gaps):.0f} s, max {gaps.max():.0f} s")
    marks, at = km_splits(g["ms"], g["dist"])
    prev = g["ms"][0]
    rows = []
    for m, a in zip(marks, at):
        rows.append(f"km{int(m/1000)} {int((a-prev)/1000//60)}:{(a-prev)/1000%60:04.1f}")
        prev = a
    print("   ", " | ".join(rows))


def load_trace(path):
    tr = json.load(open(path))
    samples = sorted(tr["samples"], key=lambda s: s["timestamp"])
    return tr, samples


def compare(g, tr, samples, started_at):
    print("\n== Sivoov trace vs Garmin")
    ts = np.array([s["timestamp"] for s in samples], dtype=float)
    acc = np.array([s.get("accuracy", np.nan) for s in samples], dtype=float)
    spd = np.array([s.get("speed", np.nan) if s.get("speed") is not None else np.nan for s in samples], dtype=float)
    print(f"  {len(samples)} fixes, {(ts[-1]-ts[0])/1000/60:.1f} min, accuracy median {np.nanmedian(acc):.1f} m "
          f"(p95 {np.nanpercentile(acc,95):.1f}), longest gap {np.diff(ts).max()/1000:.1f} s")
    print(f"  gun at {datetime.utcfromtimestamp(started_at/1000).isoformat()}Z; "
          f"Garmin started {(started_at - g['ms'][0])/1000:+.0f} s before it")

    rows, counts = replay(samples, started_at)
    t_app, d_app, raw_app = rows[:, 0], rows[:, 1], rows[:, 2]
    print(f"  tracker replay: {d_app[-1]:.1f} m (raw steps {raw_app[-1]:.1f} m); verdicts {counts}")

    # Garmin distance over the app's own window
    lo, hi = max(started_at, g["ms"][0]), min(t_app[-1], g["ms"][-1])
    gd = lambda t: np.interp(t, g["ms"], g["dist"])
    app_d = lambda t: np.interp(t, t_app, d_app)
    G = gd(hi) - gd(lo)
    A = app_d(hi) - app_d(lo)
    pos_all = float(np.nansum(haversine(np.array([s["lat"] for s in samples[:-1]]), np.array([s["lng"] for s in samples[:-1]]),
                                          np.array([s["lat"] for s in samples[1:]]), np.array([s["lng"] for s in samples[1:]]))))
    win = (ts >= lo) & (ts <= hi)
    dop = float(np.nansum(np.nan_to_num((spd[win][:-1] + spd[win][1:]) / 2) * np.diff(ts[win]) / 1000))
    span = (hi - lo) / 1000
    print(f"  common window {span/60:.1f} min: Garmin {G:.1f} m, app {A:.1f} m ({(A/G-1)*100:+.2f} %)")
    print(f"    app avg pace {pace(span/A)} vs Garmin {pace(span/G)} -> app is {(span/A - span/G)*1000:+.1f} s/km")
    print(f"    phone raw positions (all fixes) {pos_all:.1f} m; phone reported-speed integral {dop:.1f} m ({(dop/G-1)*100:+.2f} %)")

    # km splits: app km calls vs when the Garmin crossed the same distance *from the gun*
    g0 = gd(started_at)
    print("  km splits (app split | Garmin split over the same metres | app call vs Garmin crossing):")
    prev_a = prev_g = started_at
    for km in range(1, int(d_app[-1] // 1000) + 1):
        ta = float(np.interp(km * 1000, d_app, t_app))
        tg = float(np.interp(g0 + km * 1000, g["dist"], g["ms"]))
        print(f"    km{km:>2}: {(ta-prev_a)/1000:6.1f} s | {(tg-prev_g)/1000:6.1f} s | {(ta-tg)/1000:+6.1f} s")
        prev_a, prev_g = ta, tg

    # what each device said at each km call: the app speaks its average since the gun, the
    # watch shows its average since its own start (which includes whatever came before the gun)
    fmt = lambda sec: f"{int(sec // 60)}:{sec % 60:04.1f}"
    w0 = g["ms"][0]
    print(f"  watch before the gun: {gd(started_at):.0f} m in {(started_at - w0)/1000:.0f} s")
    print("  at each km call: app says (avg since gun) | watch avg since its start (diff) | watch avg since the gun (diff)")
    for ev in tr.get("audioFired", []):
        if ev["eventId"] != "personal.split":
            continue
        t = started_at + ev["elapsedMs"]
        app_p = ev["elapsedMs"] / ev["distanceM"]
        w_all = (t - w0) / gd(t)
        w_gun = (t - started_at) / (gd(t) - gd(started_at))
        print(f"    km{round(ev['distanceM']/1000):>2}: {fmt(app_p)} | {fmt(w_all)} ({app_p - w_all:+5.1f}) | {fmt(w_gun)} ({app_p - w_gun:+5.1f})")
    fin = next((ev["elapsedMs"] for ev in tr.get("audioFired", []) if ev["eventId"] == "ceremony.finish"), None)
    if fin:
        tg = float(np.interp(gd(started_at) + 10000, g["dist"], g["ms"]))
        print(f"  official time {fmt(fin/1000)}; the watch covered the same 10 km from the gun in {fmt((tg - started_at)/1000)}")

    # instantaneous pace as shown (30 s window on tracker distance) vs Garmin speed
    t_grid = np.arange(lo + 60_000, hi, 5_000)
    app_v = (app_d(t_grid) - app_d(t_grid - 30_000)) / 30
    g_v = (gd(t_grid) - gd(t_grid - 30_000)) / 30
    ok = (app_v > 1.5) & (g_v > 1.5)
    diff = 1000 / app_v[ok] - 1000 / g_v[ok]
    print(f"  shown pace (30 s window) minus Garmin's over the same 30 s: median {np.median(diff):+.1f} s/km, "
          f"IQR {np.percentile(diff,25):+.1f}..{np.percentile(diff,75):+.1f}")

    # phone reported speed vs Garmin, per 5 minutes
    print("  per 5 min: Garmin m | app m | phone speed integral m")
    for a in np.arange(lo, hi - 60_000, 300_000):
        b = min(a + 300_000, hi)
        w = (ts >= a) & (ts <= b)
        di = float(np.nansum(np.nan_to_num((spd[w][:-1] + spd[w][1:]) / 2) * np.diff(ts[w]) / 1000))
        gm, am = gd(b) - gd(a), app_d(b) - app_d(a)
        print(f"    {(a-started_at)/60000:5.1f}': {gm:7.1f} | {am:7.1f} ({(am/gm-1)*100:+5.1f} %) | {di:7.1f} ({(di/gm-1)*100:+5.1f} %)")

    # time alignment check: lag maximising speed correlation
    tt = np.arange(lo + 30_000, hi - 30_000, 1000)
    pv = np.interp(tt, ts, np.nan_to_num(spd, nan=np.nanmedian(spd)))
    best = max(range(-10, 11), key=lambda L: np.corrcoef(pv, np.interp(tt + L * 1000, g["ms"], g["v"]))[0, 1])
    print(f"  clock alignment: phone speed best matches Garmin speed shifted {best:+d} s")

    diag = tr.get("diagnostics") or {}
    lines = diag.get("lines", [])
    bat = [(l["atMs"], l["message"]) for l in lines if l.get("tag") == "battery" and re.search(r"\d+ %", l.get("message", ""))]
    print("\n== Battery (logbook)")
    if not bat:
        print("  no battery lines in the trace")
    for at, msg in bat:
        print(f"  {at/60000:6.1f} min  {msg}")
    lv = [(at, int(m.group(1))) for at, msg in bat if (m := re.search(r"(\d+) %", msg))]
    if len(lv) >= 2:
        (a0, l0), (a1, l1) = lv[0], lv[-1]
        rate = (l0 - l1) / ((a1 - a0) / 3_600_000)
        print(f"  {l0} -> {l1} % over {(a1-a0)/60000:.0f} min = {rate:.1f} %/h; a 4 h marathon would use {rate*4:.0f} %")
    print("  counters:", diag.get("counters"))
    for l in lines:
        if l.get("tag") != "battery" and re.search(r"battery|saver|refused|failed", l.get("message", "")):
            print(f"  {l['atMs']/60000:6.1f} min  [{l['tag']}] {l['message'].splitlines()[0][:140]}")


def load_fixture(path):
    rows = re.findall(r"^\[(\d+),([-\d.]+),([-\d.]+),([\d.]+),([\d.]+)\],?$", open(path).read(), re.M)
    return [dict(timestamp=int(a), lat=float(b), lng=float(c), accuracy=float(d), speed=float(e)) for a, b, c, d, e in rows]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--garmin")
    ap.add_argument("--garmin-start")
    ap.add_argument("--trace")
    ap.add_argument("--fixture")
    a = ap.parse_args()
    if a.fixture:
        s = load_fixture(a.fixture)
        rows, counts = replay(s, s[0]["timestamp"])
        print(f"== fixture self-check: {len(s)} fixes -> {rows[-1,1]:.1f} m (TS tracker: 9 225 m) {counts}")
    if a.garmin:
        g = load_garmin(a.garmin, a.garmin_start)
        garmin_report(g)
        if a.trace:
            tr, samples = load_trace(a.trace)
            started = tr.get("startedAt")
            started_at = (datetime.fromisoformat(started.replace("Z", "+00:00")).timestamp() * 1000) if isinstance(started, str) else samples[0]["timestamp"]
            compare(g, tr, samples, started_at)

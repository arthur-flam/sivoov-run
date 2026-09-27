/**
 * Battery readings for the device logbook. The PRD budgets half a phone for a marathon, and
 * the first real run could only guess at it ("60 to 30 %, maybe?"). One line at the start, one
 * every five minutes while fixes arrive, one at the stop. Each says what changes the meaning of
 * the level: charging, power saving, and Android's battery optimization (which Samsung uses to
 * throttle background apps).
 */
export const BATTERY_EVERY_MS = 5 * 60_000;
/** A reading never holds up the run: the start of GPS and the finish both wait on it at most this long. */
export const BATTERY_TIMEOUT_MS = 2000;

export type PowerReading = {
  /** 0 to 1, or -1 when the phone does not say. */
  level: number;
  charging: boolean;
  lowPower: boolean;
  /** Android only: the app is subject to battery optimization. */
  optimized?: boolean;
};

export const batteryLine = (why: string, r: PowerReading): string =>
  [
    `${why}: ${r.level < 0 ? 'level unknown' : `${Math.round(r.level * 100)} %`}`,
    ...(r.charging ? ['charging'] : []),
    ...(r.lowPower ? ['power saving on'] : []),
    ...(r.optimized ? ['battery optimization on'] : []),
  ].join(', ');

type Deps = {
  read: () => Promise<PowerReading>;
  log: (message: string) => void;
  now: () => number;
  everyMs?: number;
  timeoutMs?: number;
};

const within = <T>(ms: number, promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const createBatteryLog = ({ read, log, now, everyMs = BATTERY_EVERY_MS, timeoutMs = BATTERY_TIMEOUT_MS }: Deps) => {
  // When the last reading was taken; null outside a run, so nothing is read between runs.
  let lastAt: number | null = null;

  const record = async (why: string): Promise<void> => {
    lastAt = now();
    try {
      log(batteryLine(why, await within(timeoutMs, read())));
    } catch (e) {
      log(`${why}: unreadable (${e instanceof Error ? e.message : String(e)})`);
    }
  };

  return {
    start: () => record('start'),
    /** Called with every batch of fixes: reads again once the last reading is old enough. */
    due: (): void => {
      if (lastAt !== null && now() - lastAt >= everyMs) void record('run');
    },
    stop: async (): Promise<void> => {
      if (lastAt === null) return;
      await record('stop');
      lastAt = null;
    },
  };
};

/** A run id without a native crypto module: time plus entropy is enough for one runner. */
export const newRunId = (now = Date.now()): string => `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

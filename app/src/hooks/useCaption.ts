import { useEffect, useRef, useState } from 'react';
import { LINGER_MS, SILENT_CAPTION_MS, captionLine, useSaid } from '@/audio/said';
import type { SaidLine, SpeechTiming } from '@/audio/said';

/**
 * The line the run screen's caption shows, whether the voice is speaking it, and its timing
 * (when its sound began and how long it lasts; a line with no sound, the time it stays on
 * screen) so long words can scroll as they are said. A spoken line stays a moment after its
 * sound ends; a line with no sound stays a few seconds (said.ts).
 */
export const useCaption = (): { line: SaidLine | null; speaking: boolean; timing: SpeechTiming | null } => {
  const lines = useSaid((s) => s.lines);
  const speaking = useSaid((s) => s.speaking);
  const heard = useSaid((s) => s.timing);
  const [now, setNow] = useState(() => Date.now());
  const [lingering, setLingering] = useState<SaidLine | null>(null);
  const spoken = useRef<SaidLine | null>(null);
  const line = captionLine(lines, speaking, now, lingering);

  useEffect(() => {
    if (speaking) spoken.current = line;
  });

  useEffect(() => {
    if (speaking) return setLingering(null);
    if (!spoken.current) return;
    setLingering(spoken.current);
    spoken.current = null;
    const id = setTimeout(() => setLingering(null), LINGER_MS);
    return () => clearTimeout(id);
  }, [speaking]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const timing = speaking ? heard : line?.sound === 'silent' ? { startedAt: line.at, durationMs: SILENT_CAPTION_MS - 1000 } : null;
  return { line, speaking: speaking !== null, timing };
};

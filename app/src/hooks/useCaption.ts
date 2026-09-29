import { useEffect, useRef, useState } from 'react';
import { LINGER_MS, captionLine, useSaid } from '@/audio/said';
import type { SaidLine } from '@/audio/said';

/**
 * The line the run screen's caption shows, and whether the voice is speaking it. A spoken line
 * stays a moment after its sound ends; a line with no sound stays a few seconds (said.ts).
 */
export const useCaption = (): { line: SaidLine | null; speaking: boolean } => {
  const lines = useSaid((s) => s.lines);
  const speaking = useSaid((s) => s.speaking);
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

  return { line, speaking: speaking !== null };
};

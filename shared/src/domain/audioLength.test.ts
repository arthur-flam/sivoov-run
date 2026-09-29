import { describe, expect, it } from 'vitest';
import { audioSeconds } from './audioLength';

const bytes = (...parts: (number[] | string)[]): Uint8Array =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

/** A mono 16-bit WAV header (what Gemini answers) announcing `dataBytes` of sound. */
const wav = (rate: number, dataBytes: number, extra: (number[] | string)[] = []) =>
  bytes('RIFF', le32(36 + dataBytes), 'WAVE', ...extra, 'fmt ', le32(16), [1, 0, 1, 0], le32(rate), le32(rate * 2), [2, 0, 16, 0], 'data', le32(dataBytes));

describe('how long a sound lasts, from its first bytes', () => {
  it('reads a WAV from its header, whatever chunks come before the sound', () => {
    expect(audioSeconds(wav(24_000, 480_000), 480_044)).toBe(10);
    expect(audioSeconds(wav(24_000, 240_000, ['LIST', le32(4), 'INFO']), 240_056)).toBe(5);
  });

  it('takes the file’s own length when a streamed WAV does not say its size', () => {
    expect(audioSeconds(wav(24_000, 0xffffffff), 44 + 72_000)).toBe(1.5);
  });

  it('counts the frames of an MP3 that carries them (Xing, Info), past its ID3 tag', () => {
    // MPEG-1 layer III, 128 kb/s, 44.1 kHz, stereo; 383 frames of 1152 samples.
    const id3 = bytes('ID3', [4, 0, 0, 0, 0, 0, 20], new Array<number>(20).fill(0));
    const frame = bytes([0xff, 0xfb, 0x90, 0x00], new Array<number>(32).fill(0), 'Info', be32(1), be32(383));
    expect(audioSeconds(Uint8Array.from([...id3, ...frame]), 200_000)).toBeCloseTo(10.005, 3);
  });

  it('reads a constant bitrate MP3 from its size', () => {
    // MPEG-2 layer III, 64 kb/s, 24 kHz, mono: 80 000 bytes are ten seconds.
    const frame = bytes([0xff, 0xf3, 0x84, 0xc4], new Array<number>(60).fill(0));
    expect(audioSeconds(frame, 80_000)).toBe(10);
  });

  it('says nothing for what it cannot read', () => {
    expect(audioSeconds(bytes('OggS', new Array<number>(40).fill(0)))).toBeNull();
    expect(audioSeconds(bytes('RIFF', le32(4), 'WAVE'))).toBeNull();
    expect(audioSeconds(new Uint8Array(0))).toBeNull();
  });
});

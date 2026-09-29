/**
 * How long a sound lasts, read from the first bytes of its file, with no decoder: the studio
 * checks the countdown line (its digits follow the file) without downloading or decoding it.
 * WAV (the Gemini voice) and MP3 layer III (ElevenLabs, organizers' files); null for anything
 * else or a header it cannot read. Pure.
 */

const ascii = (bytes: Uint8Array, at: number, length: number): string => String.fromCharCode(...bytes.subarray(at, at + length));
const u32le = (b: Uint8Array, at: number): number => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;
const u32be = (b: Uint8Array, at: number): number => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;

type Chunk = { id: string; at: number; size: number };

/** RIFF chunks after the 12-byte header, as far as the bytes go. */
const chunks = (b: Uint8Array, at = 12): Chunk[] => {
  if (at + 8 > b.length) return [];
  const chunk = { id: ascii(b, at, 4), at: at + 8, size: u32le(b, at + 4) };
  return chunk.id === 'data' ? [chunk] : [chunk, ...chunks(b, chunk.at + chunk.size + (chunk.size % 2))];
};

const wavSeconds = (b: Uint8Array, totalBytes: number): number | null => {
  const found = chunks(b);
  const fmt = found.find((c) => c.id === 'fmt ');
  const data = found.find((c) => c.id === 'data');
  if (!fmt || !data || fmt.at + 12 > b.length) return null;
  const byteRate = u32le(b, fmt.at + 8);
  // A streamed WAV may say 0 or 0xFFFFFFFF: the file's own length then tells.
  const size = Math.min(data.size || Number.MAX_SAFE_INTEGER, totalBytes - data.at);
  return byteRate > 0 && size > 0 ? size / byteRate : null;
};

const MPEG1_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_KBPS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** Past an ID3v2 tag, if the file opens with one. */
const afterId3 = (b: Uint8Array): number => {
  if (b.length < 10 || ascii(b, 0, 3) !== 'ID3') return 0;
  const size = ((b[6]! & 0x7f) << 21) | ((b[7]! & 0x7f) << 14) | ((b[8]! & 0x7f) << 7) | (b[9]! & 0x7f);
  return 10 + size + (b[5]! & 0x10 ? 10 : 0);
};

const frameAt = (b: Uint8Array, from: number): number => {
  const i = b.subarray(from).findIndex((x, j, arr) => x === 0xff && ((arr[j + 1] ?? 0) & 0xe0) === 0xe0);
  return i < 0 ? -1 : from + i;
};

const mp3Seconds = (b: Uint8Array, totalBytes: number): number | null => {
  const at = frameAt(b, afterId3(b));
  if (at < 0 || at + 4 > b.length) return null;
  const version = (b[at + 1]! >> 3) & 3;
  const layer = (b[at + 1]! >> 1) & 3;
  const kbps = (version === 3 ? MPEG1_KBPS : MPEG2_KBPS)[b[at + 2]! >> 4];
  const rate = RATES[version]?.[(b[at + 2]! >> 2) & 3];
  if (version === 1 || layer !== 1 || !kbps || !rate) return null;
  const samples = version === 3 ? 1152 : 576;
  const mono = b[at + 3]! >> 6 === 3;
  // A Xing/Info frame (LAME, and every VBR file) counts the frames: exact.
  const xing = at + 4 + (version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17);
  const tag = xing + 12 <= b.length ? ascii(b, xing, 4) : '';
  if ((tag === 'Xing' || tag === 'Info') && u32be(b, xing + 4) & 1) return (u32be(b, xing + 8) * samples) / rate;
  // Otherwise a constant bitrate: the bytes say the length.
  return ((totalBytes - at) * 8) / (kbps * 1000);
};

/** Seconds of sound in a file, from its first bytes (`head`, 64 KB is plenty) and its size. */
export const audioSeconds = (head: Uint8Array, totalBytes: number = head.length): number | null => {
  if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WAVE') return wavSeconds(head, totalBytes);
  return mp3Seconds(head, totalBytes);
};

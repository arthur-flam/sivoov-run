import { describe, expect, it } from 'vitest';
import { geminiAudioOf, geminiPrompt, geminiTtsBody, geminiWav, isGeminiVoice, pcmToWav, plausibleSeconds, voiceFormat, wavSeconds } from './geminiVoice';
import { voiceCacheInput } from './audioScript';

const gemini = { id: 'Sadachbia', name: 'Le speaker', model: 'gemini-3.8-flash-tts', direction: 'Le speaker, enthousiaste.' };

describe('Gemini voices', () => {
  it('are told apart from ElevenLabs ones by their model, and render to WAV', () => {
    expect(isGeminiVoice(gemini)).toBe(true);
    expect(voiceFormat(gemini)).toBe('wav');
    expect(voiceFormat({ model: 'eleven_v3' })).toBe('mp3');
  });

  it('get the direction as notes to play and only the words to read, without v3 tags', () => {
    const prompt = geminiPrompt('Enthousiaste.', '[excited] Partez !', 'Sur la sono.');
    expect(prompt).toBe("# AUDIO PROFILE: le speaker de la course\n## THE SCENE: Sur la sono.\n### DIRECTOR'S NOTES\nEnthousiaste.\n#### TRANSCRIPT\nPartez !");
    expect(geminiTtsBody(gemini, 'Partez !')).toMatchObject({
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Sadachbia' } } } },
    });
  });

  it('render again when their direction changes', () => {
    expect(voiceCacheInput(gemini, 'Partez !')).not.toBe(voiceCacheInput({ ...gemini, direction: 'Calme.' }, 'Partez !'));
    expect(voiceCacheInput({ id: 'x', name: 'x', model: 'eleven_v3', direction: 'ignored' }, 'a')).toBe(voiceCacheInput({ id: 'x', name: 'x', model: 'eleven_v3' }, 'a'));
  });

  it('answer raw PCM, wrapped in a 44-byte WAV header at 24 kHz mono', () => {
    const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]));
    const v = new DataView(wav.buffer);
    expect(String.fromCharCode(...wav.slice(0, 4), ...wav.slice(8, 12))).toBe('RIFFWAVE');
    expect(v.getUint32(24, true)).toBe(24000);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(40, true)).toBe(4);
    expect([...wav.slice(44)]).toEqual([1, 2, 3, 4]);
  });

  it('keep a WAV the model already wrapped, instead of wrapping it twice', () => {
    const wav = pcmToWav(new Uint8Array([9, 9]));
    expect(geminiWav(wav)).toBe(wav);
    expect(geminiWav(new Uint8Array([9, 9])).length).toBe(46);
  });

  it('tell a take that read its notes aloud from one that said its words', () => {
    expect(wavSeconds(pcmToWav(new Uint8Array(48_000)))).toBe(1);
    expect(wavSeconds(new Uint8Array(10))).toBeNull();
    expect(plausibleSeconds('Un kilomètre de plus.', 2.2)).toBe(true);
    expect(plausibleSeconds('Un kilomètre de plus.', 23.8)).toBe(false);
    expect(plausibleSeconds('Bonjour Paris ! Bienvenue au 10 km des Champs-Élysées ! Vingt mille coureurs cette semaine sur la plus belle avenue du monde… et vous en êtes.', 12.1)).toBe(true);
  });

  it('find the audio in an answer, or say there is none', () => {
    expect(geminiAudioOf({ candidates: [{ content: { parts: [{ text: 'hm' }, { inlineData: { data: 'AAA=' } }] } }] })).toBe('AAA=');
    expect(geminiAudioOf({ candidates: [] })).toBeNull();
    expect(geminiAudioOf(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { geminiAudioOf, geminiPrompt, geminiTtsBody, isGeminiVoice, pcmToWav, voiceFormat } from './geminiVoice';
import { voiceCacheInput } from './audioScript';

const gemini = { id: 'Sadachbia', name: 'Le speaker', model: 'gemini-3.8-flash-tts', direction: 'Le speaker, enthousiaste.' };

describe('Gemini voices', () => {
  it('are told apart from ElevenLabs ones by their model, and render to WAV', () => {
    expect(isGeminiVoice(gemini)).toBe(true);
    expect(voiceFormat(gemini)).toBe('wav');
    expect(voiceFormat({ model: 'eleven_v3' })).toBe('mp3');
  });

  it('get the direction as notes to play and only the words to read, without v3 tags', () => {
    const prompt = geminiPrompt('Enthousiaste.', '[excited] Partez !');
    expect(prompt).toBe("### DIRECTOR'S NOTES\nEnthousiaste.\n### TRANSCRIPT\nPartez !");
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

  it('find the audio in an answer, or say there is none', () => {
    expect(geminiAudioOf({ candidates: [{ content: { parts: [{ text: 'hm' }, { inlineData: { data: 'AAA=' } }] } }] })).toBe('AAA=');
    expect(geminiAudioOf({ candidates: [] })).toBeNull();
    expect(geminiAudioOf(null)).toBeNull();
  });
});

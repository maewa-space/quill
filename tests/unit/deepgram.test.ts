import { describe, it, expect } from 'vitest';
import {
  parseDeepgramMessage,
  __buildUrlForTesting,
} from '../../src/main/services/deepgram.js';

describe('parseDeepgramMessage', () => {
  it('extracts text + timing from a Results message', () => {
    const raw = JSON.stringify({
      type: 'Results',
      is_final: true,
      start: 12.34,
      duration: 1.5,
      channel: {
        alternatives: [{ transcript: 'Hello there', confidence: 0.98 }],
      },
    });
    const parsed = parseDeepgramMessage(raw, 'mic');
    expect(parsed).not.toBeNull();
    expect(parsed!.text).toBe('Hello there');
    expect(parsed!.isFinal).toBe(true);
    expect(parsed!.startedAtMs).toBe(12340);
    expect(parsed!.durationMs).toBe(1500);
  });

  it('marks speech_final as final too', () => {
    const raw = JSON.stringify({
      channel: {
        alternatives: [{ transcript: 'last word' }],
      },
      speech_final: true,
    });
    const parsed = parseDeepgramMessage(raw, 'system');
    expect(parsed!.isFinal).toBe(true);
  });

  it('returns null for empty transcripts', () => {
    const raw = JSON.stringify({
      type: 'Results',
      channel: { alternatives: [{ transcript: '   ' }] },
    });
    expect(parseDeepgramMessage(raw, 'mic')).toBeNull();
  });

  it('returns null for non-Results messages', () => {
    const raw = JSON.stringify({ type: 'Metadata', request_id: 'abc' });
    expect(parseDeepgramMessage(raw, 'mic')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parseDeepgramMessage('not-json', 'mic')).toBeNull();
  });

  it('captures detected language when present', () => {
    const raw = JSON.stringify({
      type: 'Results',
      is_final: true,
      channel: {
        alternatives: [{ transcript: 'Guten Tag' }],
        detected_language: 'de',
      },
    });
    const parsed = parseDeepgramMessage(raw, 'mic');
    expect(parsed!.detectedLanguage).toBe('de');
  });

  it('returns null speakerIndex when diarization is not active', () => {
    const raw = JSON.stringify({
      type: 'Results',
      is_final: true,
      channel: {
        alternatives: [
          {
            transcript: 'plain transcript',
            words: [{ word: 'plain' }, { word: 'transcript' }],
          },
        ],
      },
    });
    const parsed = parseDeepgramMessage(raw, 'system');
    expect(parsed!.speakerIndex).toBeNull();
  });

  it('extracts the dominant speaker from diarized words', () => {
    const raw = JSON.stringify({
      type: 'Results',
      is_final: true,
      channel: {
        alternatives: [
          {
            transcript: 'hi there everyone',
            // 0 dominates 2-to-1 — should win even though 1 has one word.
            words: [
              { word: 'hi', speaker: 0 },
              { word: 'there', speaker: 0 },
              { word: 'everyone', speaker: 1 },
            ],
          },
        ],
      },
    });
    const parsed = parseDeepgramMessage(raw, 'system');
    expect(parsed!.speakerIndex).toBe(0);
  });
});

describe('buildUrl', () => {
  it('omits language and diarize for the bare auto-detect case', () => {
    // Auto = no language param sent. Deepgram Nova-3 then defaults to
    // English, which is what we want until we can ship multilingual mode
    // safely (language=multi broke transcription with our current param
    // combo — see commit history).
    const url = __buildUrlForTesting();
    expect(url).not.toContain('language=');
    expect(url).not.toContain('diarize=');
  });

  it('skips the language param when explicitly "auto"', () => {
    expect(__buildUrlForTesting('auto')).not.toContain('language=');
  });

  it('appends &language=<code> for an explicit locale', () => {
    expect(__buildUrlForTesting('de')).toContain('&language=de');
    expect(__buildUrlForTesting('zh')).toContain('&language=zh');
  });

  it('appends &diarize=true when diarization is on', () => {
    expect(__buildUrlForTesting(undefined, true)).toContain('&diarize=true');
    expect(__buildUrlForTesting('en', true)).toContain('&language=en');
    expect(__buildUrlForTesting('en', true)).toContain('&diarize=true');
  });

  it('omits diarize when explicitly false', () => {
    expect(__buildUrlForTesting('en', false)).not.toContain('diarize=');
  });
});

// Streaming capture pipeline used when a Deepgram key is set.
//
// Mic side  : getUserMedia → AudioContext → AudioWorkletNode (downsamples
//             to 16kHz Int16 PCM) → IPC frame to main → Deepgram WS (mic)
// System side: AudioTee binary in main → forwarded directly to Deepgram WS
//             (system) without round-tripping through the renderer
//
// Returns a state machine compatible with useAudioCapture so meeting.tsx
// doesn't have to fork its UI between pipelines. Transcript events arrive
// via window.quill.deepgram.onTranscript and are pushed up through onEntry.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Speaker, TranscriptEntry } from '@shared/types.js';
// `?url` tells Vite to treat the worklet as a raw static asset and emit
// its resolved URL — without this Vite tries to bundle it as a regular
// module and chokes on `AudioWorkletProcessor` (which only exists in the
// worklet global scope).
import pcmWorkletUrl from '../worklets/pcm-processor.js?url';

// Mirror useAudioCapture's shape (idle | starting | recording | stopping | error).
export type CaptureState =
  | 'idle'
  | 'starting'
  | 'recording'
  | 'stopping'
  | 'error';

export interface StreamingCaptureOptions {
  meetingId: string;
  /** ISO-639-1 / BCP-47 code, or undefined to let Deepgram auto-detect. */
  language?: string;
  /** When true, ask Deepgram to diarize each channel (system audio gets
   *  per-speaker labels). The mic channel always renders as "You". */
  diarize?: boolean;
  /** Called on every Deepgram transcript event. The hook upgrades interim
   *  to final transparently — callers see one onEntry per finalized span. */
  onEntry: (entry: TranscriptEntry) => void;
  /** Called on every interim event so the meeting page can render an
   *  in-flight ghost paragraph. */
  onInterim?: (info: {
    speaker: Speaker;
    text: string;
    startedAtMs: number;
  }) => void;
  onLevel?: (mic: number, system: number) => void;
}

interface UseStreamingCaptureResult {
  state: CaptureState;
  error: string | null;
  micError: string | null;
  systemError: string | null;
  hasMic: boolean;
  hasSystem: boolean;
  /** Set while the Deepgram WS is reconnecting after a non-user close. The
   *  UI surfaces a quiet "reconnecting…" microcopy instead of an error
   *  banner; cleared on the next 'reconnected' or 'open' state event. */
  reconnecting: boolean;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  retrySystem: () => Promise<void>;
}

const PCM_WORKLET_URL = pcmWorkletUrl;

export function useStreamingCapture(
  opts: StreamingCaptureOptions,
): UseStreamingCaptureResult {
  const [state, setState] = useState<CaptureState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [hasMic, setHasMic] = useState(false);
  const [hasSystem, setHasSystem] = useState(false);
  // Track per-channel reconnect state and derive a single boolean for the UI.
  const [reconnectingChannels, setReconnectingChannels] = useState<{
    mic: boolean;
    system: boolean;
  }>({ mic: false, system: false });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const transcriptUnsubRef = useRef<(() => void) | null>(null);
  const stateUnsubRef = useRef<(() => void) | null>(null);
  const errorUnsubRef = useRef<(() => void) | null>(null);
  const audioTapLevelUnsubRef = useRef<(() => void) | null>(null);
  // Each channel updates independently and fires onLevel separately; without
  // remembering the last value of the OTHER side, mic events (fire every
  // ~10ms) keep stomping the system level back to 0 so its meter never moves.
  const latestMicLevelRef = useRef(0);
  const latestSysLevelRef = useRef(0);

  const cleanupMic = useCallback(() => {
    if (workletRef.current) {
      try {
        workletRef.current.disconnect();
      } catch {
        /* node may have already been GC'd if context closed */
      }
      workletRef.current = null;
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        /* same */
      }
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    if (micStreamRef.current) {
      for (const t of micStreamRef.current.getTracks()) t.stop();
      micStreamRef.current = null;
    }
  }, []);

  const cleanupListeners = useCallback(() => {
    transcriptUnsubRef.current?.();
    transcriptUnsubRef.current = null;
    stateUnsubRef.current?.();
    stateUnsubRef.current = null;
    errorUnsubRef.current?.();
    errorUnsubRef.current = null;
    audioTapLevelUnsubRef.current?.();
    audioTapLevelUnsubRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'starting') return;
    setState('starting');
    setError(null);
    setMicError(null);
    setSystemError(null);

    // 1. Mic — getUserMedia + AudioWorklet.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      micStreamRef.current = stream;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      await ctx.audioWorklet.addModule(PCM_WORKLET_URL);
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;
      const node = new AudioWorkletNode(ctx, 'pcm-processor', {
        processorOptions: { targetSampleRate: 16000 },
      });
      workletRef.current = node;
      node.port.onmessage = (e) => {
        const buf = e.data as ArrayBuffer;
        // Forward the Int16 PCM to Deepgram via main.
        window.quill.deepgram
          .sendFrame({ speaker: 'mic', pcm: buf })
          .catch(() => undefined);
        // Cheap mic level meter — RMS of the Int16 frame.
        if (opts.onLevel) {
          const view = new Int16Array(buf);
          let sumSq = 0;
          for (let i = 0; i < view.length; i++) {
            const n = view[i] / 32768;
            sumSq += n * n;
          }
          const rms = Math.sqrt(sumSq / view.length);
          const micLvl = Math.min(1, rms * 6);
          latestMicLevelRef.current = micLvl;
          opts.onLevel(micLvl, latestSysLevelRef.current);
        }
      };
      // Chromium needs the worklet to be connected through to the
      // destination for `process()` to fire — but we don't want to echo
      // the mic back to speakers, so route through a 0-gain node.
      const muteGain = ctx.createGain();
      muteGain.gain.value = 0;
      source.connect(node);
      node.connect(muteGain).connect(ctx.destination);
      setHasMic(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[streaming] mic init failed:', err);
      setMicError(msg);
      setHasMic(false);
    }

    // 2. Subscribe to transcript events BEFORE opening the session.
    transcriptUnsubRef.current = window.quill.deepgram.onTranscript((evt) => {
      if (evt.meetingId !== opts.meetingId) return;
      if (!evt.text) return;
      if (evt.isFinal) {
        // Persist to DB so reload preserves the transcript. Mirrors the
        // batch path where useChunkedTranscriber calls transcript.append
        // on each finalized chunk.
        window.quill.transcript
          .append({
            meetingId: opts.meetingId,
            speaker: evt.speaker as Speaker,
            text: evt.text,
            startedAtMs: evt.startedAtMs,
            durationMs: evt.durationMs,
          })
          .then((entry) => opts.onEntry(entry))
          .catch((err) => {
            console.warn('[streaming] persist failed; rendering ephemeral:', err);
            opts.onEntry({
              id: `${evt.speaker}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              meetingId: opts.meetingId,
              speaker: evt.speaker as Speaker,
              text: evt.text,
              startedAtMs: evt.startedAtMs,
              durationMs: evt.durationMs,
            });
          });
      } else if (opts.onInterim) {
        opts.onInterim({
          speaker: evt.speaker as Speaker,
          text: evt.text,
          startedAtMs: evt.startedAtMs,
        });
      }
    });
    stateUnsubRef.current = window.quill.deepgram.onState((info) => {
      if (info.speaker !== 'mic' && info.speaker !== 'system') return;
      if (info.state === 'reconnecting') {
        setReconnectingChannels((prev) => ({ ...prev, [info.speaker]: true }));
      } else if (
        info.state === 'reconnected' ||
        info.state === 'open' ||
        info.state === 'closed'
      ) {
        setReconnectingChannels((prev) => ({ ...prev, [info.speaker]: false }));
      }
    });
    errorUnsubRef.current = window.quill.deepgram.onError((info) => {
      if (info.speaker === 'mic') setMicError(info.message);
      else setSystemError(info.message);
    });

    // 3. System audio level meter via existing AudioTee level event.
    audioTapLevelUnsubRef.current = window.quill.audioTap.onLevel((info) => {
      latestSysLevelRef.current = info.level;
      if (opts.onLevel) opts.onLevel(latestMicLevelRef.current, info.level);
    });

    // 4. Open the Deepgram session BEFORE starting AudioTee — audio-tap.ts
    //    checks isDeepgramRunning() on every PCM frame, so the streaming
    //    fork only kicks in once the session exists.
    try {
      await window.quill.deepgram.open({
        meetingId: opts.meetingId,
        language: opts.language,
        diarize: opts.diarize,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setState('error');
      cleanupMic();
      cleanupListeners();
      return;
    }

    // 5. Start AudioTee for system audio (it'll forward PCM directly to DG
    //    in main, no IPC round-trip).
    try {
      await window.quill.audioTap.start(0); // chunkSeconds unused in streaming mode
      setHasSystem(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[streaming] system audio start failed:', err);
      setSystemError(msg);
      setHasSystem(false);
    }

    setState('recording');
  }, [cleanupListeners, cleanupMic, opts, state]);

  const stop = useCallback(async () => {
    if (state === 'idle' || state === 'stopping') return;
    setState('stopping');
    try {
      await window.quill.audioTap.stop();
    } catch (err) {
      console.warn('[streaming] audio-tap stop:', err);
    }
    try {
      await window.quill.deepgram.close();
    } catch (err) {
      console.warn('[streaming] deepgram close:', err);
    }
    cleanupMic();
    cleanupListeners();
    setHasMic(false);
    setHasSystem(false);
    setReconnectingChannels({ mic: false, system: false });
    latestMicLevelRef.current = 0;
    latestSysLevelRef.current = 0;
    setState('idle');
  }, [cleanupListeners, cleanupMic, state]);

  const retrySystem = useCallback(async () => {
    try {
      await window.quill.audioTap.stop();
    } catch {
      /* ignore */
    }
    try {
      await window.quill.audioTap.start(0);
      setHasSystem(true);
      setSystemError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSystemError(msg);
      setHasSystem(false);
    }
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      cleanupMic();
      cleanupListeners();
    };
  }, [cleanupListeners, cleanupMic]);

  return {
    state,
    error,
    micError,
    systemError,
    hasMic,
    hasSystem,
    reconnecting: reconnectingChannels.mic || reconnectingChannels.system,
    start,
    stop,
    retrySystem,
  };
}

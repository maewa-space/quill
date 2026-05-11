import { useEffect, useState } from 'react';
import {
  TRANSCRIPT_LANGUAGES,
  languageToStored,
} from '@shared/transcript-language.js';
import {
  Calendar,
  Check,
  KeyRound,
  Languages,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import { Masthead } from '../components/Masthead';
import { formatIssueDate } from '../lib/issue';
import type { CalendarStatusBridge } from '../../../preload/index';

export function SettingsRoute() {
  const [openaiSet, setOpenaiSet] = useState(false);
  const [anthropicSet, setAnthropicSet] = useState(false);
  const [openrouterSet, setOpenrouterSet] = useState(false);
  const [deepgramSet, setDeepgramSet] = useState(false);
  const [openaiInput, setOpenaiInput] = useState('');
  const [anthropicInput, setAnthropicInput] = useState('');
  const [openrouterInput, setOpenrouterInput] = useState('');
  const [deepgramInput, setDeepgramInput] = useState('');
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [savingAnthropic, setSavingAnthropic] = useState(false);
  const [savingOpenrouter, setSavingOpenrouter] = useState(false);
  const [savingDeepgram, setSavingDeepgram] = useState(false);

  const refresh = async () => {
    setOpenaiSet(await window.quill.keys.has('openai'));
    setAnthropicSet(await window.quill.keys.has('anthropic'));
    setOpenrouterSet(await window.quill.keys.has('openrouter'));
    setDeepgramSet(await window.quill.keys.has('deepgram'));
  };

  useEffect(() => {
    refresh();
  }, []);

  const saveKey = async (
    name: 'openai' | 'anthropic' | 'openrouter' | 'deepgram',
    value: string,
    setSaving: (v: boolean) => void,
    clearInput: () => void,
  ) => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await window.quill.keys.set(name, value.trim());
      clearInput();
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const removeKey = async (name: 'openai' | 'anthropic' | 'openrouter' | 'deepgram') => {
    await window.quill.keys.delete(name);
    await refresh();
  };

  return (
    <div className="relative h-full overflow-y-auto pt-12">
      <div className="mx-auto max-w-2xl px-5 sm:px-10 py-8">
        <Masthead left="Quill — Settings" right={formatIssueDate()} />
        <h1
          className="font-serif text-[clamp(2rem,1.4rem+1.6vw,2.75rem)] tracking-tight leading-tight"
          style={{ letterSpacing: '-0.022em' }}
        >
          Bring your own keys.
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed max-w-prose">
          Keys are encrypted via macOS Keychain (Electron <code className="font-mono text-[12.5px]">safeStorage</code>) and never leave this machine.
        </p>

        <section className="mt-10">
          <div className="flex items-baseline justify-between mb-3">
            <span className="eyebrow">Providers</span>
          </div>
          <div className="rule mb-2" />
        </section>

        <section className="space-y-6">
          <KeyCard
            title="OpenRouter"
            description="Preferred for chat + note enhancement — runs Claude Haiku cheap. Set this and Quill will use it before Anthropic or OpenAI."
            placeholder="sk-or-..."
            isSet={openrouterSet}
            value={openrouterInput}
            setValue={setOpenrouterInput}
            saving={savingOpenrouter}
            onSave={() =>
              saveKey(
                'openrouter',
                openrouterInput,
                setSavingOpenrouter,
                () => setOpenrouterInput(''),
              )
            }
            onRemove={() => removeKey('openrouter')}
          />
          <KeyCard
            title="Deepgram"
            description="Streaming transcription via Nova-3. With this key set, the transcript flows in real-time instead of arriving in 5-second chunks. Falls back to OpenAI Whisper if not set."
            placeholder="dg-..."
            isSet={deepgramSet}
            value={deepgramInput}
            setValue={setDeepgramInput}
            saving={savingDeepgram}
            onSave={() =>
              saveKey('deepgram', deepgramInput, setSavingDeepgram, () =>
                setDeepgramInput(''),
              )
            }
            onRemove={() => removeKey('deepgram')}
          />
          <KeyCard
            title="OpenAI"
            description="Used for Whisper transcription (fallback when no Deepgram key). Also a fallback for enhancement when no OpenRouter key is set."
            placeholder="sk-..."
            isSet={openaiSet}
            value={openaiInput}
            setValue={setOpenaiInput}
            saving={savingOpenai}
            onSave={() =>
              saveKey('openai', openaiInput, setSavingOpenai, () => setOpenaiInput(''))
            }
            onRemove={() => removeKey('openai')}
          />
          <KeyCard
            title="Anthropic"
            description="Direct Claude Sonnet with prompt caching on the template. Fallback for enhancement when no OpenRouter key is set."
            placeholder="sk-ant-..."
            isSet={anthropicSet}
            value={anthropicInput}
            setValue={setAnthropicInput}
            saving={savingAnthropic}
            onSave={() =>
              saveKey(
                'anthropic',
                anthropicInput,
                setSavingAnthropic,
                () => setAnthropicInput(''),
              )
            }
            onRemove={() => removeKey('anthropic')}
          />
        </section>

        <section className="mt-14">
          <div className="flex items-baseline justify-between mb-3">
            <span className="eyebrow">Transcription</span>
          </div>
          <div className="rule mb-4" />
          <TranscriptionCard />
        </section>

        <section className="mt-14">
          <div className="flex items-baseline justify-between mb-3">
            <span className="eyebrow">Calendar</span>
          </div>
          <div className="rule mb-4" />
          <p className="text-sm text-ink-muted leading-relaxed max-w-prose mb-5">
            Paste an ICS feed URL — Google Calendar's <em>"Secret address in
            iCal format"</em>, Outlook's <em>"Publish calendar"</em> link, an
            iCloud calendar share URL, or a local <code className="font-mono text-[12.5px]">.ics</code> file path.
            Quill matches the calendar event happening when you start a meeting
            and uses its title and attendees.
          </p>
          <CalendarCard />
        </section>

        <section className="mt-14">
          <div className="flex items-baseline justify-between mb-3">
            <span className="eyebrow">Colophon</span>
          </div>
          <div className="rule mb-4" />
          <p className="text-sm text-ink-muted leading-relaxed max-w-prose">
            Quill captures your microphone via <code className="font-mono text-[12.5px]">getUserMedia</code> and your computer's
            audio output via the AudioTee Core Audio Tap binary. macOS will ask
            for Microphone and Screen Recording permissions the first time you record.
            Audio is sent to OpenAI Whisper in 10-second chunks and discarded after each
            chunk — only the resulting transcript is stored.
          </p>
        </section>
      </div>
    </div>
  );
}

function CalendarCard() {
  const [status, setStatus] = useState<CalendarStatusBridge | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'save' | 'refresh' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.quill.calendar
      .status()
      .then((s) => {
        if (alive) {
          setStatus(s);
          setDraft(s.url ?? '');
        }
      })
      .catch((err: unknown) => {
        console.warn('[settings] calendar.status failed:', err);
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setBusy('save');
    setFeedback(null);
    try {
      const next = await window.quill.calendar.setUrl(draft);
      setStatus(next);
      if (next.url) {
        // setUrl triggers a background refresh; surface the result here.
        const refreshed = await window.quill.calendar.refresh();
        setStatus(refreshed);
        setFeedback(`Imported ${refreshed.eventCount} events.`);
      } else {
        setFeedback('Calendar disconnected.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback(msg);
    } finally {
      setBusy(null);
    }
  };

  const refresh = async () => {
    setBusy('refresh');
    setFeedback(null);
    try {
      const next = await window.quill.calendar.refresh();
      setStatus(next);
      setFeedback(`Imported ${next.eventCount} events.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="card py-5 pr-1 pl-0"
      style={{ background: 'transparent', border: 'none', borderRadius: 0 }}
    >
      <div className="rule mb-4" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <Calendar size={14} className="text-moss" />
            <span
              className="font-serif text-xl tracking-tight"
              style={{ letterSpacing: '-0.018em', fontWeight: 500 }}
            >
              ICS feed
            </span>
            {status?.url && status.eventCount > 0 && (
              <span
                className="dateline ml-1"
                style={{ color: 'oklch(var(--moss))' }}
              >
                <Check size={10} strokeWidth={3} className="inline mb-0.5" />{' '}
                connected · {status.eventCount} events
              </span>
            )}
            {status?.url && status.eventCount === 0 && (
              <span className="microcopy text-[12px] ml-1">
                connected · no upcoming meetings on the wire
              </span>
            )}
          </div>
          <div className="mt-1.5 text-sm text-ink-muted leading-relaxed max-w-prose">
            {status?.url ? (
              <>
                Refreshes automatically every 30 minutes.
                {status.lastRefreshAt && (
                  <span className="ml-1 italic font-serif text-ink-soft">
                    last sync {new Date(status.lastRefreshAt).toLocaleString()}
                  </span>
                )}
              </>
            ) : (
              <>
                Stays on this machine. We never call Google's or Microsoft's
                APIs — just an HTTPS GET against the URL you paste.
              </>
            )}
          </div>
        </div>
        {status?.url && (
          <button
            onClick={refresh}
            disabled={busy === 'refresh'}
            className="btn btn-ghost text-xs shrink-0"
            aria-label="Refresh calendar"
            data-testid="calendar-refresh"
          >
            <RefreshCw size={12} className={busy === 'refresh' ? 'animate-spin' : ''} />{' '}
            Refresh
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="input flex-1"
          data-testid="calendar-url-input"
        />
        <button
          onClick={save}
          disabled={busy === 'save'}
          className="btn btn-primary disabled:opacity-50"
          data-testid="calendar-url-save"
        >
          {busy === 'save' ? (
            <span className="font-serif italic">saving…</span>
          ) : status?.url ? (
            'Replace'
          ) : (
            'Connect'
          )}
        </button>
      </div>
      {feedback && (
        <p
          className="mt-2 text-xs text-ink-soft microcopy"
          data-testid="calendar-feedback"
        >
          {feedback}
        </p>
      )}
      {status?.lastError && (
        <p className="mt-1 text-xs font-mono" style={{ color: 'oklch(var(--accent))' }}>
          last error: {status.lastError}
        </p>
      )}
    </div>
  );
}

function TranscriptionCard() {
  const [language, setLanguage] = useState<string>('auto');
  const [diarize, setDiarize] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      window.quill.settings.get('transcript.language'),
      window.quill.settings.get('transcript.diarize'),
    ])
      .then(([lang, diar]) => {
        if (!alive) return;
        setLanguage(lang ?? 'auto');
        setDiarize(diar === '1');
      })
      .catch((err: unknown) => {
        console.warn('[settings] transcript settings load failed:', err);
      });
    return () => {
      alive = false;
    };
  }, []);

  const flashSaved = (label: string) => {
    setSavedNote(label);
    window.setTimeout(() => setSavedNote((cur) => (cur === label ? null : cur)), 1600);
  };

  const onLanguageChange = async (next: string) => {
    setLanguage(next);
    await window.quill.settings.set('transcript.language', next);
    flashSaved('language');
  };

  const onDiarizeChange = async (next: boolean) => {
    setDiarize(next);
    await window.quill.settings.set('transcript.diarize', next ? '1' : '0');
    flashSaved('diarize');
  };

  return (
    <div
      className="card py-5 pr-1 pl-0"
      style={{ background: 'transparent', border: 'none', borderRadius: 0 }}
    >
      <div className="rule mb-4" />
      <div className="flex items-start gap-3">
        <Languages size={14} className="text-moss mt-1" />
        <div className="flex-1">
          <span
            className="font-serif text-xl tracking-tight"
            style={{ letterSpacing: '-0.018em', fontWeight: 500 }}
          >
            Language
          </span>
          {savedNote === 'language' && (
            <span
              className="dateline ml-2"
              style={{ color: 'oklch(var(--moss))' }}
              data-testid="transcript-language-saved"
            >
              <Check size={10} strokeWidth={3} className="inline mb-0.5" /> saved
            </span>
          )}
          <div className="mt-1.5 text-sm text-ink-muted leading-relaxed max-w-prose">
            On Deepgram streaming, <em>Auto-detect</em> falls back to English
            — pin your language explicitly (German, French, etc.) for
            non-English meetings. On Whisper batch mode (no Deepgram key),
            Auto-detect works natively.
          </div>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="input mt-3"
            style={{ maxWidth: '20rem' }}
            data-testid="transcript-language-select"
          >
            {TRANSCRIPT_LANGUAGES.map((opt) => (
              <option key={languageToStored(opt.code)} value={languageToStored(opt.code)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rule mt-6 mb-4" />
      <div className="flex items-start gap-3">
        <Users size={14} className="text-moss mt-1" />
        <div className="flex-1">
          <span
            className="font-serif text-xl tracking-tight"
            style={{ letterSpacing: '-0.018em', fontWeight: 500 }}
          >
            Speaker labels
          </span>
          {savedNote === 'diarize' && (
            <span
              className="dateline ml-2"
              style={{ color: 'oklch(var(--moss))' }}
              data-testid="transcript-diarize-saved"
            >
              <Check size={10} strokeWidth={3} className="inline mb-0.5" /> saved
            </span>
          )}
          <div className="mt-1.5 text-sm text-ink-muted leading-relaxed max-w-prose">
            For multi-person calls, ask Deepgram to label each voice on the
            other side as <em>Speaker 1</em>, <em>Speaker 2</em>, etc. Your
            microphone always shows up as <em>You</em>. Off by default — the
            simple "You / Other" tag is cleaner for 1-on-1s.
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={diarize}
              onChange={(e) => onDiarizeChange(e.target.checked)}
              data-testid="transcript-diarize-toggle"
            />
            <span className="text-ink-muted">
              Identify speakers on the other side
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

function KeyCard(props: {
  title: string;
  description: string;
  placeholder: string;
  isSet: boolean;
  value: string;
  setValue: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onRemove: () => void;
}) {
  // .card class kept (e2e tests at record-flow.spec.ts:88 select on it),
  // but the visual treatment is editorial: hairline rule on top, no rounded
  // box, generous whitespace. Border + radius from .card are overridden
  // inline so the box disappears while the class remains in the DOM.
  return (
    <div
      className="card py-5 pr-1 pl-0"
      style={{ background: 'transparent', border: 'none', borderRadius: 0 }}
    >
      <div className="rule mb-4" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2.5">
            <KeyRound size={14} className="text-moss" />
            <span className="font-serif text-xl tracking-tight" style={{ letterSpacing: '-0.018em', fontWeight: 500 }}>
              {props.title}
            </span>
            {props.isSet && (
              <span className="dateline ml-1" style={{ color: 'oklch(var(--moss))' }}>
                <Check size={10} strokeWidth={3} className="inline mb-0.5" /> stored
              </span>
            )}
          </div>
          <div className="mt-1.5 text-sm text-ink-muted leading-relaxed max-w-prose">
            {props.description}
          </div>
        </div>
        {props.isSet && (
          <button
            onClick={props.onRemove}
            className="btn btn-ghost text-xs shrink-0"
            aria-label="Remove key"
          >
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.setValue(e.target.value)}
          className="input flex-1"
          data-testid={`key-input-${props.title.toLowerCase()}`}
        />
        <button
          onClick={props.onSave}
          disabled={!props.value || props.saving}
          className="btn btn-primary disabled:opacity-50"
        >
          {props.saving ? (
            <span className="font-serif italic">saving…</span>
          ) : props.isSet ? (
            'Replace'
          ) : (
            'Save'
          )}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { dequeue, enqueue, getQueue, type QueuedCapture } from "../offline";
import { toast } from "../toast";
import type { CaptureDraft } from "../types";
import { ConfirmCard } from "./ConfirmCard";

type Phase = "idle" | "recording" | "transcribing" | "parsing" | "saving";

export function Capture() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [parseFailedText, setParseFailedText] = useState<string | null>(null);
  const [parseFailedDetail, setParseFailedDetail] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueuedCapture[]>(getQueue);
  const [online, setOnline] = useState(navigator.onLine);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  async function toggleRecording() {
    if (phase === "recording") {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("transcribing");
        try {
          const blob = new Blob(chunksRef.current, { type: mime });
          const transcript = await api.transcribe(blob);
          if (!transcript) {
            toast("Nothing heard — try again closer to the mic");
          } else {
            setText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        } catch {
          toast("Transcription failed — type it or try again");
        } finally {
          setPhase("idle");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setPhase("recording");
    } catch {
      toast("Microphone unavailable");
    }
  }

  async function parse(input?: string, queuedId?: string) {
    const raw = (input ?? text).trim();
    if (!raw) return;
    setParseFailedText(null);
    setPhase("parsing");
    try {
      const { draft } = await api.capture(raw);
      setDraft(draft);
      if (queuedId) {
        dequeue(queuedId);
        setQueue(getQueue());
      }
    } catch (e) {
      if (e instanceof ApiError) {
        // The server responded but couldn't parse (LLM down, bad output…)
        // — never lose input: offer to save the raw text as a musing.
        setParseFailedText(raw);
        const payload = e.payload as { detail?: string } | null;
        setParseFailedDetail(payload?.detail ?? `HTTP ${e.status}`);
      } else {
        // Network failure (likely offline): queue the raw text.
        if (!queuedId) {
          enqueue(raw);
          setQueue(getQueue());
          setText("");
          toast("Offline — capture queued, will parse when back online");
        } else {
          toast("Still offline — kept in queue");
        }
      }
    } finally {
      setPhase("idle");
    }
  }

  async function saveAsRawMusing(raw: string) {
    setPhase("saving");
    try {
      await api.createNote({ body: raw, note_type: "musing", raw_transcript: raw });
      setParseFailedText(null);
      setText("");
      toast("Saved as raw musing");
    } catch {
      enqueue(raw);
      setQueue(getQueue());
      setParseFailedText(null);
      setText("");
      toast("Offline — capture queued");
    } finally {
      setPhase("idle");
    }
  }

  if (draft) {
    return (
      <ConfirmCard
        draft={draft}
        onSaved={() => {
          setDraft(null);
          setText("");
          toast("Saved ✓");
        }}
        onDiscard={() => setDraft(null)}
      />
    );
  }

  return (
    <div className="capture-box">
      <h1>Capture</h1>
      {!online && (
        <div className="offline-banner">
          Offline — captures are queued and parsed when you're back online.
        </div>
      )}
      <div className="stack">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Idea, note, musing… voice or text. e.g. “Heard about Hammond Power on MicroCapClub, transformer backlog, check capacity adds”"
          autoFocus
        />
        <div className="row">
          <button
            type="button"
            className={`mic-btn ${phase === "recording" ? "recording" : ""}`}
            onClick={toggleRecording}
            disabled={phase === "transcribing" || phase === "parsing"}
            aria-label={phase === "recording" ? "Stop recording" : "Record"}
          >
            {phase === "recording" ? "■" : "🎙"}
          </button>
          <button
            type="button"
            className="primary grow"
            onClick={() => parse()}
            disabled={!text.trim() || phase !== "idle"}
          >
            {phase === "parsing"
              ? "Parsing…"
              : phase === "transcribing"
                ? "Transcribing…"
                : "Parse"}
          </button>
        </div>
      </div>

      {parseFailedText && (
        <div className="card">
          <p className="small">
            Couldn't parse that right now. Your text is safe — save it as a raw
            musing and sort it later, or retry.
          </p>
          {parseFailedDetail && (
            <p className="muted small">Technical detail: {parseFailedDetail}</p>
          )}
          <div className="row">
            <button
              type="button"
              className="primary"
              onClick={() => saveAsRawMusing(parseFailedText)}
            >
              Save as raw musing
            </button>
            <button type="button" onClick={() => parse(parseFailedText)}>
              Retry parse
            </button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <>
          <h2>Queued offline</h2>
          {queue.map((q) => (
            <div className="card" key={q.id}>
              <div className="pre small">{q.text}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted grow">{q.queued_at.slice(0, 16).replace("T", " ")}</span>
                <button
                  type="button"
                  className="small primary"
                  disabled={!online || phase !== "idle"}
                  onClick={() => parse(q.text, q.id)}
                >
                  Parse now
                </button>
                <button
                  type="button"
                  className="small danger"
                  onClick={() => {
                    dequeue(q.id);
                    setQueue(getQueue());
                  }}
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

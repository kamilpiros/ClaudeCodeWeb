/**
 * Offline capture queue: when /api/capture is unreachable, raw text is
 * queued in localStorage and surfaced on the capture screen when back
 * online (the parse happens then). Capture must never lose input.
 */
const KEY = "stones.offline_queue";

export interface QueuedCapture {
  id: string;
  text: string;
  queued_at: string;
}

export function getQueue(): QueuedCapture[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function enqueue(text: string): QueuedCapture {
  const item: QueuedCapture = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    queued_at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify([...getQueue(), item]));
  return item;
}

export function dequeue(id: string): void {
  localStorage.setItem(
    KEY,
    JSON.stringify(getQueue().filter((q) => q.id !== id)),
  );
}

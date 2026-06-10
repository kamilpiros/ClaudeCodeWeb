import type { Env } from "../_lib/types";
import { json } from "../_lib/util";

/**
 * POST /api/transcribe — audio blob in, { transcript } out via Workers AI
 * Whisper. The frontend posts the raw MediaRecorder blob body.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const buf = await request.arrayBuffer();
  if (!buf.byteLength) return json({ error: "empty audio body" }, 400);
  if (buf.byteLength > 24 * 1024 * 1024) {
    return json({ error: "audio too large (max 24MB)" }, 413);
  }
  try {
    const result = (await env.AI.run("@cf/openai/whisper", {
      audio: [...new Uint8Array(buf)],
    })) as { text?: string };
    return json({ transcript: (result.text ?? "").trim() });
  } catch (e) {
    return json(
      { error: "transcription_failed", message: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
};

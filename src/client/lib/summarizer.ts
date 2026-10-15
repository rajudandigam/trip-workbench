type SummarizerAvailability = "unavailable" | "downloadable" | "downloading" | "available";

type SummarizerInstance = {
  summarize: (text: string, opts?: { signal?: AbortSignal }) => Promise<string>;
  destroy?: () => void;
};

type SummarizerCtor = {
  availability: (options?: Record<string, unknown>) => Promise<SummarizerAvailability>;
  create: (options?: Record<string, unknown>) => Promise<SummarizerInstance>;
};

declare global {
  // Chrome Built-in AI Summarizer API
  var Summarizer: SummarizerCtor | undefined;
}

export type SummaryResult =
  | { ok: true; text: string; mode: "on-device" }
  | { ok: false; code: string; message: string; availability?: string };

export async function summarizeBriefOnDevice(
  brief: string,
  signal?: AbortSignal,
): Promise<SummaryResult> {
  if (typeof Summarizer === "undefined") {
    return {
      ok: false,
      code: "SUMMARIZER_UNAVAILABLE",
      message: "On-device Summarizer API is not available in this browser.",
    };
  }
  const options = { type: "tldr", format: "plain-text", length: "short" };
  const availability = await Summarizer.availability(options);
  if (availability === "unavailable") {
    return {
      ok: false,
      code: "SUMMARIZER_UNAVAILABLE",
      message: "Summarizer model is unavailable on this device.",
      availability,
    };
  }
  let session: SummarizerInstance | null = null;
  try {
    session = await Summarizer.create(options);
    if (signal?.aborted) {
      session.destroy?.();
      return { ok: false, code: "CANCELLED", message: "Summary cancelled before start." };
    }
    const text = await session.summarize(brief, { signal });
    return { ok: true, text, mode: "on-device" };
  } catch (error) {
    return {
      ok: false,
      code: signal?.aborted ? "CANCELLED" : "SUMMARIZER_FAILED",
      message: (error as Error).message || "Summarizer failed",
      availability,
    };
  } finally {
    session?.destroy?.();
  }
}

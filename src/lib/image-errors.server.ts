import { setTimeout } from "node:timers/promises";

function details(error: unknown) {
  if (!error || typeof error !== "object") return {};
  const value = error as {
    statusCode?: number;
    data?: { error?: { code?: string } };
    responseBody?: string;
  };
  let code = value.data?.error?.code;
  if (!code && value.responseBody) {
    try {
      code = JSON.parse(value.responseBody)?.error?.code;
    } catch {
      // A proxy may return a non-JSON error page.
    }
  }
  return { status: value.statusCode, code };
}

export function generationError(error: unknown) {
  const { code, status } = details(error);
  if (code === "credit_balance_exhausted" || code === "insufficient_quota")
    return "Your OpenAI organization has no API credits available. Check its billing balance and use a key from the organization with credits, then try again.";
  if (status === 401)
    return "OpenAI rejected the server’s API key. Update OPENAI_API_KEY, then try again.";
  if (status === 403)
    return "Your OpenAI organization cannot access this image model. Check model access and organization verification in the developer console, then try again.";
  if (status === 429)
    return "OpenAI is limiting image requests. Wait a moment, then try again. Your brief and photos are saved.";
  if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))
    return "The image request timed out. Your brief and photos are saved. Try a lower quality or smaller image, or try again later.";
  return error instanceof Error
    ? error.message
    : "Could not generate your design. Please try again.";
}

export async function retryImageRequest<T>(work: () => Promise<T>, signal: AbortSignal) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const { code, status } = details(error);
      if (
        status !== 429 ||
        code === "credit_balance_exhausted" ||
        code === "insufficient_quota" ||
        attempt >= 2 ||
        signal.aborted
      )
        throw error;
      await setTimeout(1000 * 2 ** attempt + Math.random() * 250, undefined, { signal });
    }
  }
}

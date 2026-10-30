export async function handle(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("Studio request failed", e instanceof Error ? e.name : "UnknownError");
    return Response.json(
      {
        error:
          e instanceof Error && !("statusCode" in e)
            ? e.message
            : "The image service could not complete this request. Check your API key, quota, and model access, then try again.",
      },
      { status: 400 },
    );
  }
}

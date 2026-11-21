// Retired: Realtime owns speech and tool calling; no Chat Completions callback.
export async function POST() {
  return Response.json(
    {
      error: "VOICE_PIPELINE_RETIRED",
      message: "A voz da Lia agora usa OpenAI Realtime pela Agora.",
    },
    { status: 410 },
  );
}

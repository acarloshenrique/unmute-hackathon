// Retired: Realtime owns speech and tool calling; no Chat Completions callback.
export async function POST() {
  return Response.json(
    {
      error: "VOICE_PIPELINE_RETIRED",
      message:
        "A voz usa o pipeline gerenciado pela Agora. Este callback foi desativado.",
    },
    { status: 410 },
  );
}

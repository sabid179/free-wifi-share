
export async function onRequest(context) {
  const { env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return Response.json(
      { error: "Supabase configuration is missing" },
      { status: 500 }
    );
  }

  return Response.json(
    {
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

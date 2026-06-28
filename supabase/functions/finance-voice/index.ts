import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildExtractionPrompt(transcript: string, today: string): string {
  return `You are an assistant for Cazú Ceramics, a pottery studio in Valencia, Spain.
Extract payment info from the transcription below and return ONLY valid JSON, no markdown, no explanation.

Today is ${today}. Current month in Spanish: ${new Date(today).toLocaleString("es-ES", { month: "long" }).toUpperCase()}.

JSON fields:
- student_name: student name string (null if not mentioned)
- amount_cents: integer cents (null if not mentioned)
- method: single char — E=efectivo/cash, T=tarjeta/card, B=Bizum, R=Revolut (null if unclear)
- status: "Pagado" if they paid now/already; "Pendiente" if will pay later
- month: month in uppercase Spanish, e.g. JUNIO (use current month if "este mes")
- entry_date: ISO date YYYY-MM-DD ("hoy" → ${today})
- item: short description or null
- category: category or null
- collector: array of teacher names who ran the class ([] if only Cande or unclear)
- notes: any extra info or null

Transcription: "${transcript}"`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Authentication required" }, 401);

    // Verify admin role using caller's JWT
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const adminDb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) return jsonResponse({ error: "Authentication required" }, 401);

    const { data: profile } = await adminDb
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!profile || profile.role !== "admin") return jsonResponse({ error: "Admin access required" }, 403);

    // Parse JSON body — transcript comes from Browser Web Speech API (client-side STT)
    const body = await req.json() as { transcript?: string; today?: string };
    const transcript = body.transcript?.trim() ?? "";
    const today = body.today ?? new Date().toISOString().slice(0, 10);

    if (!transcript) return jsonResponse({ error: "empty_transcript" }, 422);

    // Extract structured fields with Claude
    // TODO: replace with Lovable AI Gateway once endpoint is available (0 keys)
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        messages: [{ role: "user", content: buildExtractionPrompt(transcript, today) }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      console.error("Claude error:", err);
      return jsonResponse({ error: "extraction_failed", message: err }, 502);
    }

    const claudeJson = await claudeRes.json() as { content: Array<{ text: string }> };
    const rawText = claudeJson.content[0]?.text ?? "";

    let fields: unknown;
    try {
      // Strip potential markdown code fences before parsing
      const cleaned = rawText.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
      fields = JSON.parse(cleaned);
    } catch {
      return jsonResponse({ error: "parse_failed", transcript }, 422);
    }

    return jsonResponse({ fields, transcript });
  } catch (e) {
    console.error("finance-voice error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

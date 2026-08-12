import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NoteInput {
  appId?: string;
  dealerName?: string;
  customerName?: string;
  noteText: string;
  createdByName?: string;
  createdAt?: string;
  source?: string;
}

interface InsightsResult {
  lossSummary: string;
  whoLosingTo: {
    competitor: string;
    mentionCount: number;
    howTheyBeatUs: string;
  }[];
  overallSummary: string;
  noteCountAnalyzed: number;
  dateRangeLabel: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in AI response");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

const SYSTEM_PROMPT = `You analyze "No Deal" notes for Pronto Finance, a subprime auto finance company.

Reps leave notes when deals are lost. Your job is to extract competitive intelligence from those notes.

Answer these questions based ONLY on the notes provided:
1. Why are we losing deals AND how are competitors beating us? Cover both in one combined summary (themes: co-signer requirements, pricing, approval strength, more money / higher advance, better net check, lower fees, lower rate, better terms, faster funding, process friction, abandonment, etc.).
2. Who are we losing deals to? List EVERY bank / finance company / lender named in the notes. Do not skip uncommon names. Do not merge different companies into one entry unless they are clearly the same lender (e.g. "Cap One" and "Capital One").

If a note does not name a competitor or reason, do not invent one. Say when evidence is thin.

Respond with ONLY valid JSON — no markdown, no code fences.

Schema:
{
  "lossSummary": "<2-4 paragraphs combining WHY we lose and HOW competitors beat us into one cohesive summary. Do not split into separate why/how sections. Be specific and cite patterns from the notes.>",
  "whoLosingTo": [
    {
      "competitor": "<bank or finance company name — use the clearest common spelling>",
      "mentionCount": <integer count of notes that mention this lender>,
      "howTheyBeatUs": "<1-3 sentences on why dealers/customers chose them per the notes. If the notes only name them without a reason, say that explicitly.>"
    }
  ],
  "overallSummary": "<1-2 short paragraphs: executive takeaway for managers on where Pronto is losing and what to watch.>"
}

Rules:
- whoLosingTo must be EXHAUSTIVE for lenders named in the notes. If 12 lenders appear, return 12 entries. Never truncate the list to a "top few".
- Sort whoLosingTo by mentionCount descending (highest first).
- Only include competitors that are actually named or clearly implied in the notes (e.g. "went with Westlake", "CAC took it", "Strike beat us").
- If no competitors are named, return an empty whoLosingTo array and say so in lossSummary / overallSummary.
- Prefer concrete details from notes over generic advice.
- CRITICAL: Return ONLY raw JSON starting with { and ending with }.`;

function buildUserPrompt(notes: NoteInput[], dateRangeLabel: string): string {
  const lines = notes.map((n, i) => {
    const meta = [
      n.createdByName || "Unknown rep",
      n.dealerName || "Unknown dealer",
      n.appId ? `App ${n.appId}` : null,
      n.source || null,
      n.createdAt || null,
    ].filter(Boolean).join(" · ");
    return `${i + 1}. [${meta}]\n${n.noteText.trim()}`;
  });

  return `Analyze these No Deal notes for the period: ${dateRangeLabel}

Total notes: ${notes.length}

${lines.join("\n\n")}`;
}

function validateInsights(parsed: unknown): parsed is Omit<InsightsResult, "noteCountAnalyzed" | "dateRangeLabel"> {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (typeof p.lossSummary !== "string") return false;
  if (typeof p.overallSummary !== "string") return false;
  if (!Array.isArray(p.whoLosingTo)) return false;
  return p.whoLosingTo.every((row) => {
    if (!row || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    return typeof r.competitor === "string"
      && typeof r.howTheyBeatUs === "string"
      && (typeof r.mentionCount === "number" || typeof r.mentionCount === "string");
  });
}

async function callAnthropic(userPrompt: string): Promise<Omit<InsightsResult, "noteCountAnalyzed" | "dateRangeLabel">> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Anthropic API error:", response.status, errorBody);
    throw new Error(`Anthropic API request failed (${response.status})`);
  }

  const result = await response.json();
  const textBlock = result.content?.find((block: { type: string }) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text content in Anthropic response");
  }

  let parsed: unknown;
  try {
    parsed = extractJson(textBlock.text);
  } catch {
    console.error("Failed to parse Anthropic JSON:", textBlock.text);
    throw new Error("Failed to parse AI response as JSON");
  }

  if (!validateInsights(parsed)) {
    console.error("Invalid insights structure:", JSON.stringify(parsed));
    throw new Error("AI response did not match expected insights schema");
  }

  // Normalize mentionCount to number
  const whoLosingTo = parsed.whoLosingTo.map((row) => ({
    competitor: String(row.competitor),
    mentionCount: Number(row.mentionCount) || 0,
    howTheyBeatUs: String(row.howTheyBeatUs),
  }));

  return {
    lossSummary: parsed.lossSummary,
    whoLosingTo,
    overallSummary: parsed.overallSummary,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "manager")) {
      return jsonResponse({ error: "Only managers and admins can generate AI insights" }, 403);
    }

    const body = await req.json();
    const notes: NoteInput[] = Array.isArray(body?.notes) ? body.notes : [];
    const dateRangeLabel = typeof body?.dateRangeLabel === "string"
      ? body.dateRangeLabel
      : "Selected range";

    const usable = notes.filter((n) =>
      n && typeof n.noteText === "string" && n.noteText.trim().length > 0
    );

    if (usable.length === 0) {
      return jsonResponse({ error: "No No Deal notes found in this date range to analyze." }, 400);
    }

    // Cap payload to keep token cost predictable (prefer longer notes first)
    const ranked = [...usable].sort((a, b) => (b.noteText?.length || 0) - (a.noteText?.length || 0));
    const capped = ranked.slice(0, 300);
    const ai = await callAnthropic(buildUserPrompt(capped, dateRangeLabel));

    const result: InsightsResult = {
      ...ai,
      noteCountAnalyzed: capped.length,
      dateRangeLabel,
    };

    return jsonResponse(result);
  } catch (error) {
    console.error("notes-insights error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});

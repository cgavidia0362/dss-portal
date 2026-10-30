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

interface LossReasonBreakdownRow {
  category: string;
  count: number;
  appIds: string[];
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

const SYSTEM_PROMPT = `You read No Deal notes for Pronto Finance, a subprime auto lender.

Write like you are talking to a desk manager. Keep it simple. Use car-lending words: APR, fee, stips, cobuyer, counter, full call, cut back, sent it elsewhere, no call.

Do NOT use academic or AI phrasing. Never say friction, abandonment, operational leakage, marginal-file, economics, or deal structure.

The counted KPIs are only APR, Fees, Stips, and No reason. Stips includes too many stips or docs, asking for a cobuyer or cosigner, and when we did not approve the full amount (we countered or cut them back). Do not treat cobuyer or counter as their own buckets.

Answer ONLY from the notes:
1. Why we lost, in plain talk. Cover APR, fees, stips, and no reason when those show up. When a note is a cobuyer ask or a counter / cutback, call it stips. Say which banks beat us and how (better APR, lower fee, they called the full amount, we cut them back, we asked for a cobuyer).
2. Who we lost to. List EVERY named bank / lender (Westlake, Strike, CAC, Capital One, Exeter, Santander, etc.). Sort by most notes first. For each bank, say how many notes and why we lost (APR, fee, or stips). If a note says they sent it elsewhere, another bank, or closed out and does NOT name a bank, put those on one row named exactly "Other bank".

CRITICAL — dealers are not lenders:
- The rooftop on each note (Dealer: ...) is a car dealer, never a competitor lender.
- Names like "Smart Buy Auto Finance", "Driveway Deals", "Driveaway Auto Finance" are dealers even if they contain "finance" or "auto".
- "Customer went to [name]" / "deals sent to [name]" usually means another DEALER. Do not list that name unless the note clearly says a bank funded it (e.g. "went with Westlake", "CAC took it").
- Never list a name from the Known dealers list in whoLosingTo.

Do not invent banks or reasons. If the notes are thin, say that.

Respond with ONLY valid JSON — no markdown, no code fences.

Schema:
{
  "lossSummary": "<2-3 short paragraphs. Plain desk talk. Why we lost and how other banks beat us. No fluff.>",
  "whoLosingTo": [
    {
      "competitor": "<bank name, or Other bank>",
      "mentionCount": <integer>,
      "howTheyBeatUs": "<1-2 short sentences: why we lost to them. Use APR, fee, or stips. A cobuyer ask or a counter / cutback is stips. If no why, say they did not give a reason.>"
    }
  ],
  "overallSummary": "<3-6 short sentences for managers. What to watch. Same simple language.>"
}

Rules:
- whoLosingTo must list every named lender. Do not cut the list to a top few.
- Sort whoLosingTo by mentionCount descending (highest first).
- Include "Other bank" when notes say sent elsewhere / another bank / closed out with no bank named.
- If no lenders and no Other bank notes, return an empty whoLosingTo array.
- CRITICAL: Return ONLY raw JSON starting with { and ending with }.`;

function uniqueDealerNames(notes: NoteInput[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const note of notes) {
    const trimmed = (note.dealerName || "").trim();
    const key = trimmed.toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(trimmed);
  }
  return names;
}

function normalizeDealerLabel(value?: string | null): string {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isKnownDealerName(competitor: string, dealerNames: string[]): boolean {
  const needle = normalizeDealerLabel(competitor);
  if (needle.length < 4) return false;
  return dealerNames.some((name) => {
    const hay = normalizeDealerLabel(name);
    if (hay.length < 4) return false;
    return needle === hay || needle.includes(hay) || hay.includes(needle);
  });
}

function excludeKnownDealers(
  rows: { competitor: string; mentionCount: number; howTheyBeatUs: string }[],
  dealerNames: string[],
) {
  if (dealerNames.length === 0) return rows;
  return rows.filter((row) => !isKnownDealerName(row.competitor, dealerNames));
}

function parseLossReasonBreakdown(raw: unknown): LossReasonBreakdownRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const r = row as Record<string, unknown>;
    const category = typeof r.category === "string" ? r.category.trim() : "";
    if (!category) return [];
    const count = Number(r.count) || 0;
    const appIds = Array.isArray(r.appIds)
      ? r.appIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    return [{ category, count, appIds }];
  });
}

function formatLossReasonBreakdown(rows: LossReasonBreakdownRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map((row) => `- ${row.category}: ${row.count} note(s)`);
  return `Pre-counted why-we-lost KPIs (use these counts):
${lines.join("\n")}

`;
}

function buildUserPrompt(
  notes: NoteInput[],
  dateRangeLabel: string,
  dealerNames: string[],
  lossReasonBreakdown: LossReasonBreakdownRow[] = [],
): string {
  const lines = notes.map((n, i) => {
    const meta = [
      n.createdByName || "Unknown rep",
      n.dealerName ? `Dealer: ${n.dealerName}` : "Unknown dealer",
      n.appId ? `App ${n.appId}` : null,
      n.source || null,
      n.createdAt || null,
    ].filter(Boolean).join(" · ");
    return `${i + 1}. [${meta}]\n${n.noteText.trim()}`;
  });

  const dealerList = dealerNames.length > 0
    ? dealerNames.map((name) => `- ${name}`).join("\n")
    : "- (none provided)";

  return `Analyze these No Deal notes for the period: ${dateRangeLabel}

Total notes: ${notes.length}

${formatLossReasonBreakdown(lossReasonBreakdown)}Known dealers (NEVER list these in whoLosingTo — they are rooftops, not lenders):
${dealerList}

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

async function callOpenAI(userPrompt: string): Promise<Omit<InsightsResult, "noteCountAnalyzed" | "dateRangeLabel">> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = Deno.env.get("OPENAI_CLASSIFICATION_MODEL")
    || Deno.env.get("OPENAI_MODEL")
    || "gpt-5.4-mini";
  const isGpt5 = /gpt-5/i.test(model);
  const body: Record<string, unknown> = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  };
  if (isGpt5) {
    body.max_completion_tokens = 4096;
  } else {
    body.max_tokens = 4096;
    body.temperature = 0.2;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenAI API error:", response.status, errorBody);
    throw new Error(`OpenAI API request failed (${response.status})`);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("No text content in OpenAI response");
  }

  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    console.error("Failed to parse OpenAI JSON:", text);
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
    const lossReasonBreakdown = parseLossReasonBreakdown(body?.lossReasonBreakdown);

    const usable = notes.filter((n) =>
      n && typeof n.noteText === "string" && n.noteText.trim().length > 0
    );

    if (usable.length === 0) {
      return jsonResponse({ error: "No No Deal notes found in this date range to analyze." }, 400);
    }

    // Cap payload to keep token cost predictable (prefer longer notes first)
    const ranked = [...usable].sort((a, b) => (b.noteText?.length || 0) - (a.noteText?.length || 0));
    const capped = ranked.slice(0, 300);
    const dealerNames = uniqueDealerNames(capped);
    const ai = await callOpenAI(buildUserPrompt(capped, dateRangeLabel, dealerNames, lossReasonBreakdown));
    ai.whoLosingTo = excludeKnownDealers(ai.whoLosingTo, dealerNames);

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

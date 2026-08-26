import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SCORE_LABELS = [
  "Poor",
  "Fair",
  "Acceptable",
  "Strong",
  "Excellent",
] as const;

type ScoreLabel = (typeof SCORE_LABELS)[number];

interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
}

interface VehicleRiskReport {
  riskScore: number;
  scoreLabel: ScoreLabel;
  vehicleInfo: VehicleInfo;
  scoreSummary: string;
  strengths: string[];
  weaknesses: string[];
}

interface AnalyzeRequestBody {
  action?: "analyze";
  vin: string;
  mileage: number;
  nhtsaData: Record<string, string>;
}

interface ExtractRequestBody {
  action: "extract-from-image";
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
}

type RequestBody = AnalyzeRequestBody | ExtractRequestBody;

interface ExtractedFields {
  vin: string;
  mileage: number;
}

const EXTRACT_SYSTEM_PROMPT = `You extract vehicle listing data from screenshots for an auto lending portal.

Respond with ONLY valid JSON — no markdown, no code fences.

Schema:
{
  "vin": "<17-character VIN, uppercase, no spaces>",
  "mileage": <integer odometer reading in miles, no decimals>
}

Rules:
- If VIN is not visible or unreadable, use an empty string for vin.
- If mileage is not visible, use 0 for mileage.
- Strip commas from mileage values (e.g. 85,432 → 85432).
- VINs never contain the letters I, O, or Q.

CRITICAL: Return ONLY raw JSON with no markdown, no code fences, no backticks, no \`\`\`json wrapper, no explanation text before or after. The response must start with { and end with }. Nothing else.`;

const SYSTEM_PROMPT = `You are an experienced auto lending underwriter for a subprime/indirect finance company. You assess vehicles as collateral: how risky they are to finance, and how a finance company should buy them.

Respond with ONLY valid JSON — no markdown, no code fences.

Schema:
{
  "riskScore": <integer 1-5, where 1 = too risky / do not buy, 5 = best collateral>,
  "scoreLabel": <one of: "Poor" | "Fair" | "Acceptable" | "Strong" | "Excellent">,
  "vehicleInfo": {
    "year": "<string>",
    "make": "<string>",
    "model": "<string>",
    "trim": "<string>",
    "engine": "<string>"
  },
  "scoreSummary": "<3-5 sentences. Explain WHY this score, then how a finance company should approach buying this car (buy as-is, buy with conditions, or avoid). When available, explicitly mention mileage, the specific engine/powertrain, and trim/resale appeal. Be direct.>",
  "strengths": ["<string>", "<string>", "<string>"],
  "weaknesses": ["<string>", "<string>", "<string>"]
}

Scoring weight order (apply in this priority when setting riskScore; higher items override lower when they conflict):
1. Mileage — MAJOR factor. Age-adjust miles vs model year. High miles for the year must pull the score down hard. Low or average miles can support a higher score.
2. Engine family / displacement — Identify the specific powertrain from NHTSA (DisplacementL, EngineCylinders, year/make/model). Reward well-regarded engines (e.g. Ford F-150 5.0L Coyote). Penalize known problem engines (e.g. certain 5.4L failure patterns). Reflect reliability and repair-cost risk in the score, summary, and lists.
3. Trim / series — Use trim for resale and retail appeal (e.g. F-150 XL vs XLT/Lariat). Base/work trims that typically resell weaker should reduce the score; desirable trims can support a higher score when mileage and engine allow.
4. Year/make/model reputation — Still consider, but only after mileage, engine, and trim when factors conflict.

Rules:
- scoreLabel MUST match riskScore: 1=Poor, 2=Fair, 3=Acceptable, 4=Strong, 5=Excellent.
- Populate vehicleInfo from the NHTSA decode data; use "N/A" only when genuinely unavailable. Engine should combine displacement/cylinders when present (e.g. "5.0L V8").
- Treat NHTSA Trim, DisplacementL, and EngineCylinders as ground truth when provided.
- strengths: 3 to 5 short bullets. Finance-relevant positives for this exact vehicle. When trim/engine data exists, include trim appeal and/or engine reliability bullets — not generic filler like "popular truck".
- weaknesses: 3 to 5 short bullets. Finance-relevant risks with specifics (mileage concerns, known engine problems with repair-cost estimates when relevant, weak trim/resale, upcoming maintenance).
- Do NOT repeat the same points from scoreSummary in strengths/weaknesses. Summary = narrative judgment; lists = distinct supporting bullets.
- Be specific to this exact vehicle. No generic filler.
- Do not include portfolio performance.

CRITICAL: Return ONLY raw JSON starting with { and ending with }.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length >= 3 &&
    value.length <= 5 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0);
}

function expectedLabel(score: number): ScoreLabel {
  return SCORE_LABELS[score - 1];
}

function validateReport(data: unknown): data is VehicleRiskReport {
  if (!data || typeof data !== "object") return false;

  const report = data as Record<string, unknown>;

  if (
    typeof report.riskScore !== "number" ||
    !Number.isInteger(report.riskScore) ||
    report.riskScore < 1 ||
    report.riskScore > 5
  ) {
    return false;
  }

  if (!report.vehicleInfo || typeof report.vehicleInfo !== "object") {
    return false;
  }
  const vi = report.vehicleInfo as Record<string, unknown>;
  const vehicleFields: (keyof VehicleInfo)[] = [
    "year",
    "make",
    "model",
    "trim",
    "engine",
  ];
  if (!vehicleFields.every((field) => typeof vi[field] === "string")) {
    return false;
  }

  if (!isNonEmptyString(report.scoreSummary)) return false;
  if (!isStringArray(report.strengths) || !isStringArray(report.weaknesses)) {
    return false;
  }

  return true;
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

function buildUserPrompt(vin: string, mileage: number, nhtsaData: Record<string, string>): string {
  const nhtsaLines = Object.entries(nhtsaData)
    .filter(([, value]) => value && value.trim() && value.trim() !== "Not Applicable")
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `Analyze this vehicle for lending collateral risk.

VIN: ${vin}
Mileage: ${mileage.toLocaleString()} miles

NHTSA Decode Data:
${nhtsaLines || "(no decode fields provided)"}

Weight in this order: (1) mileage vs year, (2) engine family reliability from DisplacementL/EngineCylinders, (3) trim/resale appeal, (4) year/make/model reputation. Use NHTSA trim and engine fields as ground truth when present. Score as a finance company buying collateral.

Return the simplified JSON report now.`;
}

async function callOpenAIVision(
  imageBase64: string,
  mediaType: ExtractRequestBody["mediaType"],
): Promise<ExtractedFields> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      max_tokens: 256,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACT_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${imageBase64}`,
              },
            },
            {
              type: "text",
              text: "Extract the VIN and mileage from this vehicle listing screenshot.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("OpenAI vision API error:", response.status, errorBody);
    throw new Error(`OpenAI API request failed (${response.status})`);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("No text content in OpenAI response");
  }

  const parsed = extractJson(text) as Record<string, unknown>;
  const vin = typeof parsed.vin === "string" ? parsed.vin.trim().toUpperCase() : "";
  const mileage = typeof parsed.mileage === "number"
    ? Math.round(parsed.mileage)
    : parseInt(String(parsed.mileage ?? "0").replace(/,/g, ""), 10) || 0;

  return { vin, mileage };
}

async function callOpenAI(userPrompt: string): Promise<VehicleRiskReport> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1",
      max_tokens: 2048,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
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

  if (parsed && typeof parsed === "object") {
    const report = parsed as Record<string, unknown>;
    if (typeof report.riskScore === "number") {
      report.riskScore = Math.round(report.riskScore);
    }
    // Normalize label to match score
    if (typeof report.riskScore === "number" && report.riskScore >= 1 && report.riskScore <= 5) {
      report.scoreLabel = expectedLabel(report.riskScore);
    }
    // Cap list lengths to 5
    if (Array.isArray(report.strengths)) {
      report.strengths = report.strengths.slice(0, 5);
    }
    if (Array.isArray(report.weaknesses)) {
      report.weaknesses = report.weaknesses.slice(0, 5);
    }
  }

  if (!validateReport(parsed)) {
    console.error("Invalid report structure:", JSON.stringify(parsed));
    throw new Error("AI response did not match expected report schema");
  }

  return parsed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body: RequestBody = await req.json();

    if (body.action === "extract-from-image") {
      const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
      if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
        return jsonResponse({ error: "Image data is required" }, 400);
      }
      if (!allowedTypes.includes(body.mediaType)) {
        return jsonResponse({ error: "Image must be PNG, JPG, or WEBP" }, 400);
      }

      const extracted = await callOpenAIVision(body.imageBase64, body.mediaType);
      return jsonResponse(extracted);
    }

    const vin = body.vin?.trim().toUpperCase();
    const mileage = body.mileage;
    const nhtsaData = body.nhtsaData;

    if (!vin || vin.length !== 17) {
      return jsonResponse({ error: "A valid 17-character VIN is required" }, 400);
    }

    if (typeof mileage !== "number" || !Number.isFinite(mileage) || mileage < 0) {
      return jsonResponse({ error: "A valid non-negative mileage is required" }, 400);
    }

    if (!nhtsaData || typeof nhtsaData !== "object") {
      return jsonResponse({ error: "NHTSA decode data is required" }, 400);
    }

    const userPrompt = buildUserPrompt(vin, mileage, nhtsaData);
    const report = await callOpenAI(userPrompt);

    return jsonResponse(report);
  } catch (error) {
    console.error("vehicle-risk-report error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});

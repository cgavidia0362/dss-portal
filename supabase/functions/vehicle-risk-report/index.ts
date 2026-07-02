import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LENDING_DECISIONS = [
  "Strong collateral",
  "Acceptable collateral",
  "Higher-risk collateral",
  "Exercise caution",
] as const;

type LendingDecision = (typeof LENDING_DECISIONS)[number];

interface VehicleInfo {
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  drivetrain: string;
  bodyStyle: string;
  fuelEconomy: string;
}

interface MechanicalOverview {
  engine: string;
  transmission: string;
  mileageAssessment: string;
  maintenanceExpense: string;
  otherMechanical: string;
}

interface VehicleRiskReport {
  riskScore: number;
  lendingDecision: LendingDecision;
  vehicleInfo: VehicleInfo;
  bottomLineVerdict: string;
  vehicleSummary: string;
  underwriterOpinion: string;
  pros: string[];
  cons: string[];
  mechanicalOverview: MechanicalOverview;
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

const SYSTEM_PROMPT = `You are an experienced auto lending underwriter and mechanical analyst for a subprime/indirect auto finance portfolio. You assess vehicle collateral quality, reliability risk, and lending suitability.

You must respond with ONLY valid JSON — no markdown, no code fences, no commentary outside the JSON object.

Use this exact schema and field names:

{
  "riskScore": <integer 1-5, where 5 = excellent collateral, 1 = do not buy>,
  "lendingDecision": <one of: "Strong collateral" | "Acceptable collateral" | "Higher-risk collateral" | "Exercise caution">,
  "vehicleInfo": {
    "year": "<string>",
    "make": "<string>",
    "model": "<string>",
    "trim": "<string>",
    "engine": "<string>",
    "drivetrain": "<string>",
    "bodyStyle": "<string>",
    "fuelEconomy": "<string, e.g. 28 city / 35 highway mpg or N/A>"
  },
  "bottomLineVerdict": "<1-2 sentence decisive underwriting verdict>",
  "vehicleSummary": "<2-3 sentence neutral vehicle overview>",
  "underwriterOpinion": "<EXACTLY 2 sentences max. Straight to the point: overall verdict on this car as collateral, how it should be bought (any conditions), and the single biggest cost concern if any. No fluff.>",
  "pros": ["<string>", "<string>", "<string>", "<string>", "<string>"],
  "cons": ["<string>", "<string>", "<string>", "<string>", "<string>"],
  "mechanicalOverview": {
    "engine": "<paragraph on engine reliability and known issues for this exact make/model/year/trim. If elevated risk, include estimated repair costs with dollar amounts.>",
    "transmission": "<paragraph on transmission reliability and known issues for this exact vehicle. If elevated risk, include estimated replacement/repair cost with dollar amounts.>",
    "mileageAssessment": "<paragraph stating whether the provided mileage is good or bad for this vehicle year, plus any upcoming maintenance milestones approaching at this mileage with estimated costs (e.g. timing belt at 90k — $800-$1,200).>",
    "maintenanceExpense": "<paragraph on expected maintenance costs and intervals for this exact vehicle. Include dollar estimates for major services.>",
    "otherMechanical": "<paragraph on brakes, suspension, electrical, or other mechanical considerations. Include dollar estimates for any elevated-risk items.>"
  }
}

Rules:
- Populate vehicleInfo from the NHTSA decode data provided; use "N/A" only when a field is genuinely unavailable.
- riskScore and lendingDecision must be consistent (score 5-4 → Strong/Acceptable; 3 → Acceptable/Higher-risk; 2-1 → Higher-risk/Exercise caution).
- underwriterOpinion: EXACTLY 2 sentences. No filler, no hedging language.
- pros: EXACTLY 5 items. Finance-company-relevant strengths specific to this exact vehicle. Cover where applicable: engine reliability for this year/model, maintenance cost (cheap vs expensive), whether mileage is favorable for the year, historically reliable year/model combo, parts availability, resale value, and anything that reduces lending risk.
- cons: EXACTLY 5 items. Finance-company-relevant risks with real specifics for this exact year/trim/engine. Each con should include concrete details: known issues, expensive maintenance items with dollar estimates (e.g. "timing belt replacement due at 90k — $800-$1,200"), poor MPG if applicable, upcoming wear items with costs, and anything that increases lending risk.
- mechanicalOverview: Be specific to this exact vehicle. For any section that would warrant a yellow or red risk badge (known issues, high wear, expensive repairs, mileage concerns), the paragraph MUST include estimated costs with dollar amounts. mileageAssessment MUST explicitly state whether the mileage is good or bad for the vehicle year AND list upcoming maintenance milestones with estimated costs.
- Be direct and professional. Flag known problem areas for the specific make/model/year/trim when applicable.
- Do not include portfolio performance — that is handled separately by the application.

CRITICAL: Return ONLY raw JSON with no markdown, no code fences, no backticks, no \`\`\`json wrapper, no explanation text before or after. The response must start with { and end with }. Nothing else.`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isLendingDecision(value: unknown): value is LendingDecision {
  return typeof value === "string" &&
    LENDING_DECISIONS.includes(value as LendingDecision);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown, length?: number): value is string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    (!length || value.length === length) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0);
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

  if (!isLendingDecision(report.lendingDecision)) return false;

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
    "drivetrain",
    "bodyStyle",
    "fuelEconomy",
  ];
  if (!vehicleFields.every((field) => typeof vi[field] === "string")) {
    return false;
  }

  if (
    !isNonEmptyString(report.bottomLineVerdict) ||
    !isNonEmptyString(report.vehicleSummary) ||
    !isNonEmptyString(report.underwriterOpinion)
  ) {
    return false;
  }

  if (!isStringArray(report.pros, 5) || !isStringArray(report.cons, 5)) return false;

  if (
    !report.mechanicalOverview ||
    typeof report.mechanicalOverview !== "object"
  ) return false;
  const mo = report.mechanicalOverview as Record<string, unknown>;
  const mechanicalFields: (keyof MechanicalOverview)[] = [
    "engine",
    "transmission",
    "mileageAssessment",
    "maintenanceExpense",
    "otherMechanical",
  ];
  if (!mechanicalFields.every((field) => isNonEmptyString(mo[field]))) {
    return false;
  }

  return true;
}

function extractJson(text: string): unknown {
  // Strip markdown code fences — handle ```json, ```, and any whitespace
  const raw = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  return JSON.parse(raw);
}

function buildUserPrompt(vin: string, mileage: number, nhtsaData: Record<string, string>): string {
  const nhtsaLines = Object.entries(nhtsaData)
    .filter(([, value]) => value && value.trim() && value.trim() !== "Not Applicable")
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n");

  return `Analyze this vehicle for lending collateral risk and mechanical reliability.

VIN: ${vin}
Mileage: ${mileage.toLocaleString()} miles

NHTSA Decode Data:
${nhtsaLines || "(no decode fields provided)"}

Return the JSON report now.

CRITICAL: Return ONLY raw JSON with no markdown, no code fences, no backticks, no \`\`\`json wrapper, no explanation text before or after. The response must start with { and end with }. Nothing else.`;
}

async function callAnthropicVision(
  imageBase64: string,
  mediaType: ExtractRequestBody["mediaType"],
): Promise<ExtractedFields> {
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
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: EXTRACT_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "Extract the VIN and mileage from this vehicle listing screenshot.",
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Anthropic vision API error:", response.status, errorBody);
    throw new Error(`Anthropic API request failed (${response.status})`);
  }

  const result = await response.json();
  const textBlock = result.content?.find((block: { type: string }) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("No text content in Anthropic response");
  }

  const parsed = extractJson(textBlock.text) as Record<string, unknown>;
  const vin = typeof parsed.vin === "string" ? parsed.vin.trim().toUpperCase() : "";
  const mileage = typeof parsed.mileage === "number"
    ? Math.round(parsed.mileage)
    : parseInt(String(parsed.mileage ?? "0").replace(/,/g, ""), 10) || 0;

  return { vin, mileage };
}

async function callAnthropic(userPrompt: string): Promise<VehicleRiskReport> {
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
      model: "claude-sonnet-4-6",
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

      const extracted = await callAnthropicVision(body.imageBase64, body.mediaType);
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
    const report = await callAnthropic(userPrompt);

    return jsonResponse(report);
  } catch (error) {
    console.error("vehicle-risk-report error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: message }, 500);
  }
});

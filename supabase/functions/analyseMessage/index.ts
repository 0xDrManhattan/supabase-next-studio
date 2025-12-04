import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ---------- 1. Auth ----------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing auth header");
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const supabaseDB = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser(token);

    if (userError || !user) {
      console.error("Invalid token", userError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- 2. Parse request ----------
    const body = await req.json().catch(() => null);
    const message: string | undefined = body?.message;

    if (!message || typeof message !== "string" || !message.trim()) {
      console.error("Invalid message:", message);
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("analyseMessage for user:", user.id);
    console.log("Raw message:", message.slice(0, 200));

    // ---------- 3. Call Gemini (NO tools, pure JSON) ----------
    const systemPrompt = `
const systemPrompt = `
Return ONLY valid JSON.

Your task:
1. Split the user's text into 1–5 segments.
2. For each segment, output:
   - type: one of "trade", "idea", "market_thought", "diary"
   - title: 3–7 word human-readable title
   - summary: 1–2 sentence preview
   - cleaned_content: rewrite of the text, clear & professional
   - symbol: uppercase crypto ticker or null
   - direction: "long" | "short" | null
   - entry_price, exit_price, position_size, stop_loss, take_profit, fees, pnl: numbers or null
   - sentiment: "bullish" | "bearish" | "neutral" | null
   - mood: string or null

Symbol rules:
- Recognise tickers like BTC, ETH, SOL, XRP, AVAX, etc.
- Recognise $eth, $btc, #SOL → ETH, BTC, SOL.
- If referenced in a trade context (“bought ETH”, “short SOL”), extract it.
- If none found, return null.

Classification rules:
- TRADE: any numbers connected to a position OR verbs (buy/sell/long/short/open/close).
- IDEA: ticker present but no execution.
- MARKET_THOUGHT: TA indicators, market structure, macro commentary.
- DIARY: psychological, emotional, meta commentary.

Output format (strict):
{
  "segments": [
    {
      "type": "...",
      "title": "...",
      "summary": "...",
      "cleaned_content": "...",
      "symbol": "...",
      "direction": "...",
      "entry_price": ...,
      "exit_price": ...,
      "position_size": ...,
      "stop_loss": ...,
      "take_profit": ...,
      "fees": ...,
      "pnl": ...,
      "sentiment": "...",
      "mood": "..."
    }
  ]
}
`;

If a field is unknown, set it explicitly to null.
If the user text is one single thing, return an array with 1 element.
`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
      }),
    });

    const raw = await aiResp.text();
    console.log("Raw AI response (first 1000 chars):", raw.slice(0, 1000));

    if (!aiResp.ok) {
      console.error("AI call failed:", aiResp.status, raw);
      return new Response(JSON.stringify({ error: "AI call failed", details: raw }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- 4. Parse JSON safely ----------
    let jsonText = raw.trim();

    // Strip ```json ... ``` wrappers if Gemini adds them
    if (jsonText.startsWith("```")) {
      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      console.error("JSON.parse failed:", err, "on text:", jsonText);
      return new Response(JSON.stringify({ error: "Failed to parse AI JSON", raw: jsonText.slice(0, 500) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!parsed || !Array.isArray(parsed.segments)) {
      console.error("Parsed JSON has no segments:", parsed);
      return new Response(JSON.stringify({ error: "AI JSON missing 'segments' array", parsed }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const segments = parsed.segments;
    const results: any[] = [];

    // ---------- 5. Insert each segment ----------
    for (const seg of segments) {
      try {
        const type = seg.type as string;
        const data = seg;

        const title =
          typeof data.title === "string" && data.title.trim()
            ? data.title.trim()
            : type === "market_thought"
              ? "Market Thought"
              : type === "diary"
                ? "Entry"
                : "Idea";

        const cleaned =
          typeof data.cleaned_content === "string" && data.cleaned_content.trim()
            ? data.cleaned_content.trim()
            : message;

        const symbol = typeof data.symbol === "string" && data.symbol.trim() ? data.symbol.trim().toUpperCase() : null;

        const direction = data.direction === "long" || data.direction === "short" ? data.direction : null;

        let tableName: string;
        let insertResult;
        let insertError;

        if (type === "trade") {
          tableName = "trades";
          const insertPayload = {
            user_id: user.id,
            symbol,
            trade_type: direction,
            entry_price: data.entry_price ?? null,
            exit_price: data.exit_price ?? null,
            position_size: data.position_size ?? null,
            quantity: data.position_size ?? null, // keep for compatibility
            stop_loss: data.stop_loss ?? null,
            take_profit: data.take_profit ?? null,
            fees: data.fees ?? null,
            pnl: data.pnl ?? null,
            notes: cleaned,
          };
          console.log("Insert trade:", insertPayload);
          const { data: row, error } = await supabaseDB.from("trades").insert(insertPayload).select().single();
          insertResult = row;
          insertError = error;
        } else if (type === "idea") {
          tableName = "ideas";
          const insertPayload = {
            user_id: user.id,
            title,
            content: cleaned,
            symbol,
          };
          console.log("Insert idea:", insertPayload);
          const { data: row, error } = await supabaseDB.from("ideas").insert(insertPayload).select().single();
          insertResult = row;
          insertError = error;
        } else if (type === "market_thought") {
          tableName = "market_thoughts";
          const sentiment =
            data.sentiment === "bullish" || data.sentiment === "bearish" || data.sentiment === "neutral"
              ? data.sentiment
              : null;
          const insertPayload = {
            user_id: user.id,
            title,
            content: cleaned,
            sentiment,
          };
          console.log("Insert market_thought:", insertPayload);
          const { data: row, error } = await supabaseDB.from("market_thoughts").insert(insertPayload).select().single();
          insertResult = row;
          insertError = error;
        } else {
          tableName = "diary";
          const insertPayload = {
            user_id: user.id,
            title,
            content: cleaned,
            mood: typeof data.mood === "string" ? data.mood : null,
          };
          console.log("Insert diary:", insertPayload);
          const { data: row, error } = await supabaseDB.from("diary").insert(insertPayload).select().single();
          insertResult = row;
          insertError = error;
        }

        if (insertError) {
          console.error(`Insert error for ${type}:`, insertError);
          results.push({ type, error: insertError.message });
        } else {
          results.push({ type, table: insertResult ? insertResult.table : undefined, id: insertResult?.id });
        }
      } catch (segErr) {
        console.error("Error processing segment:", seg, segErr);
        results.push({ type: "unknown", error: String(segErr) });
      }
    }

    // ---------- 6. Response ----------
    return new Response(JSON.stringify({ status: "ok", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unhandled error in analyseMessage:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

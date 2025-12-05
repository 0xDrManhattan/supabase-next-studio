import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
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
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);

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

    // ---------- 3. Call Gemini ----------
    const systemPrompt = `You are a trading journal assistant. Analyze the user's message and extract structured data.

CLASSIFICATION RULES (in priority order):
1. TRADE: Contains specific numbers tied to a position (entry price, exit price, SL, TP, size, leverage, PnL, %) OR explicit trading verbs (bought, sold, longed, shorted, opened, closed, entered, exited).
2. IDEA: Has a ticker/symbol but NO specific execution numbers. Watchlist items, "thinking about buying X", speculation without action.
3. MARKET_THOUGHT: Technical analysis (MA, RSI, MACD, support, resistance), macro commentary, market structure, "alts pumping", "BTC dominance", sector rotation.
4. DIARY: Emotional/behavioral reflections: FOMO, revenge trading, overtrading, confidence, fear, daily summaries of feelings.

SYMBOL EXTRACTION (CRITICAL):
- Look for 2-10 letter uppercase words: BTC, ETH, SOL, XRP, AVAX, LINK, etc.
- Also match: $btc, $eth, #SOL, btc, eth (case-insensitive) → convert to uppercase
- Extract symbol when it appears near trading context words: buy, sell, long, short, entry, exit, SL, TP, target, stop, size, position
- Common crypto tickers: BTC, ETH, SOL, XRP, AVAX, LINK, DOT, ADA, MATIC, ARB, OP, DOGE, SHIB, BNB, NEAR, APT, SUI, INJ, TIA, SEI, JUP, WIF, PEPE, BONK
- If no valid ticker found, set symbol to null (NOT "UNKNOWN")

OUTPUT FORMAT (strict JSON, no markdown):
{
  "segments": [
    {
      "type": "trade" | "idea" | "market_thought" | "diary",
      "title": "3-7 word descriptive title",
      "summary": "1-2 sentence preview",
      "cleaned_content": "Polished, professional rewrite preserving all facts and numbers",
      "symbol": "BTC" | null,
      "direction": "long" | "short" | null,
      "entry_price": number | null,
      "exit_price": number | null,
      "position_size": number | null,
      "stop_loss": number | null,
      "take_profit": number | null,
      "fees": number | null,
      "pnl": number | null,
      "sentiment": "bullish" | "bearish" | "neutral" | null,
      "mood": "string describing emotional state" | null
    }
  ]
}

TITLE EXAMPLES:
- Trade: "ETH long from support", "BTC scalp on CPI dump", "SOL short at resistance"
- Idea: "SOL breakout watch", "Potential ETH accumulation zone"
- Market: "Altcoin pullback after CPI", "BTC dominance rising"
- Diary: "Overtrading after losing streak", "FOMO on missed trade"

Return ONLY the JSON object, no extra text or markdown code blocks.`;

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

    const rawResponse = await aiResp.text();
    console.log("Raw AI response:", rawResponse.slice(0, 1500));

    if (!aiResp.ok) {
      console.error("AI call failed:", aiResp.status, rawResponse);
      return new Response(JSON.stringify({ error: "AI call failed", details: rawResponse }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- 4. Parse AI response (OpenAI format) ----------
    let aiContent: string;
    try {
      const aiJson = JSON.parse(rawResponse);
      aiContent = aiJson.choices?.[0]?.message?.content || "";
      console.log("Extracted AI content:", aiContent.slice(0, 1000));
    } catch (err) {
      console.error("Failed to parse AI response wrapper:", err);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip markdown code blocks if present
    let jsonText = aiContent.trim();
    if (jsonText.startsWith("```")) {
      const firstBrace = jsonText.indexOf("{");
      const lastBrace = jsonText.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        jsonText = jsonText.slice(firstBrace, lastBrace + 1);
      }
    }

    let parsed: { segments: any[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      console.error("JSON.parse failed:", err, "on text:", jsonText.slice(0, 500));
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

    console.log("Parsed segments:", JSON.stringify(parsed.segments, null, 2));

    const results: { type: string; table?: string; id?: string; error?: string }[] = [];

    // ---------- 5. Insert each segment ----------
    for (const seg of parsed.segments) {
      try {
        const type = seg.type as string;

        // Extract and clean fields
        const title = typeof seg.title === "string" && seg.title.trim()
          ? seg.title.trim()
          : type === "trade" ? "Trade Entry"
          : type === "idea" ? "Trading Idea"
          : type === "market_thought" ? "Market Analysis"
          : "Journal Entry";

        const cleaned = typeof seg.cleaned_content === "string" && seg.cleaned_content.trim()
          ? seg.cleaned_content.trim()
          : message;

        // Symbol: normalize to uppercase, reject "UNKNOWN"
        let symbol: string | null = null;
        if (typeof seg.symbol === "string" && seg.symbol.trim()) {
          const rawSymbol = seg.symbol.trim().toUpperCase();
          if (rawSymbol !== "UNKNOWN" && rawSymbol.length >= 2 && rawSymbol.length <= 10) {
            symbol = rawSymbol;
          }
        }

        const direction = seg.direction === "long" || seg.direction === "short" ? seg.direction : null;

        let tableName: string;
        let insertResult: any;
        let insertError: any;

        if (type === "trade") {
          tableName = "trades";
          const insertPayload = {
            user_id: user.id,
            symbol,
            trade_type: direction,
            entry_price: typeof seg.entry_price === "number" ? seg.entry_price : null,
            exit_price: typeof seg.exit_price === "number" ? seg.exit_price : null,
            position_size: typeof seg.position_size === "number" ? seg.position_size : null,
            quantity: typeof seg.position_size === "number" ? seg.position_size : null,
            stop_loss: typeof seg.stop_loss === "number" ? seg.stop_loss : null,
            take_profit: typeof seg.take_profit === "number" ? seg.take_profit : null,
            fees: typeof seg.fees === "number" ? seg.fees : null,
            pnl: typeof seg.pnl === "number" ? seg.pnl : null,
            notes: cleaned,
          };
          console.log("Insert trade payload:", JSON.stringify(insertPayload, null, 2));
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
            status: "draft",
          };
          console.log("Insert idea payload:", JSON.stringify(insertPayload, null, 2));
          const { data: row, error } = await supabaseDB.from("ideas").insert(insertPayload).select().single();
          insertResult = row;
          insertError = error;
        } else if (type === "market_thought") {
          tableName = "market_thoughts";
          const sentiment = ["bullish", "bearish", "neutral"].includes(seg.sentiment) ? seg.sentiment : null;
          const insertPayload = {
            user_id: user.id,
            title,
            content: cleaned,
            sentiment,
          };
          console.log("Insert market_thought payload:", JSON.stringify(insertPayload, null, 2));
          const { data: row, error } = await supabaseDB.from("market_thoughts").insert(insertPayload).select().single();
          insertResult = row;
          insertError = error;
        } else {
          tableName = "diary";
          const insertPayload = {
            user_id: user.id,
            title,
            content: cleaned,
            mood: typeof seg.mood === "string" ? seg.mood : null,
          };
          console.log("Insert diary payload:", JSON.stringify(insertPayload, null, 2));
          const { data: row, error } = await supabaseDB.from("diary").insert(insertPayload).select().single();
          insertResult = row;
          insertError = error;
        }

        if (insertError) {
          console.error(`Insert error for ${type}:`, insertError);
          results.push({ type, table: tableName, error: insertError.message });
        } else {
          results.push({ type, table: tableName, id: insertResult?.id });
        }
      } catch (segErr) {
        console.error("Error processing segment:", seg, segErr);
        results.push({ type: seg.type || "unknown", error: String(segErr) });
      }
    }

    // ---------- 6. Response ----------
    return new Response(JSON.stringify({ status: "ok", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unhandled error in analyseMessage:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

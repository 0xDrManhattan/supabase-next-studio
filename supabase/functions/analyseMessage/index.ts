import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SegmentType = "trade" | "idea" | "market_thought" | "diary";

interface SegmentData {
  title: string;
  summary: string;
  cleaned_content: string;
  symbol?: string | null;
  direction?: "long" | "short";
  entry_price?: number | null;
  exit_price?: number | null;
  position_size?: number | null;
  stop_loss?: number | null;
  take_profit?: number | null;
  fees?: number | null;
  pnl?: number | null;
  sentiment?: "bullish" | "bearish" | "neutral" | null;
  mood?: string | null;
}

interface Segment {
  type: SegmentType;
  data: SegmentData;
}

/**
 * Very small fallback symbol detector, used only when AI leaves symbol null.
 * - Looks for 2–10 letter words near numbers / trade keywords
 * - Normalises $ETH, #btc → ETH / BTC
 * - Avoids common words like "btw"
 */
function fallbackSymbolFromText(text: string): string | null {
  const lowered = text.toLowerCase();

  const keywords = [
    "entry",
    "exit",
    "tp",
    "sl",
    "stop",
    "target",
    "take profit",
    "stop loss",
    "buy",
    "sell",
    "long",
    "short",
    "size",
  ];

  const nearTradeContext = keywords.some((k) => lowered.includes(k));
  if (!nearTradeContext) return null;

  const blacklist = new Set(["btw", "and", "the", "for", "but", "or", "not"]);

  // Capture $eth, #sol, eth etc.
  const re = /(?:^|\s)(\$|#)?([a-zA-Z]{2,10})(?=\s|$|[0-9])/g;
  let match: RegExpExecArray | null;
  const candidates: string[] = [];

  while ((match = re.exec(text)) !== null) {
    const raw = match[2].toLowerCase();
    if (!blacklist.has(raw)) candidates.push(raw.toUpperCase());
  }

  if (!candidates.length) return null;

  // If multiple, pick the first – good enough for journal use.
  return candidates[0];
}

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceKey || !lovableKey) {
      console.error("Missing env vars", {
        hasUrl: !!supabaseUrl,
        hasAnon: !!anonKey,
        hasService: !!serviceKey,
        hasLovable: !!lovableKey,
      });
      return new Response(JSON.stringify({ error: "Server not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, anonKey);
    const supabaseDB = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "").trim();
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

    const body = await req.json().catch(() => null);
    const message: string | undefined = body?.message;

    if (!message || typeof message !== "string" || !message.trim()) {
      return new Response(JSON.stringify({ error: "No message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- SYSTEM PROMPT WITH RULES ----------
    const systemPrompt = `
You are a trading journal assistant. Analyse the user's message and split it into
independent segments. Each segment must be classified and structured.

CLASS TYPES
- "trade": contains numbers tied to a position (entry, exit, SL, TP, size, % PnL)
           OR explicit execution / plan (buy, sell, long, short, open, close).
- "idea": ticker present but no concrete execution/pricing yet (watchlist, setup, "thinking to buy SOL later").
- "market_thought": macro view or TA (MA, RSI, MACD, support/resistance, funding, open interest, overall market move).
- "diary": psychology / emotions / behaviour ("I overtraded", "felt FOMO", "was scared to enter", etc).

SYMBOL EXTRACTION (CRITICAL)
- "symbol" must be either UPPERCASE ticker (e.g. BTC, ETH, SOL) or null.
- Treat something as potential ticker if:
    * it is 2–10 letters, AND
    * appears in trading context (near prices, SL/TP, size, or trade verbs).
- Normalise $ETH, #btc, eth/usdt -> ETH, BTC, ETH.
- If there is at least one probable trading ticker, choose the most likely and set "symbol" to it.
- If there is no real ticker, set symbol = null (do NOT invent one).
- DO NOT treat filler words (e.g. "btw", "and", "the") as symbols.

FIELDS TO RETURN (FOR EACH SEGMENT)
For EVERY segment you MUST produce:
  - "type": "trade" | "idea" | "market_thought" | "diary"
  - "title": short 3–7 word label:
      * trade: "ETH long from support", "BTC scalp on CPI dump"
      * idea:  "SOL breakout watch"
      * market_thought: "Altseason rotation setup"
      * diary: "Overtrading after loss"
  - "summary": 1–2 sentence preview of the key point
  - "cleaned_content": full text, rewritten to be clear and professional but preserving all factual details

Type-specific:
  - trade: symbol, direction, entry_price, exit_price, position_size, stop_loss, take_profit, fees, pnl (when available)
  - idea:  symbol (if any), sentiment (bullish/bearish/neutral when obvious)
  - market_thought: sentiment (bullish/bearish/neutral when obvious)
  - diary: mood (free text, e.g. "frustrated", "confident")

Return JSON only via the tool call. No natural-language explanation.
    `.trim();

    // ---------- CALL LOVABLE / GEMINI ----------
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        tools: [
          {
            type: "function",
            function: {
              name: "classify_segments",
              description: "Split a trading-related message into segments and structure each segment.",
              parameters: {
                type: "object",
                properties: {
                  segments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: {
                          type: "string",
                          enum: ["trade", "idea", "market_thought", "diary"],
                        },
                        data: {
                          type: "object",
                          properties: {
                            title: {
                              type: "string",
                              description: "Short 3–7 word title for this segment.",
                            },
                            summary: {
                              type: "string",
                              description: "1–2 sentence preview of the segment.",
                            },
                            cleaned_content: {
                              type: "string",
                              description: "Full, cleaned, professional text for this segment.",
                            },
                            symbol: {
                              type: ["string", "null"],
                              description: "Uppercase trading ticker (BTC, ETH, SOL, etc.) or null if none.",
                              pattern: "^[A-Za-z]{2,10}$",
                            },
                            direction: {
                              type: "string",
                              enum: ["long", "short"],
                            },
                            entry_price: { type: "number" },
                            exit_price: { type: "number" },
                            position_size: { type: "number" },
                            stop_loss: { type: "number" },
                            take_profit: { type: "number" },
                            fees: { type: "number" },
                            pnl: { type: "number" },
                            sentiment: {
                              type: "string",
                              enum: ["bullish", "bearish", "neutral"],
                            },
                            mood: { type: "string" },
                          },
                          required: ["title", "summary", "cleaned_content"],
                        },
                      },
                      required: ["type", "data"],
                    },
                  },
                },
                required: ["segments"],
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "classify_segments" },
        },
      }),
    });

    if (!aiResponse.ok) {
      const text = await aiResponse.text();
      console.error("AI error", aiResponse.status, text);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response", aiData);
      return new Response(JSON.stringify({ error: "AI classification failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("Failed to parse tool arguments", e, toolCall.function.arguments);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const segments: Segment[] = parsed.segments || [];
    const results: Array<{ type: SegmentType; table: string; id?: string; error?: string }> = [];

    // ---------- INSERT PER SEGMENT ----------
    for (const segment of segments) {
      const { type, data } = segment;
      let tableName: string;
      let insertResult;
      let insertError;

      const cleaned = data.cleaned_content || message;
      const normalizedSymbol =
        data.symbol && typeof data.symbol === "string" ? data.symbol.toUpperCase() : fallbackSymbolFromText(cleaned);

      const title =
        data.title ||
        (type === "trade"
          ? "Trade"
          : type === "idea"
            ? "Idea"
            : type === "market_thought"
              ? "Market Thought"
              : "Entry");

      if (type === "trade") {
        tableName = "trades";
        const { data: row, error } = await supabaseDB
          .from("trades")
          .insert({
            user_id: user.id,
            symbol: normalizedSymbol,
            trade_type: data.direction ?? null,
            entry_price: data.entry_price ?? null,
            exit_price: data.exit_price ?? null,
            position_size: data.position_size ?? null,
            quantity: data.position_size ?? null, // backwards compat if you still have quantity
            stop_loss: data.stop_loss ?? null,
            take_profit: data.take_profit ?? null,
            fees: data.fees ?? null,
            pnl: data.pnl ?? null,
            notes: cleaned,
          })
          .select()
          .single();

        insertResult = row;
        insertError = error;
      } else if (type === "idea") {
        tableName = "ideas";
        const { data: row, error } = await supabaseDB
          .from("ideas")
          .insert({
            user_id: user.id,
            title,
            content: cleaned,
            symbol: normalizedSymbol,
            // you can add "status" / "sentiment" columns later
          })
          .select()
          .single();

        insertResult = row;
        insertError = error;
      } else if (type === "market_thought") {
        tableName = "market_thoughts";
        const { data: row, error } = await supabaseDB
          .from("market_thoughts")
          .insert({
            user_id: user.id,
            title,
            content: cleaned,
            sentiment: data.sentiment ?? null,
          })
          .select()
          .single();

        insertResult = row;
        insertError = error;
      } else {
        tableName = "diary";
        const { data: row, error } = await supabaseDB
          .from("diary")
          .insert({
            user_id: user.id,
            title,
            content: cleaned,
            mood: data.mood ?? null,
          })
          .select()
          .single();

        insertResult = row;
        insertError = error;
      }

      if (insertError) {
        console.error(`Insert error for ${type} -> ${tableName}`, insertError);
        results.push({
          type,
          table: tableName,
          error: insertError.message,
        });
      } else {
        results.push({
          type,
          table: tableName,
          id: insertResult.id,
        });
      }
    }

    return new Response(JSON.stringify({ status: "ok", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Unhandled error in analyseMessage", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

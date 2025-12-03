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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });
    }

    const supabaseAuth = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const supabaseDB = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: corsHeaders });
    }

    const { message } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ error: "No message" }), { status: 400, headers: corsHeaders });
    }

    const systemPrompt = `You are a trading journal assistant. Analyze the user message and split it into independent segments. Classify each segment as one of: trade, idea, market_thought, diary.

TRADE: Contains numbers (entry, exit, sl, tp, size, pnl) OR execution actions (buy, sell, long, short, open, close).
IDEA: Contains a ticker but NO numbers, speculative/exploratory thinking.
MARKET_THOUGHT: Macro commentary, TA analysis, indicators (MA, RSI, MACD), market-wide movements.
DIARY: Emotional reactions, behavioral mistakes, psychology reflections.

Return JSON array only. No explanations.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify_segments",
            parameters: {
              type: "object",
              properties: {
                segments: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["trade", "idea", "market_thought", "diary"] },
                      data: { type: "object" }
                    },
                    required: ["type", "data"]
                  }
                }
              },
              required: ["segments"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "classify_segments" } }
      })
    });

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI classification failed" }), { status: 500, headers: corsHeaders });
    }

    const { segments } = JSON.parse(toolCall.function.arguments);
    const results = [];

    for (const segment of segments) {
      const { type, data } = segment;
      let result, error, tableName;

      if (type === "trade") {
        tableName = "trades";
        const insert = await supabaseDB.from("trades").insert({
          user_id: user.id, symbol: data.symbol || "UNKNOWN", trade_type: data.direction,
          entry_price: data.entry_price, exit_price: data.exit_price, position_size: data.position_size,
          stop_loss: data.stop_loss, take_profit: data.take_profit, fees: data.fees, pnl: data.pnl, notes: data.notes || message
        }).select().single();
        result = insert.data; error = insert.error;
      } else if (type === "idea") {
        tableName = "ideas";
        const insert = await supabaseDB.from("ideas").insert({
          user_id: user.id, title: data.title || data.symbol || "Idea", content: data.content || message, symbol: data.symbol
        }).select().single();
        result = insert.data; error = insert.error;
      } else if (type === "market_thought") {
        tableName = "market_thoughts";
        const insert = await supabaseDB.from("market_thoughts").insert({
          user_id: user.id, title: data.title || "Market Thought", content: data.content || message, sentiment: data.sentiment
        }).select().single();
        result = insert.data; error = insert.error;
      } else {
        tableName = "diary";
        const insert = await supabaseDB.from("diary").insert({
          user_id: user.id, title: data.title || "Entry", content: data.content || message
        }).select().single();
        result = insert.data; error = insert.error;
      }

      if (error) {
        console.error(`Insert error for ${tableName}:`, error);
        results.push({ type, table: tableName, error: error.message });
      } else {
        results.push({ type, table: tableName, id: result.id });
      }
    }

    return new Response(JSON.stringify({ status: "ok", results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: corsHeaders });
  }
});

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing message for user:", user.id);

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a trading journal assistant. Analyze the user's message and categorize it into one of these types:
- "trade": For entries about specific trades (buying/selling stocks, entry/exit prices, P&L)
- "idea": For trading ideas or watchlist items
- "market_thought": For general market analysis or thoughts about market conditions
- "diary": For personal reflections, emotions, or daily trading notes

You MUST respond with a JSON object using this exact structure:
{
  "type": "trade" | "idea" | "market_thought" | "diary",
  "data": {
    // For trade: { symbol, trade_type, entry_price, exit_price, quantity, pnl, notes }
    // For idea: { title, content, symbol, status }
    // For market_thought: { title, content, sentiment }
    // For diary: { title, content, mood }
  }
}

Extract as much structured data as possible from the message. Use null for missing fields.`,
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_journal_entry",
              description: "Extract and categorize a trading journal entry",
              parameters: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["trade", "idea", "market_thought", "diary"],
                  },
                  data: {
                    type: "object",
                    properties: {
                      symbol: { type: "string" },
                      trade_type: { type: "string" },
                      entry_price: { type: "number" },
                      exit_price: { type: "number" },
                      quantity: { type: "number" },
                      pnl: { type: "number" },
                      notes: { type: "string" },
                      title: { type: "string" },
                      content: { type: "string" },
                      status: { type: "string" },
                      sentiment: { type: "string" },
                      mood: { type: "string" },
                    },
                  },
                },
                required: ["type", "data"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_journal_entry" } },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI analysis failed");
    }

    const aiData = await aiResponse.json();
    console.log("AI response:", JSON.stringify(aiData));

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log("Extracted data:", JSON.stringify(extracted));

    const { type, data } = extracted;

    // Save to appropriate table
    let savedData;
    let tableName;

    switch (type) {
      case "trade":
        tableName = "trades";
        const { error: tradeError, data: tradeData } = await supabase
          .from("trades")
          .insert({
            user_id: user.id,
            symbol: data.symbol || "UNKNOWN",
            trade_type: data.trade_type,
            entry_price: data.entry_price,
            exit_price: data.exit_price,
            quantity: data.quantity,
            pnl: data.pnl,
            notes: data.notes || message,
          })
          .select()
          .single();
        if (tradeError) throw tradeError;
        savedData = tradeData;
        break;

      case "idea":
        tableName = "ideas";
        const { error: ideaError, data: ideaData } = await supabase
          .from("ideas")
          .insert({
            user_id: user.id,
            title: data.title || "Trading Idea",
            content: data.content || message,
            symbol: data.symbol,
            status: data.status || "draft",
          })
          .select()
          .single();
        if (ideaError) throw ideaError;
        savedData = ideaData;
        break;

      case "market_thought":
        tableName = "market_thoughts";
        const { error: thoughtError, data: thoughtData } = await supabase
          .from("market_thoughts")
          .insert({
            user_id: user.id,
            title: data.title,
            content: data.content || message,
            sentiment: data.sentiment,
          })
          .select()
          .single();
        if (thoughtError) throw thoughtError;
        savedData = thoughtData;
        break;

      case "diary":
      default:
        tableName = "diary";
        const { error: diaryError, data: diaryData } = await supabase
          .from("diary")
          .insert({
            user_id: user.id,
            title: data.title,
            content: data.content || message,
            mood: data.mood,
          })
          .select()
          .single();
        if (diaryError) throw diaryError;
        savedData = diaryData;
        break;
    }

    console.log(`Saved to ${tableName}:`, savedData?.id);

    return new Response(
      JSON.stringify({
        type,
        table: tableName,
        data: savedData,
        extracted,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in analyseMessage:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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
    // 1. Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("Missing Authorization header");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      console.error("Invalid token:", userError?.message);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Authenticated user:", user.id);

    // 4. Parse request body
    const { message } = await req.json();
    if (!message || typeof message !== "string" || !message.trim()) {
      console.error("Invalid message:", message);
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Processing message:", message.substring(0, 100));

    // 5. Get API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY not configured");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Call AI for classification
    console.log("Calling AI for classification...");
    
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
            content: `You are a trading journal assistant that categorizes user messages. Analyze the message and categorize it into exactly ONE of these types:

1. "trade" - Use this for:
   - Actual executed trades (bought, sold, entered, exited)
   - Trade plans with specific entry/exit prices
   - Messages mentioning buy/sell with price targets, stop loss, take profit
   - Position entries or exits with numbers
   - Example: "Bought 1 ETH at 2000", "Long BTC at 50k, TP 55k, SL 48k", "1 eth for 2000 tp 2500 sl 1900"

2. "idea" - Use this for:
   - Watchlist items WITHOUT specific prices or trade plans
   - General stock/crypto picks without entry/exit details
   - "I'm watching XYZ" or "XYZ looks interesting" type messages

3. "market_thought" - Use this for:
   - Market analysis or commentary without specific trades
   - Opinions about market direction
   - Economic news interpretation
   - "Market looks bullish today", "Fed announcement impact"

4. "diary" - Use this for:
   - Personal reflections about trading psychology
   - Emotional states (feeling confident, anxious)
   - Daily trading summaries without specific trades

CRITICAL: If the message contains ANY specific prices (entry price, exit price, stop loss, take profit, quantity), classify it as "trade" NOT "idea".`,
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "categorize_trading_entry",
              description: "Categorize and extract data from a trading journal entry",
              parameters: {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    enum: ["trade", "idea", "market_thought", "diary"],
                    description: "The category of the message",
                  },
                  data: {
                    type: "object",
                    properties: {
                      // Trade fields
                      symbol: { type: "string", description: "Trading symbol (e.g., ETH, BTC, AAPL)" },
                      direction: { type: "string", enum: ["long", "short"], description: "Trade direction - long for buy, short for sell" },
                      entry_price: { type: "number", description: "Entry price" },
                      exit_price: { type: "number", description: "Exit price" },
                      position_size: { type: "number", description: "Position size / quantity" },
                      stop_loss: { type: "number", description: "Stop loss price" },
                      take_profit: { type: "number", description: "Take profit price" },
                      pnl: { type: "number", description: "Profit/Loss amount" },
                      fees: { type: "number", description: "Trading fees" },
                      notes: { type: "string", description: "Trade notes" },
                      // Idea/thought fields  
                      title: { type: "string", description: "Title for the entry" },
                      content: { type: "string", description: "Main content" },
                      sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"], description: "Market sentiment" },
                      mood: { type: "string", description: "User's mood/emotional state" },
                      status: { type: "string", description: "Status of idea" },
                    },
                  },
                },
                required: ["type", "data"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "categorize_trading_entry" } },
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
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Parse AI response
    const aiData = await aiResponse.json();
    console.log("AI response received:", JSON.stringify(aiData).substring(0, 500));

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in AI response");
      return new Response(JSON.stringify({ error: "AI classification failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let extracted;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      console.error("Failed to parse AI output:", parseError);
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Extracted classification:", JSON.stringify(extracted));

    const { type, data } = extracted;
    if (!type || !data) {
      console.error("Invalid extracted data structure");
      return new Response(JSON.stringify({ error: "Invalid AI response structure" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Insert into appropriate table
    let savedData;
    let tableName;

    switch (type) {
      case "trade": {
        tableName = "trades";
        
        // Map direction to trade_type (constraint allows only 'long' or 'short')
        let tradeType: string | null = null;
        const dir = (data.direction || "").toLowerCase();
        if (dir === "long" || dir === "buy") tradeType = "long";
        else if (dir === "short" || dir === "sell") tradeType = "short";
        
        // Calculate notional value if we have entry_price and position_size
        const entryPrice = data.entry_price ?? null;
        const positionSize = data.position_size ?? null;
        const notionalValue = (entryPrice && positionSize) ? entryPrice * positionSize : null;
        
        console.log("Inserting trade:", { 
          symbol: data.symbol, 
          tradeType, 
          entryPrice, 
          positionSize,
          stopLoss: data.stop_loss,
          takeProfit: data.take_profit 
        });
        
        const { error: tradeError, data: tradeData } = await supabase
          .from("trades")
          .insert({
            user_id: user.id,
            symbol: data.symbol || "UNKNOWN",
            trade_type: tradeType,
            entry_price: entryPrice,
            exit_price: data.exit_price ?? null,
            position_size: positionSize,
            quantity: positionSize, // Keep for backwards compatibility
            notional_value: notionalValue,
            stop_loss: data.stop_loss ?? null,
            take_profit: data.take_profit ?? null,
            pnl: data.pnl ?? null,
            fees: data.fees ?? null,
            notes: data.notes || message,
            notes_on_enter: data.notes || message,
          })
          .select()
          .single();
          
        if (tradeError) {
          console.error("Trade insert error:", tradeError);
          throw tradeError;
        }
        savedData = tradeData;
        console.log("Saved trade:", savedData.id);
        break;
      }

      case "idea": {
        tableName = "ideas";
        const { error: ideaError, data: ideaData } = await supabase
          .from("ideas")
          .insert({
            user_id: user.id,
            title: data.title || "Trading Idea",
            content: data.content || message,
            symbol: data.symbol ?? null,
            status: data.status || "draft",
          })
          .select()
          .single();
          
        if (ideaError) {
          console.error("Idea insert error:", ideaError);
          throw ideaError;
        }
        savedData = ideaData;
        console.log("Saved idea:", savedData.id);
        break;
      }

      case "market_thought": {
        tableName = "market_thoughts";
        const { error: thoughtError, data: thoughtData } = await supabase
          .from("market_thoughts")
          .insert({
            user_id: user.id,
            title: data.title ?? null,
            content: data.content || message,
            sentiment: data.sentiment ?? null,
          })
          .select()
          .single();
          
        if (thoughtError) {
          console.error("Market thought insert error:", thoughtError);
          throw thoughtError;
        }
        savedData = thoughtData;
        console.log("Saved market_thought:", savedData.id);
        break;
      }

      case "diary":
      default: {
        tableName = "diary";
        const { error: diaryError, data: diaryData } = await supabase
          .from("diary")
          .insert({
            user_id: user.id,
            title: data.title ?? null,
            content: data.content || message,
            mood: data.mood ?? null,
          })
          .select()
          .single();
          
        if (diaryError) {
          console.error("Diary insert error:", diaryError);
          throw diaryError;
        }
        savedData = diaryData;
        console.log("Saved diary:", savedData.id);
        break;
      }
    }

    // 9. Return success response
    const response = {
      status: "ok",
      type,
      table: tableName,
      id: savedData.id,
    };
    
    console.log("Success response:", JSON.stringify(response));
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Unhandled error in analyseMessage:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

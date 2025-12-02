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

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `Classify the message as "trade" or "diary". For trade: extract symbol, entry_price, exit_price, quantity, stop_loss, take_profit, notes. For diary: extract title, content. Return JSON only.` },
          { role: "user", content: message }
        ],
        tools: [{
          type: "function",
          function: {
            name: "classify",
            parameters: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["trade", "diary"] },
                data: { type: "object" }
              },
              required: ["type", "data"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "classify" } }
      })
    });

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI classification failed" }), { status: 500, headers: corsHeaders });
    }

    const { type, data } = JSON.parse(toolCall.function.arguments);
    let result, error, tableName;

    if (type === "trade") {
      tableName = "trades";
      const insert = await supabaseDB.from("trades").insert({
        user_id: user.id, symbol: data.symbol || "UNKNOWN", entry_price: data.entry_price,
        exit_price: data.exit_price, quantity: data.quantity, stop_loss: data.stop_loss,
        take_profit: data.take_profit, notes: data.notes || message
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
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ status: "ok", type, table: tableName, id: result.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});

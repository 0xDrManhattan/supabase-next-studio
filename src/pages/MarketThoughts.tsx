import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";

interface MarketThought {
  id: string;
  title: string | null;
  content: string;
  sentiment: string | null;
  created_at: string;
}

const MarketThoughts = () => {
  const [thoughts, setThoughts] = useState<MarketThought[]>([]);

  useEffect(() => {
    const fetchThoughts = async () => {
      const { data } = await supabase.from("market_thoughts").select("*").order("created_at", { ascending: false });
      setThoughts(data || []);
    };
    fetchThoughts();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Market Thoughts</h1>
        {thoughts.length === 0 ? (
          <p className="text-muted-foreground">No market thoughts yet.</p>
        ) : (
          <div className="space-y-3">
            {thoughts.map((thought) => (
              <div key={thought.id} className="border rounded-md p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{thought.title || "Market Thought"}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(thought.created_at).toLocaleDateString()}
                  </span>
                </div>
                {thought.sentiment && <span className="text-sm text-primary">{thought.sentiment}</span>}
                <p className="mt-2">{thought.content}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MarketThoughts;

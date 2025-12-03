import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";

interface Idea {
  id: string;
  title: string;
  content: string | null;
  symbol: string | null;
  status: string | null;
  created_at: string;
}

const Ideas = () => {
  const [ideas, setIdeas] = useState<Idea[]>([]);

  useEffect(() => {
    const fetchIdeas = async () => {
      const { data } = await supabase.from("ideas").select("*").order("created_at", { ascending: false });
      setIdeas(data || []);
    };
    fetchIdeas();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Ideas</h1>
        {ideas.length === 0 ? (
          <p className="text-muted-foreground">No ideas yet.</p>
        ) : (
          <div className="space-y-3">
            {ideas.map((idea) => (
              <div key={idea.id} className="border rounded-md p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{idea.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(idea.created_at).toLocaleDateString()}
                  </span>
                </div>
                {idea.symbol && <span className="text-sm text-primary">{idea.symbol}</span>}
                {idea.content && <p className="mt-2">{idea.content}</p>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Ideas;

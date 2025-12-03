import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface MarketThought {
  id: string;
  title: string | null;
  content: string;
  sentiment: string | null;
  created_at: string;
}

const MarketThoughts = () => {
  const [thoughts, setThoughts] = useState<MarketThought[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<MarketThought>>({});

  const fetchThoughts = async () => {
    const { data } = await supabase.from("market_thoughts").select("*").order("created_at", { ascending: false });
    setThoughts(data || []);
  };

  useEffect(() => { fetchThoughts(); }, []);

  const handleEdit = (thought: MarketThought) => {
    setEditingId(thought.id);
    setEditData(thought);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase.from("market_thoughts").update({ title: editData.title, content: editData.content, sentiment: editData.sentiment }).eq("id", editingId);
    setEditingId(null);
    fetchThoughts();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this market thought?")) return;
    await supabase.from("market_thoughts").delete().eq("id", id);
    fetchThoughts();
  };

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
                {editingId === thought.id ? (
                  <div className="space-y-2">
                    <Input value={editData.title || ""} onChange={(e) => setEditData({ ...editData, title: e.target.value })} placeholder="Title" />
                    <Input value={editData.sentiment || ""} onChange={(e) => setEditData({ ...editData, sentiment: e.target.value })} placeholder="Sentiment" />
                    <Textarea value={editData.content || ""} onChange={(e) => setEditData({ ...editData, content: e.target.value })} rows={3} placeholder="Content" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{thought.title || "Market Thought"}</span>
                      <span className="text-sm text-muted-foreground">{new Date(thought.created_at).toLocaleDateString()}</span>
                    </div>
                    {thought.sentiment && <span className="text-sm text-primary">{thought.sentiment}</span>}
                    <p className="mt-2">{thought.content}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(thought)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(thought.id)}>Delete</Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MarketThoughts;

import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Idea>>({});

  const fetchIdeas = async () => {
    const { data } = await supabase.from("ideas").select("*").order("created_at", { ascending: false });
    setIdeas(data || []);
  };

  useEffect(() => { fetchIdeas(); }, []);

  const handleEdit = (idea: Idea) => {
    setEditingId(idea.id);
    setEditData(idea);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase.from("ideas").update({ title: editData.title, content: editData.content, symbol: editData.symbol }).eq("id", editingId);
    setEditingId(null);
    fetchIdeas();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this idea?")) return;
    await supabase.from("ideas").delete().eq("id", id);
    fetchIdeas();
  };

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
                {editingId === idea.id ? (
                  <div className="space-y-2">
                    <Input value={editData.title || ""} onChange={(e) => setEditData({ ...editData, title: e.target.value })} placeholder="Title" />
                    <Input value={editData.symbol || ""} onChange={(e) => setEditData({ ...editData, symbol: e.target.value })} placeholder="Symbol" />
                    <Textarea value={editData.content || ""} onChange={(e) => setEditData({ ...editData, content: e.target.value })} rows={3} placeholder="Content" />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{idea.title}</span>
                      <span className="text-sm text-muted-foreground">{new Date(idea.created_at).toLocaleDateString()}</span>
                    </div>
                    {idea.symbol && <span className="text-sm text-primary">{idea.symbol}</span>}
                    {idea.content && <p className="mt-2">{idea.content}</p>}
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(idea)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(idea.id)}>Delete</Button>
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

export default Ideas;

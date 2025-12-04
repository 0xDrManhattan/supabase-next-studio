import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

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
  const [editForm, setEditForm] = useState<Partial<Idea>>({});

  const fetchIdeas = async () => {
    const { data } = await supabase.from("ideas").select("*").order("created_at", { ascending: false });
    setIdeas(data || []);
  };

  useEffect(() => {
    fetchIdeas();
  }, []);

  const handleEdit = (idea: Idea) => {
    setEditingId(idea.id);
    setEditForm({
      title: idea.title,
      symbol: idea.symbol,
      content: idea.content,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase
      .from("ideas")
      .update({
        title: editForm.title,
        content: editForm.content,
        symbol: editForm.symbol,
      })
      .eq("id", editingId);

    setEditingId(null);
    setEditForm({});
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
        <h1 className="text-2xl font-bold mb-6">Trade Ideas</h1>
        {ideas.length === 0 ? (
          <p className="text-muted-foreground">No ideas yet. Go to Journal to capture one.</p>
        ) : (
          <div className="space-y-4">
            {ideas.map((idea) => (
              <div key={idea.id} className="border rounded-lg bg-card p-4 shadow-sm">
                {editingId === idea.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Title</label>
                      <Input
                        value={editForm.title || ""}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder="Short descriptive title"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Symbol</label>
                      <Input
                        value={editForm.symbol || ""}
                        onChange={(e) => setEditForm({ ...editForm, symbol: e.target.value })}
                        placeholder="Symbol (optional)"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Analysis</label>
                      <Textarea
                        value={editForm.content || ""}
                        onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                        rows={6}
                        placeholder="Detailed analysis..."
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button size="sm" onClick={handleSaveEdit}>
                        Save Changes
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleCancel}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-lg">{idea.title}</h3>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(idea.created_at), "MMM d, yyyy")}
                          {idea.symbol && <span className="ml-2 text-primary font-medium">#{idea.symbol}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-sm text-foreground/90 whitespace-pre-wrap mb-4">{idea.content}</div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(idea)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(idea.id)}
                      >
                        Delete
                      </Button>
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

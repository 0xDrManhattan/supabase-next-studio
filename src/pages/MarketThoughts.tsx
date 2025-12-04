import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

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
  const [editForm, setEditForm] = useState<Partial<MarketThought>>({});

  const fetchThoughts = async () => {
    const { data } = await supabase.from("market_thoughts").select("*").order("created_at", { ascending: false });
    setThoughts(data || []);
  };

  useEffect(() => {
    fetchThoughts();
  }, []);

  const handleEdit = (thought: MarketThought) => {
    setEditingId(thought.id);
    setEditForm({
      title: thought.title,
      content: thought.content,
      sentiment: thought.sentiment,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase
      .from("market_thoughts")
      .update({
        title: editForm.title,
        content: editForm.content,
        sentiment: editForm.sentiment,
      })
      .eq("id", editingId);

    setEditingId(null);
    setEditForm({});
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
          <div className="space-y-4">
            {thoughts.map((thought) => (
              <div key={thought.id} className="border rounded-lg bg-card p-4 shadow-sm">
                {editingId === thought.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Title</label>
                      <Input
                        value={editForm.title || ""}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder="Market theme (e.g., 'CPI Reaction')"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Sentiment</label>
                      <Select
                        value={editForm.sentiment || "neutral"}
                        onValueChange={(val) => setEditForm({ ...editForm, sentiment: val })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select sentiment" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bullish">Bullish</SelectItem>
                          <SelectItem value="bearish">Bearish</SelectItem>
                          <SelectItem value="neutral">Neutral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Content</label>
                      <Textarea
                        value={editForm.content || ""}
                        onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                        rows={6}
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
                        <h3 className="font-semibold text-lg">{thought.title || "Untitled"}</h3>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(thought.created_at), "MMM d, yyyy")}
                        </p>
                      </div>
                      {thought.sentiment && (
                        <span
                          className={`text-xs px-2 py-1 rounded-full border ${
                            thought.sentiment === "bullish"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : thought.sentiment === "bearish"
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-gray-50 text-gray-700 border-gray-200"
                          }`}
                        >
                          {thought.sentiment.charAt(0).toUpperCase() + thought.sentiment.slice(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap mb-4">{thought.content}</p>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(thought)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(thought.id)}
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

export default MarketThoughts;

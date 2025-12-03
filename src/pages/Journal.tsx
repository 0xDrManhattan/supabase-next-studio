import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DiaryEntry {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
}

const Journal = () => {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => { fetchEntries(); }, []);

  const fetchEntries = async () => {
    const { data } = await supabase.from("diary").select("*").order("created_at", { ascending: false });
    setEntries(data || []);
  };

  const handleSend = async () => {
    if (!message.trim() || !session) return;
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyseMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      const tables = result.results?.map((r: any) => r.table) || [];
      toast({ title: "Saved!", description: `Added ${result.results?.length || 0} entries` });
      setMessage("");

      if (tables.includes("trades")) navigate("/trades");
      else if (tables.includes("ideas")) navigate("/ideas");
      else if (tables.includes("market_thoughts")) navigate("/market-thoughts");
      else fetchEntries();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setEditTitle(entry.title || "");
    setEditContent(entry.content);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase.from("diary").update({ title: editTitle, content: editContent }).eq("id", editingId);
    setEditingId(null);
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this entry?")) return;
    await supabase.from("diary").delete().eq("id", id);
    fetchEntries();
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Journal</h1>
        <div className="space-y-4 mb-8">
          <Textarea placeholder="Write about trades, ideas, market thoughts, or reflections..." value={message} onChange={(e) => setMessage(e.target.value)} rows={4} />
          <Button onClick={handleSend} disabled={loading || !message.trim()}>{loading ? "Saving..." : "Send"}</Button>
        </div>

        <h2 className="text-lg font-semibold mb-4">Diary Entries</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="border rounded-md p-4">
                {editingId === entry.id ? (
                  <div className="space-y-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between mb-2">
                      <span className="font-medium">{entry.title || "Untitled"}</span>
                      <span className="text-sm text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</span>
                    </div>
                    <p>{entry.content}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(entry)}>Edit</Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(entry.id)}>Delete</Button>
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

export default Journal;

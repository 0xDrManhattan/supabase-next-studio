import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns"; // Added for consistent date formatting

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
  // Using a single object for form state consistency across pages
  const [editForm, setEditForm] = useState<Partial<DiaryEntry>>({});

  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    // Note: This fetches diary entries, which are now guaranteed to have titles and cleaned content
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
      else fetchEntries(); // Re-fetch only if it was a diary entry
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id);
    setEditForm({
      title: entry.title || "",
      content: entry.content,
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase
      .from("diary")
      .update({
        title: editForm.title,
        content: editForm.content,
      })
      .eq("id", editingId);

    setEditingId(null);
    setEditForm({});
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
          <Textarea
            placeholder="Write about trades, ideas, market thoughts, or reflections..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <Button onClick={handleSend} disabled={loading || !message.trim()}>
            {loading ? "Saving..." : "Send"}
          </Button>
        </div>

        <h2 className="text-lg font-semibold mb-4">Diary Entries</h2>
        {entries.length === 0 ? (
          <p className="text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => (
              <div key={entry.id} className="border rounded-lg bg-card p-4 shadow-sm">
                {editingId === entry.id ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Title</label>
                      <Input
                        value={editForm.title || ""}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        placeholder="Entry title (e.g. 'Emotional check-in')"
                      />
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
                        {/* Now displays the AI-generated title */}
                        <h3 className="font-semibold text-lg">{entry.title || "Untitled Entry"}</h3>
                        <p className="text-xs text-muted-foreground">
                          {/* Using date-fns for consistent formatting */}
                          {format(new Date(entry.created_at), "MMM d, yyyy • h:mm a")}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap mb-4">{entry.content}</p>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(entry)}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(entry.id)}
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

export default Journal;

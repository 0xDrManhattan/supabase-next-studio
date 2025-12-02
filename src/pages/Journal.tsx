import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchEntries();
  }, []);

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

      toast({ title: "Saved!", description: `Added to ${result.table}` });
      setMessage("");

      if (result.table === "trades") {
        navigate("/trades");
      } else {
        fetchEntries();
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Journal</h1>
        <div className="space-y-4 mb-8">
          <Textarea
            placeholder="Write about trades or thoughts... (e.g., 'Bought 1 ETH at 2000, TP 2500, SL 1900')"
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
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="border rounded-md p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{entry.title || "Untitled"}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p>{entry.content}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Journal;

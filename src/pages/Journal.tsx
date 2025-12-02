import { useState, useEffect } from "react";
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
  mood: string | null;
  date: string;
  created_at: string;
}

// TRY THESE URLS IF THE FIRST ONE 404s
// const FUNCTION_URL = "/functions/v1/analyseMessage";
// const FUNCTION_URL = "/functions/analyseMessage";
const FUNCTION_URL = "/api/functions/v1/analyseMessage";

const Journal = () => {
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);

  const { session } = useAuth();
  const { toast } = useToast();

  // fetch entries on mount
  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoadingEntries(true);

    const { data, error } = await supabase.from("diary").select("*").order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching entries:", error);
    } else {
      setEntries(data || []);
    }

    setLoadingEntries(false);
  };

  const handleSend = async () => {
    if (!message.trim() || !session) return;

    setLoading(true);

    try {
      const response = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ message }),
      });

      const text = await response.text();
      let result = null;

      if (text) {
        try {
          result = JSON.parse(text);
        } catch {
          console.warn("Non-JSON response:", text);
        }
      }

      if (!response.ok) {
        throw new Error((result && result.error) || text || `Request failed with ${response.status}`);
      }

      toast({
        title: "Entry saved",
        description: result ? `Saved as ${result.type} in ${result.table}` : "Entry saved.",
      });

      setMessage("");
      await fetchEntries();
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Journal</h1>

        <div className="space-y-4 mb-8">
          <Textarea
            placeholder="Write about trades, ideas, market thoughts..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <Button onClick={handleSend} disabled={loading || !message.trim()}>
            {loading ? "Analyzing..." : "Send"}
          </Button>
        </div>

        <h2 className="text-lg font-semibold text-foreground">Past Entries</h2>

        {loadingEntries ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">No entries yet.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="border border-border rounded-md p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium text-foreground">{entry.title || "Untitled"}</span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>

                <p className="text-foreground">{entry.content}</p>

                {entry.mood && <span className="text-sm text-muted-foreground mt-2 block">Mood: {entry.mood}</span>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Journal;

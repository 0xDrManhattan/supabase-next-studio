import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";

interface DiaryEntry {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
}

const Notes = () => {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  useEffect(() => {
    const fetchEntries = async () => {
      const { data } = await supabase.from("diary").select("*").order("created_at", { ascending: false });
      setEntries(data || []);
    };
    fetchEntries();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Notes</h1>
        {entries.length === 0 ? (
          <p className="text-muted-foreground">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div key={entry.id} className="border rounded-md p-4">
                <div className="flex justify-between mb-2">
                  <span className="font-medium">{entry.title || "Untitled"}</span>
                  <span className="text-sm text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</span>
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

export default Notes;

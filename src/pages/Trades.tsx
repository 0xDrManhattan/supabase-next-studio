import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Trade {
  id: string;
  symbol: string;
  entry_price: number | null;
  exit_price: number | null;
  quantity: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  notes: string | null;
  created_at: string;
}

const Trades = () => {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    const fetchTrades = async () => {
      const { data } = await supabase.from("trades").select("*").order("created_at", { ascending: false });
      setTrades(data || []);
    };
    fetchTrades();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Trades</h1>
        {trades.length === 0 ? (
          <p className="text-muted-foreground">No trades yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Symbol</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>SL</TableHead>
                <TableHead>TP</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-medium">{trade.symbol}</TableCell>
                  <TableCell>{trade.entry_price ?? "-"}</TableCell>
                  <TableCell>{trade.exit_price ?? "-"}</TableCell>
                  <TableCell>{trade.quantity ?? "-"}</TableCell>
                  <TableCell>{trade.stop_loss ?? "-"}</TableCell>
                  <TableCell>{trade.take_profit ?? "-"}</TableCell>
                  <TableCell className="max-w-xs truncate">{trade.notes ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </main>
    </div>
  );
};

export default Trades;

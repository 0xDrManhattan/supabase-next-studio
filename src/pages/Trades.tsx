import { useState, useEffect } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Trade>>({});

  const fetchTrades = async () => {
    const { data } = await supabase.from("trades").select("*").order("created_at", { ascending: false });
    setTrades(data || []);
  };

  useEffect(() => { fetchTrades(); }, []);

  const handleEdit = (trade: Trade) => {
    setEditingId(trade.id);
    setEditData(trade);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await supabase.from("trades").update({
      symbol: editData.symbol, entry_price: editData.entry_price, exit_price: editData.exit_price,
      quantity: editData.quantity, stop_loss: editData.stop_loss, take_profit: editData.take_profit, notes: editData.notes
    }).eq("id", editingId);
    setEditingId(null);
    fetchTrades();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    await supabase.from("trades").delete().eq("id", id);
    fetchTrades();
  };

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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
                <TableRow key={trade.id}>
                  {editingId === trade.id ? (
                    <>
                      <TableCell><Input value={editData.symbol || ""} onChange={(e) => setEditData({ ...editData, symbol: e.target.value })} /></TableCell>
                      <TableCell><Input type="number" value={editData.entry_price ?? ""} onChange={(e) => setEditData({ ...editData, entry_price: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input type="number" value={editData.exit_price ?? ""} onChange={(e) => setEditData({ ...editData, exit_price: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input type="number" value={editData.quantity ?? ""} onChange={(e) => setEditData({ ...editData, quantity: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input type="number" value={editData.stop_loss ?? ""} onChange={(e) => setEditData({ ...editData, stop_loss: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input type="number" value={editData.take_profit ?? ""} onChange={(e) => setEditData({ ...editData, take_profit: e.target.value ? Number(e.target.value) : null })} /></TableCell>
                      <TableCell><Input value={editData.notes || ""} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" onClick={handleSaveEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell>{trade.entry_price ?? "-"}</TableCell>
                      <TableCell>{trade.exit_price ?? "-"}</TableCell>
                      <TableCell>{trade.quantity ?? "-"}</TableCell>
                      <TableCell>{trade.stop_loss ?? "-"}</TableCell>
                      <TableCell>{trade.take_profit ?? "-"}</TableCell>
                      <TableCell className="max-w-xs truncate">{trade.notes ?? "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleEdit(trade)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleDelete(trade.id)}>Delete</Button>
                        </div>
                      </TableCell>
                    </>
                  )}
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

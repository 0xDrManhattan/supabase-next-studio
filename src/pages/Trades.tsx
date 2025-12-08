import { useState, useEffect, useMemo } from "react";
import Navigation from "@/components/Navigation";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Trade {
  id: string;
  trade_number: number;
  symbol: string;
  trade_type: string | null;
  entry_price: number | null;
  exit_price: number | null;
  quantity: number | null;
  position_size: number | null;
  notional_value: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  fees: number | null;
  pnl: number | null;
  pnl_percent: number | null;
  notes: string | null;
  notes_on_enter: string | null;
  notes_on_exit: string | null;
  mark_on_enter: string | null;
  mark_on_exit: string | null;
  entry_date: string | null;
  exit_date: string | null;
  created_at: string;
}

// Helper: get current local datetime in datetime-local format
function nowLocal(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

// Helper: normalize datetime string for datetime-local input
function toLocalDatetimeString(dateInput: string | null | undefined): string {
  if (!dateInput) return "";

  // If user only typed date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return `${dateInput}T00:00`;
  }

  // If user typed incomplete datetime (YYYY-MM-DDTHH)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(dateInput)) {
    return `${dateInput}:00`;
  }

  // If it's an ISO string, convert to local format
  if (dateInput.includes("Z") || dateInput.includes("+")) {
    const d = new Date(dateInput);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  return dateInput.slice(0, 16);
}

// Helper: prepare datetime for saving to Supabase
function prepareDateForSave(dateInput: string | null | undefined): string | null {
  if (!dateInput || dateInput === "") return null;
  
  const normalized = toLocalDatetimeString(dateInput);
  if (!normalized) return null;
  
  try {
    return new Date(normalized).toISOString();
  } catch {
    return null;
  }
}

const Trades = () => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [editData, setEditData] = useState<Partial<Trade>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filters
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [notionalFilter, setNotionalFilter] = useState<"all" | "<1k" | "1k-10k" | "10k-50k" | "50k+">("all");

  const fetchTrades = async () => {
    const { data } = await supabase.from("trades").select("*").order("created_at", { ascending: false });
    setTrades(data || []);
  };

  useEffect(() => { fetchTrades(); }, []);

  // Computed notional value
  const getNotional = (trade: Partial<Trade>) => {
    if (trade.entry_price && trade.position_size) return trade.entry_price * trade.position_size;
    return null;
  };

  // Auto-computed PnL
  const computePnl = (t: Partial<Trade>) => {
    const { entry_price, exit_price, position_size, trade_type } = t;

    if (
      entry_price == null ||
      exit_price == null ||
      position_size == null ||
      !trade_type
    ) {
      return { pnl: null, pnl_percent: null };
    }

    const notional = entry_price * position_size;
    const dir = trade_type.toLowerCase();

    let gross: number;
    if (dir === "long") {
      gross = (exit_price - entry_price) * position_size;
    } else if (dir === "short") {
      gross = (entry_price - exit_price) * position_size;
    } else {
      return { pnl: null, pnl_percent: null };
    }

    const fees = notional * 0.001; // fixed 0.1% for MVP
    const pnl = gross - fees;
    const pnl_percent = notional ? (pnl / notional) * 100 : null;

    return { pnl, pnl_percent };
  };

  // Get live PnL (from DB or computed)
  const getLivePnl = (trade: Trade) => {
    return trade.pnl ?? computePnl(trade).pnl;
  };

  // Status badge (uses live pnl)
  const getStatus = (trade: Trade): "open" | "win" | "loss" => {
    if (trade.exit_price === null) return "open";
    const pnl = getLivePnl(trade);
    if (pnl !== null && pnl > 0) return "win";
    if (pnl !== null && pnl < 0) return "loss";
    return "open";
  };

  const StatusBadge = ({ trade }: { trade: Trade }) => {
    const status = getStatus(trade);
    if (status === "win") {
      return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-100">WIN</Badge>;
    }
    if (status === "loss") {
      return <Badge className="bg-red-100 text-red-700 border-red-300 hover:bg-red-100">LOSS</Badge>;
    }
    return <Badge className="bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-100">OPEN</Badge>;
  };

  // Direction styling
  const DirectionText = ({ direction }: { direction: string | null }) => {
    if (!direction) return <span className="text-muted-foreground">-</span>;
    const upper = direction.toUpperCase();
    if (upper === "LONG") return <span className="font-medium text-emerald-600">LONG</span>;
    if (upper === "SHORT") return <span className="font-medium text-red-500">SHORT</span>;
    return <span>{direction}</span>;
  };

  // Notes preview with tooltip
  const NotesPreview = ({ notes }: { notes: string | null }) => {
    if (!notes) return <span className="text-muted-foreground">-</span>;
    const preview = notes.length > 80 ? notes.slice(0, 80) + "…" : notes;
    if (notes.length <= 80) return <span className="text-sm">{notes}</span>;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm cursor-help">{preview}</span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm whitespace-pre-wrap">{notes}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Format short date
  const formatShortDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";

  // Filtered trades
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      // Date filter
      if (dateFrom) {
        const tradeDate = trade.entry_date || trade.created_at;
        if (new Date(tradeDate) < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const tradeDate = trade.entry_date || trade.created_at;
        if (new Date(tradeDate) > new Date(dateTo + "T23:59:59")) return false;
      }

      // Status filter
      const status = getStatus(trade);
      if (statusFilter === "open" && status !== "open") return false;
      if (statusFilter === "closed" && status === "open") return false;

      // Notional filter
      const notional = getNotional(trade);
      if (notionalFilter !== "all" && notional !== null) {
        if (notionalFilter === "<1k" && notional >= 1000) return false;
        if (notionalFilter === "1k-10k" && (notional < 1000 || notional >= 10000)) return false;
        if (notionalFilter === "10k-50k" && (notional < 10000 || notional >= 50000)) return false;
        if (notionalFilter === "50k+" && notional < 50000) return false;
      }

      return true;
    });
  }, [trades, dateFrom, dateTo, statusFilter, notionalFilter]);

  const openModal = (trade: Trade) => {
    setSelectedTrade(trade);
    // Auto-fill entry_date if null
    const entryDate = trade.entry_date || nowLocal();
    setEditData({ ...trade, entry_date: entryDate });
    setIsModalOpen(true);
  };

  // Handle exit_price change - auto-set exit_date if transitioning from null/empty
  const handleExitPriceChange = (value: string) => {
    const newExitPrice = value ? Number(value) : null;
    const wasEmpty = editData.exit_price == null;
    const isNowFilled = newExitPrice != null;
    
    const updates: Partial<Trade> = { exit_price: newExitPrice };
    
    // Auto-assign exit_date when user enters an exit price for the first time
    if (wasEmpty && isNowFilled && !editData.exit_date) {
      updates.exit_date = nowLocal();
    }
    
    setEditData({ ...editData, ...updates });
  };

  const handleSave = async () => {
    if (!selectedTrade) return;

    // Auto-compute PnL before saving
    const { pnl, pnl_percent } = computePnl(editData);

    // Prepare dates for saving
    const entry_date = prepareDateForSave(editData.entry_date);
    const exit_date = prepareDateForSave(editData.exit_date);

    await supabase.from("trades").update({
      symbol: editData.symbol,
      trade_type: editData.trade_type,
      entry_price: editData.entry_price,
      exit_price: editData.exit_price,
      position_size: editData.position_size,
      quantity: editData.position_size,
      stop_loss: editData.stop_loss,
      take_profit: editData.take_profit,
      pnl,
      pnl_percent,
      notes: editData.notes,
      notes_on_enter: editData.notes_on_enter,
      notes_on_exit: editData.notes_on_exit,
      mark_on_enter: editData.mark_on_enter,
      mark_on_exit: editData.mark_on_exit,
      entry_date,
      exit_date,
    }).eq("id", selectedTrade.id);
    setIsModalOpen(false);
    fetchTrades();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this trade?")) return;
    await supabase.from("trades").delete().eq("id", id);
    fetchTrades();
  };

  const formatCurrency = (val: number | null) => {
    if (val === null) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
  };

  // Computed values for modal display
  const modalPnl = computePnl(editData);
  const modalNotional = getNotional(editData);
  const modalFees = modalNotional ? modalNotional * 0.001 : null;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Trades</h1>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={(v: "all" | "open" | "closed") => setStatusFilter(v)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">Notional</Label>
            <Select value={notionalFilter} onValueChange={(v: "all" | "<1k" | "1k-10k" | "10k-50k" | "50k+") => setNotionalFilter(v)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="<1k">&lt; $1,000</SelectItem>
                <SelectItem value="1k-10k">$1k – $10k</SelectItem>
                <SelectItem value="10k-50k">$10k – $50k</SelectItem>
                <SelectItem value="50k+">$50k+</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setStatusFilter("all");
                setNotionalFilter("all");
              }}
            >
              Clear
            </Button>
          </div>
        </div>

        {filteredTrades.length === 0 ? (
          <p className="text-muted-foreground">No trades found.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Entry Date</TableHead>
                  <TableHead>Exit Date</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Notional</TableHead>
                  <TableHead>PnL</TableHead>
                  <TableHead className="max-w-[200px]">Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTrades.map((trade) => {
                  const livePnl = getLivePnl(trade);
                  return (
                    <TableRow key={trade.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openModal(trade)}>
                      <TableCell className="font-mono text-muted-foreground">{trade.trade_number}</TableCell>
                      <TableCell className="font-medium">{trade.symbol || "-"}</TableCell>
                      <TableCell><DirectionText direction={trade.trade_type} /></TableCell>
                      <TableCell className="text-sm">{formatShortDate(trade.entry_date)}</TableCell>
                      <TableCell className="text-sm">{formatShortDate(trade.exit_date)}</TableCell>
                      <TableCell>{formatCurrency(trade.entry_price)}</TableCell>
                      <TableCell>{formatCurrency(trade.exit_price)}</TableCell>
                      <TableCell>{trade.position_size ?? "-"}</TableCell>
                      <TableCell>{formatCurrency(getNotional(trade))}</TableCell>
                      <TableCell className={
                        livePnl !== null && livePnl > 0 ? "text-emerald-600" :
                        livePnl !== null && livePnl < 0 ? "text-red-600" : ""
                      }>
                        {formatCurrency(livePnl)}
                      </TableCell>
                      <TableCell className="max-w-[200px]"><NotesPreview notes={trade.notes} /></TableCell>
                      <TableCell><StatusBadge trade={trade} /></TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => openModal(trade)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(trade.id)}>Delete</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Trade Detail Modal */}
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                Trade #{editData.trade_number} - {editData.symbol || "Unknown"}
                {selectedTrade && <StatusBadge trade={selectedTrade} />}
              </DialogTitle>
              <DialogDescription>Edit trade details below</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4 py-4">
              {/* Entry Date */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Entry Date</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDatetimeString(editData.entry_date)}
                  onChange={(e) => setEditData({ ...editData, entry_date: e.target.value || null })}
                />
              </div>

              {/* Exit Date */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Exit Date</Label>
                <Input
                  type="datetime-local"
                  value={toLocalDatetimeString(editData.exit_date)}
                  onChange={(e) => setEditData({ ...editData, exit_date: e.target.value || null })}
                />
              </div>

              {/* Symbol */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Symbol</Label>
                <Input
                  value={editData.symbol || ""}
                  onChange={(e) => setEditData({ ...editData, symbol: e.target.value })}
                />
              </div>

              {/* Direction */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Direction</Label>
                <Select value={editData.trade_type || ""} onValueChange={(v) => setEditData({ ...editData, trade_type: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Entry Price */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Entry Price</Label>
                <Input
                  type="number"
                  step="any"
                  value={editData.entry_price ?? ""}
                  onChange={(e) => setEditData({ ...editData, entry_price: e.target.value ? Number(e.target.value) : null })}
                />
              </div>

              {/* Position Size */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Position Size</Label>
                <Input
                  type="number"
                  step="any"
                  value={editData.position_size ?? ""}
                  onChange={(e) => setEditData({ ...editData, position_size: e.target.value ? Number(e.target.value) : null })}
                />
              </div>

              {/* Notional Value (readonly) */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm text-muted-foreground">Notional Value</Label>
                <Input
                  readOnly
                  className="bg-muted"
                  value={formatCurrency(modalNotional)}
                />
              </div>

              {/* Stop Loss */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Stop Loss</Label>
                <Input
                  type="number"
                  step="any"
                  value={editData.stop_loss ?? ""}
                  onChange={(e) => setEditData({ ...editData, stop_loss: e.target.value ? Number(e.target.value) : null })}
                />
              </div>

              {/* Take Profit */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Take Profit</Label>
                <Input
                  type="number"
                  step="any"
                  value={editData.take_profit ?? ""}
                  onChange={(e) => setEditData({ ...editData, take_profit: e.target.value ? Number(e.target.value) : null })}
                />
              </div>

              {/* Exit Price */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Exit Price</Label>
                <Input
                  type="number"
                  step="any"
                  value={editData.exit_price ?? ""}
                  onChange={(e) => handleExitPriceChange(e.target.value)}
                />
              </div>

              {/* Fees (readonly, computed) */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm text-muted-foreground">Fees (0.1%)</Label>
                <Input
                  readOnly
                  className="bg-muted"
                  value={formatCurrency(modalFees)}
                />
              </div>

              {/* PnL (readonly, computed) */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm text-muted-foreground">PnL (auto)</Label>
                <Input
                  readOnly
                  className={`bg-muted ${
                    modalPnl.pnl !== null && modalPnl.pnl > 0 ? "text-emerald-600" :
                    modalPnl.pnl !== null && modalPnl.pnl < 0 ? "text-red-600" : ""
                  }`}
                  value={formatCurrency(modalPnl.pnl)}
                />
              </div>

              {/* PnL % (readonly, computed) */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm text-muted-foreground">PnL % (auto)</Label>
                <Input
                  readOnly
                  className={`bg-muted ${
                    modalPnl.pnl_percent !== null && modalPnl.pnl_percent > 0 ? "text-emerald-600" :
                    modalPnl.pnl_percent !== null && modalPnl.pnl_percent < 0 ? "text-red-600" : ""
                  }`}
                  value={modalPnl.pnl_percent !== null ? `${modalPnl.pnl_percent.toFixed(2)}%` : "-"}
                />
              </div>

              {/* Notes on Enter */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Notes on Enter</Label>
                <Input
                  value={editData.notes_on_enter || ""}
                  onChange={(e) => setEditData({ ...editData, notes_on_enter: e.target.value })}
                />
              </div>

              {/* Mark on Enter */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Mark on Enter</Label>
                <Input
                  value={editData.mark_on_enter || ""}
                  onChange={(e) => setEditData({ ...editData, mark_on_enter: e.target.value })}
                />
              </div>

              {/* Notes on Exit */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Notes on Exit</Label>
                <Input
                  value={editData.notes_on_exit || ""}
                  onChange={(e) => setEditData({ ...editData, notes_on_exit: e.target.value })}
                />
              </div>

              {/* Mark on Exit */}
              <div className="flex flex-col gap-1">
                <Label className="text-sm">Mark on Exit</Label>
                <Input
                  value={editData.mark_on_exit || ""}
                  onChange={(e) => setEditData({ ...editData, mark_on_exit: e.target.value })}
                />
              </div>

              {/* Full Notes */}
              <div className="col-span-2 flex flex-col gap-1">
                <Label className="text-sm">Full Notes</Label>
                <Textarea
                  rows={4}
                  value={editData.notes || ""}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                />
              </div>

              {/* Screenshot Upload */}
              <div className="col-span-2 flex flex-col gap-1">
                <Label className="text-sm">Screenshot</Label>
                <Input type="file" accept="image/*" />
                <p className="text-xs text-muted-foreground">Upload a screenshot of your trade (coming soon)</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default Trades;

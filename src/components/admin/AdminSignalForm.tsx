import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowDownRight, ArrowUpRight, Loader2, Send, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminSignalFormAnalysis } from "./AdminSignalFormAnalysis";

export type AdminSignalDirection = "BUY" | "SELL";
export type SignalType = "signal" | "upcoming";
export type UpcomingStatus = "waiting" | "near_entry" | "preparing";

export interface AdminSignalFormData {
  pair: string;
  category: string;
  direction: AdminSignalDirection;
  entry: string;
  stopLoss: string;
  takeProfit: string;
  signalType: SignalType;
  upcomingStatus: UpcomingStatus;
  notes: string;
  // Analysis content fields
  analysisVideoUrl: string;
  analysisNotes: string;
  analysisImageUrl: string;
  // Telegram option
  sendToTelegram: boolean;
  sendUpdatesToTelegram: boolean;
  sendClosedTradesToTelegram: boolean;
}

interface AdminSignalFormProps {
  categories: string[];
  formData: AdminSignalFormData;
  setFormData: React.Dispatch<React.SetStateAction<AdminSignalFormData>>;
  isSubmitting: boolean;
  onSubmit: () => void;
  submitLabel: string;
  showTelegramOption?: boolean;
}

export const AdminSignalForm = React.memo(
  React.forwardRef<HTMLDivElement, AdminSignalFormProps>(
    function AdminSignalForm(
      {
        categories,
        formData,
        setFormData,
        isSubmitting,
        onSubmit,
        submitLabel,
        showTelegramOption = false,
      }: AdminSignalFormProps,
      ref
    ) {
  const isUpcoming = formData.signalType === "upcoming";

  return (
    <div className="space-y-4">
      {/* Signal Type Toggle */}
      {/* Signal Type Toggle */}
      <div className="space-y-2">
        <Label>Signal Type</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={formData.signalType === "signal" ? "default" : "outline"}
            className={cn(formData.signalType === "signal" && "bg-primary hover:bg-primary/90")}
            onClick={() => setFormData((prev) => ({ ...prev, signalType: "signal" }))}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Active Signal
          </Button>
          <Button
            type="button"
            variant={formData.signalType === "upcoming" ? "default" : "outline"}
            className={cn(formData.signalType === "upcoming" && "bg-warning hover:bg-warning/90 text-white")}
            onClick={() => setFormData((prev) => ({ ...prev, signalType: "upcoming" }))}
          >
            <Clock className="w-4 h-4 mr-2" />
            Upcoming Trade
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Pair</Label>
          <Input
            placeholder="e.g., XAUUSD"
            value={formData.pair}
            onChange={(e) => setFormData((prev) => ({ ...prev, pair: e.target.value }))}
            className="bg-secondary/50"
          />
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={formData.category} onValueChange={(v) => setFormData((prev) => ({ ...prev, category: v }))}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Direction</Label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={formData.direction === "BUY" ? "default" : "outline"}
            className={cn(formData.direction === "BUY" && "bg-success hover:bg-success/90")}
            onClick={() => setFormData((prev) => ({ ...prev, direction: "BUY" }))}
          >
            <ArrowUpRight className="w-4 h-4 mr-2" />
            BUY
          </Button>
          <Button
            type="button"
            variant={formData.direction === "SELL" ? "default" : "outline"}
            className={cn(formData.direction === "SELL" && "bg-destructive hover:bg-destructive/90")}
            onClick={() => setFormData((prev) => ({ ...prev, direction: "SELL" }))}
          >
            <ArrowDownRight className="w-4 h-4 mr-2" />
            SELL
          </Button>
        </div>
      </div>

      {/* Upcoming Status - Only for upcoming trades */}
      {isUpcoming && (
        <div className="space-y-2">
          <Label>Status</Label>
          <Select 
            value={formData.upcomingStatus} 
            onValueChange={(v) => setFormData((prev) => ({ ...prev, upcomingStatus: v as UpcomingStatus }))}
          >
            <SelectTrigger className="bg-secondary/50">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="waiting">Waiting</SelectItem>
              <SelectItem value="preparing">Preparing</SelectItem>
              <SelectItem value="near_entry">Near Entry</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-sm font-medium">Price Setup</Label>
          {isUpcoming && (
            <p className="text-xs text-muted-foreground">All fields optional for upcoming trade</p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="block text-xs uppercase tracking-wide text-muted-foreground">Entry Price</Label>
          <Input
            type="number"
            step="any"
            placeholder="0.00"
            value={formData.entry}
            onChange={(e) => setFormData((prev) => ({ ...prev, entry: e.target.value }))}
            className="bg-secondary/50"
          />
        </div>

        <div className="space-y-2">
          <Label className="block text-xs uppercase tracking-wide text-muted-foreground">Stop Loss</Label>
          <Input
            type="number"
            step="any"
            placeholder="0.00"
            value={formData.stopLoss}
            onChange={(e) => setFormData((prev) => ({ ...prev, stopLoss: e.target.value }))}
            className="bg-secondary/50"
          />
        </div>

        <div className="space-y-2">
          <Label className="block text-xs uppercase tracking-wide text-muted-foreground">Take Profit</Label>
          <Input
            type="number"
            step="any"
            placeholder="0.00"
            value={formData.takeProfit}
            onChange={(e) => setFormData((prev) => ({ ...prev, takeProfit: e.target.value }))}
            className="bg-secondary/50"
          />
        </div>
      </div>
      </div>

      {/* Analysis Content Section */}
      <AdminSignalFormAnalysis
        formData={{
          analysisVideoUrl: formData.analysisVideoUrl,
          analysisNotes: formData.analysisNotes,
          analysisImageUrl: formData.analysisImageUrl,
        }}
        setFormData={setFormData}
      />

      {/* Telegram Option */}
      {showTelegramOption && (
        <div className="space-y-3 p-4 rounded-lg bg-secondary/30 border border-border/50">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="send-telegram"
              checked={formData.sendToTelegram}
              onCheckedChange={(checked) => 
                setFormData((prev) => ({ ...prev, sendToTelegram: checked === true }))
              }
            />
            <div className="flex-1">
              <Label htmlFor="send-telegram" className="text-sm font-medium cursor-pointer">
                Send Signal to Telegram
              </Label>
              <p className="text-xs text-muted-foreground">
                Send this signal to your configured Telegram group
              </p>
            </div>
            <Send className="w-4 h-4 text-muted-foreground" />
          </div>

          <div className="flex items-center space-x-3">
            <Checkbox
              id="send-updates-telegram"
              checked={formData.sendUpdatesToTelegram}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, sendUpdatesToTelegram: checked === true }))
              }
            />
            <div className="flex-1">
              <Label htmlFor="send-updates-telegram" className="text-sm font-medium cursor-pointer">
                Send Updates to Telegram
              </Label>
              <p className="text-xs text-muted-foreground">
                Send TP update events for this signal to matching Telegram categories
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Checkbox
              id="send-closed-telegram"
              checked={formData.sendClosedTradesToTelegram}
              onCheckedChange={(checked) =>
                setFormData((prev) => ({ ...prev, sendClosedTradesToTelegram: checked === true }))
              }
            />
            <div className="flex-1">
              <Label htmlFor="send-closed-telegram" className="text-sm font-medium cursor-pointer">
                Send Closed Trades to Telegram
              </Label>
              <p className="text-xs text-muted-foreground">
                Send TP/SL/Breakeven close events for this signal to matching Telegram categories
              </p>
            </div>
          </div>
        </div>
      )}

      <DialogFooter>
        <Button onClick={onSubmit} className="w-full" variant="gradient" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );
    }
  )
);

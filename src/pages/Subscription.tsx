import { useState } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ArrowRight, Shield, Zap, Bell, TrendingUp, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePayments } from "@/hooks/usePayments";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const features = [
  "Real-time trading signals",
  "Push notifications (Web, Android, iOS)",
  "Forex, Metals, Crypto, Indices",
  "Entry, Stop Loss & Take Profit levels",
  "Account growth tracking",
  "Fixed risk management (1-3%)",
  "24/7 signal coverage",
  "Trade history & analytics"
];

const Subscription = () => {
  const { user } = useAuth();
  const { settings } = useGlobalSettings();
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { payments, isLoading, submitPayment } = usePayments({
    userId: user?.id,
    limit: 10,
  });

  const walletAddress = settings?.wallet_address || "TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE";
  const subscriptionPrice = settings?.subscription_price || 50;

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!txHash.trim() || !user) return;
    
    setIsSubmitting(true);
    try {
      await submitPayment(user.id, txHash.trim(), subscriptionPrice);
      toast.success("Payment submitted! Admin will verify within 24 hours.");
      setTxHash("");
    } catch (err) {
      console.error('Error submitting payment:', err);
      toast.error("Failed to submit payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DashboardLayout title="Subscription">
      <div className="max-w-5xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Premium Trading Signals
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            Unlock Professional
            <span className="gradient-text"> Trading Signals</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get real-time alerts with precise entry points, stop loss, and take
            profit levels for Forex, Crypto, Metals & Indices.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Pricing Card */}
          <div className="glass-card p-8 relative overflow-hidden shadow-md">
            <div className="absolute top-0 right-0 px-4 py-2 bg-success text-success-foreground text-sm font-semibold rounded-bl-xl">
              BEST VALUE
            </div>

            <div className="mb-8">
              <p className="text-sm text-muted-foreground mb-2">Monthly Plan</p>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-bold">${subscriptionPrice}</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </div>

            <div className="space-y-4 mb-8">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="p-1 rounded-full bg-success/20">
                    <Check className="w-4 h-4 text-success" />
                  </div>
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-4 p-4 rounded-xl bg-secondary/50 mb-6">
              <div className="text-center">
                <TrendingUp className="w-6 h-6 text-success mx-auto mb-2" />
                <p className="text-sm font-semibold">75%</p>
                <p className="text-xs text-muted-foreground">Win Rate</p>
              </div>
              <div className="text-center">
                <Bell className="w-6 h-6 text-primary mx-auto mb-2" />
                <p className="text-sm font-semibold">Instant</p>
                <p className="text-xs text-muted-foreground">Alerts</p>
              </div>
              <div className="text-center">
                <Clock className="w-6 h-6 text-warning mx-auto mb-2" />
                <p className="text-sm font-semibold">24/7</p>
                <p className="text-xs text-muted-foreground">Coverage</p>
              </div>
            </div>
          </div>

          {/* Payment Card */}
          <div className="glass-card p-8 shadow-md">
            <div className="flex items-center gap-3 mb-6">
              <Shield className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-semibold">Secure USDT Payment</h3>
            </div>

            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-secondary/50">
                <p className="text-sm text-muted-foreground mb-2">
                  Payment Amount
                </p>
                <p className="text-2xl font-bold">{subscriptionPrice} USDT</p>
                <p className="text-xs text-muted-foreground mt-1">
                  TRC20 Network Only
                </p>
              </div>

              <div>
                <Label className="text-sm text-muted-foreground">
                  Send USDT (TRC20) to this address:
                </Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={walletAddress}
                    readOnly
                    className="font-mono text-sm bg-secondary/50"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="txHash">Transaction Hash</Label>
                <Input
                  id="txHash"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="Enter your TRC20 transaction hash"
                  className="mt-2 bg-secondary/50"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  After sending payment, paste your transaction hash above for
                  verification.
                </p>
              </div>

              <Button
                size="lg"
                variant="default"
                className="w-full bg-primary hover:bg-primary/90"
                disabled={!txHash.trim() || isSubmitting}
                onClick={handleSubmit}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    Submit for Verification
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>

              <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                <p className="text-xs text-warning leading-relaxed">
                  ⚠️ Admin will verify your payment within 24 hours. Your
                  subscription will be activated automatically after
                  verification.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-6">Your Payment History</h2>
            <div className="glass-card overflow-hidden shadow-md">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-secondary/30">
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          TX Hash
                        </th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Amount
                        </th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Status
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Submitted
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-accent/30 transition-colors">
                          <td className="px-6 py-4">
                            <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                              {payment.tx_hash.slice(0, 12)}...{payment.tx_hash.slice(-8)}
                            </code>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-semibold">${payment.amount}</span>
                            <p className="text-xs text-muted-foreground">USDT</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <Badge
                              variant="outline"
                              className={cn(
                                payment.status === "pending" &&
                                  "border-warning/30 text-warning bg-warning/10",
                                payment.status === "verified" &&
                                  "border-success/30 text-success bg-success/10",
                                payment.status === "rejected" &&
                                  "border-destructive/30 text-destructive bg-destructive/10"
                              )}
                            >
                              {payment.status === "pending" && (
                                <Clock className="w-3 h-3 mr-1" />
                              )}
                              {payment.status === "verified" && (
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                              )}
                              {payment.status === "rejected" && (
                                <XCircle className="w-3 h-3 mr-1" />
                              )}
                              {payment.status}
                            </Badge>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm">
                              {formatDistanceToNow(new Date(payment.created_at), {
                                addSuffix: true,
                              })}
                            </p>
                            {payment.verified_at && (
                              <p className="text-xs text-muted-foreground">
                                Verified:{" "}
                                {formatDistanceToNow(new Date(payment.verified_at), {
                                  addSuffix: true,
                                })}
                              </p>
                            )}
                            {payment.rejection_reason && (
                              <p className="text-xs text-destructive mt-1">
                                Reason: {payment.rejection_reason}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Subscription;
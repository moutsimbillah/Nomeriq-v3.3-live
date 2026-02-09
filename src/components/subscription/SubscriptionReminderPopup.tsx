import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, ArrowRight, Shield, Zap, Bell, TrendingUp, Clock, Loader2, X } from "lucide-react";
import { usePayments } from "@/hooks/usePayments";
import { toast } from "sonner";

const features = ["Real-time trading signals", "Push notifications (Web, Android, iOS)", "Forex, Metals, Crypto, Indices", "Entry, Stop Loss & Take Profit levels", "Account growth tracking", "Fixed risk management (1-3%)", "24/7 signal coverage", "Trade history & analytics"];

export const SubscriptionReminderPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    hasActiveSubscription,
    user
  } = useAuth();
  const {
    settings
  } = useGlobalSettings();
  const navigate = useNavigate();
  const {
    payments,
    submitPayment,
    isLoading: isLoadingPayments
  } = usePayments({
    userId: user?.id,
    limit: 10
  });
  
  const walletAddress = settings?.wallet_address || "TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE";
  const subscriptionPrice = settings?.subscription_price || 50;

  // Check if user has a pending payment awaiting verification
  const hasPendingPayment = useMemo(() => {
    if (!payments || payments.length === 0) return false;
    return payments.some(p => p.status === 'pending');
  }, [payments]);

  // Determine if popup should be shown based on subscription and payment status
  const shouldShowPopup = useMemo(() => {
    // Don't show if not logged in
    if (!user) return false;
    // Don't show for users with active subscription
    if (hasActiveSubscription) return false;
    // Don't show while loading payments
    if (isLoadingPayments) return false;
    // Don't show if user has a pending payment awaiting verification
    if (hasPendingPayment) return false;
    // Show for: no subscription, expired subscription, or rejected payments
    return true;
  }, [hasActiveSubscription, user, isLoadingPayments, hasPendingPayment]);

  useEffect(() => {
    // Don't show popup if conditions aren't met
    if (!shouldShowPopup) return;

    // Show popup every 30 seconds
    const interval = setInterval(() => {
      setIsOpen(true);
    }, 30000);

    // Show initial popup after 3 seconds
    const initialTimeout = setTimeout(() => {
      setIsOpen(true);
    }, 3000);
    return () => {
      clearInterval(interval);
      clearTimeout(initialTimeout);
    };
  }, [shouldShowPopup]);

  // Don't render anything if popup shouldn't be shown
  if (!shouldShowPopup) return null;
  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    toast.success("Wallet address copied!");
    setTimeout(() => setCopied(false), 2000);
  };
  const handleSubmit = async () => {
    if (!txHash.trim() || !user) return;
    setIsSubmitting(true);
    try {
      await submitPayment(user.id, txHash.trim(), subscriptionPrice);
      toast.success("Payment submitted! Admin will verify within 24 hours.");
      setTxHash("");
      setIsOpen(false);
    } catch (err) {
      console.error('Error submitting payment:', err);
      toast.error("Failed to submit payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  return <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto border-border bg-background p-0">
        {/* Close button */}
        <button onClick={() => setIsOpen(false)} className="absolute right-4 top-4 z-10 h-8 w-8 flex items-center justify-center rounded-lg bg-secondary hover:bg-accent border border-border transition-colors">
          <X className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Close</span>
        </button>

        <div className="p-6 lg:p-8">
          {/* Free Plan Warning */}
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
            <p className="text-sm text-destructive font-medium leading-relaxed">
              You are currently using the free version of Nomeriq. You will not receive any trading signals on this plan. Subscribe to unlock premium features.
            </p>
          </div>

          {/* Hero Section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
              <Zap className="w-4 h-4" />
              Premium Trading Signals
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold mb-3">
              Unlock Professional
              <span className="gradient-text"> Trading Signals</span>
            </h1>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto">
              Get real-time alerts with precise entry points, stop loss, and take
              profit levels for Forex, Crypto, Metals & Indices.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Pricing Card */}
            <div className="glass-card p-6 relative overflow-hidden shadow-none">
              <div className="absolute top-0 right-0 px-3 py-1.5 bg-success text-success-foreground text-xs font-semibold rounded-bl-xl">
                BEST VALUE
              </div>

              <div className="mb-6">
                <p className="text-sm text-muted-foreground mb-1">Monthly Plan</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">${subscriptionPrice}</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>

              <div className="space-y-3 mb-6">
                {features.map((feature, index) => <div key={index} className="flex items-center gap-2">
                    <div className="p-0.5 rounded-full bg-success/20">
                      <Check className="w-3 h-3 text-success" />
                    </div>
                    <span className="text-sm">{feature}</span>
                  </div>)}
              </div>

              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-secondary/50">
                <div className="text-center">
                  <TrendingUp className="w-5 h-5 text-success mx-auto mb-1" />
                  <p className="text-sm font-semibold">Multi</p>
                  <p className="text-xs text-muted-foreground">Asset Support</p>
                </div>
                <div className="text-center">
                  <Bell className="w-5 h-5 text-primary mx-auto mb-1" />
                  <p className="text-sm font-semibold">Pro</p>
                  <p className="text-xs text-muted-foreground">Analytics</p>
                </div>
                <div className="text-center">
                  <Clock className="w-5 h-5 text-warning mx-auto mb-1" />
                  <p className="text-sm font-semibold">24/7</p>
                  <p className="text-xs text-muted-foreground">Coverage</p>
                </div>
              </div>
            </div>

            {/* Payment Card */}
            <div className="glass-card p-6 shadow-none">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold">Secure USDT Payment</h3>
              </div>

              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-secondary/50">
                  <p className="text-sm text-muted-foreground mb-1">
                    Payment Amount
                  </p>
                  <p className="text-xl font-bold">{subscriptionPrice} USDT</p>
                  <p className="text-xs text-muted-foreground">
                    TRC20 Network Only
                  </p>
                </div>

                <div>
                  <Label className="text-sm text-muted-foreground">
                    Send USDT (TRC20) to this address:
                  </Label>
                  <div className="flex gap-2 mt-1.5">
                    <Input value={walletAddress} readOnly className="font-mono text-xs bg-secondary/50" />
                    <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                      {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="popupTxHash">Transaction Hash</Label>
                  <Input id="popupTxHash" value={txHash} onChange={e => setTxHash(e.target.value)} placeholder="Enter your TRC20 transaction hash" className="mt-1.5 bg-secondary/50" />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    After sending payment, paste your transaction hash above for
                    verification.
                  </p>
                </div>

                <Button size="lg" variant="default" className="w-full bg-primary hover:bg-primary/90" disabled={!txHash.trim() || isSubmitting} onClick={handleSubmit}>
                  {isSubmitting ? <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </> : <>
                      Submit for Verification
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>}
                </Button>

                <div className="p-3 rounded-xl bg-warning/10 border border-warning/20">
                  <p className="text-xs text-warning leading-relaxed">
                    ⚠️ Admin will verify your payment within 24 hours. Your
                    subscription will be activated automatically after
                    verification.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>;
};
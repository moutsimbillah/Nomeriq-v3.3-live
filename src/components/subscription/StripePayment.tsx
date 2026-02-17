import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";

const PENDING_STRIPE_SESSION_ID_KEY = "pendingStripeSessionId";

interface StripePaymentProps {
  subscriptionPrice: number;
  packageId: string;
  packageName: string;
  currency: string;
  stripePriceId?: string | null;
}

export const StripePayment = ({
  subscriptionPrice,
  packageId,
  packageName,
  currency,
  stripePriceId,
}: StripePaymentProps) => {
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleContinue = async () => {
    if (!stripePriceId) return;
    setIsRedirecting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error("Please log in again and try Stripe checkout.");
      }

      // Try to refresh first so invoke uses a fresh session token.
      await supabase.auth.refreshSession();

      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("create-stripe-checkout-session", {
        body: {
          packageId,
          successUrl: `${origin}/subscription`,
          cancelUrl: `${origin}/subscription`,
          accessToken: session.access_token,
        },
      });

      if (error) {
        const response = (error as { context?: Response }).context;
        let detailedMessage = error.message || "Unable to start Stripe checkout";

        if (response) {
          const payload = await response.json().catch(() => null) as
            | { error?: string; message?: string; code?: number }
            | null;
          detailedMessage =
            payload?.error ||
            payload?.message ||
            detailedMessage;

          if (response.status === 401 || /invalid jwt/i.test(detailedMessage)) {
            throw new Error("Invalid session token. Please sign out, clear site data, and log in again.");
          }
        }

        throw new Error(detailedMessage);
      }

      if (!data?.url) {
        throw new Error("Stripe checkout URL was not returned");
      }

      if (typeof data.sessionId === "string" && data.sessionId.length > 0) {
        try {
          sessionStorage.setItem(PENDING_STRIPE_SESSION_ID_KEY, data.sessionId);
        } catch (storageError) {
          console.warn("Failed to persist pending Stripe session id:", storageError);
        }
      }

      window.location.assign(data.url as string);
    } catch (err) {
      console.error("Stripe checkout error:", err);
      toast.error(getSafeErrorMessage(err, "Failed to start Stripe checkout"));
      setIsRedirecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-xl bg-secondary/50">
        <p className="text-sm text-muted-foreground mb-1">Payment Amount</p>
        <p className="text-xl font-bold">
          {currency} {subscriptionPrice.toFixed(2)}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{packageName}</p>
      </div>

      <div className="p-6 rounded-xl bg-primary/5 border border-primary/15">
        <div className="flex items-start gap-3">
          <CreditCard className="w-6 h-6 text-primary mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold">Secure Checkout via Stripe</h3>
            <p className="text-sm text-muted-foreground">
              You will be redirected to Stripe Checkout. Subscription activation is confirmed automatically after webhook verification.
            </p>
          </div>
        </div>
      </div>

      {!stripePriceId ? (
        <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
          <p className="text-xs text-warning leading-relaxed">
            Stripe is not configured for this package yet. Please choose USDT or Bank Transfer.
          </p>
        </div>
      ) : (
        <Button className="w-full text-white" onClick={handleContinue} disabled={isRedirecting}>
          {isRedirecting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Redirecting to Stripe...
            </>
          ) : (
            "Continue to Stripe"
          )}
        </Button>
      )}
    </div>
  );
};

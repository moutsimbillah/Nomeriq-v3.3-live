import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Check, X, Bell, TrendingUp, Clock } from "lucide-react";
import { usePayments } from "@/hooks/usePayments";
import { useSubscriptionPackages } from "@/hooks/useSubscriptionPackages";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";

export const SubscriptionReminderPopup = () => {
  const [isOpen, setIsOpen] = useState(false);

  const {
    hasActiveSubscription,
    user
  } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const isSignalProvider = adminRole === "signal_provider_admin";
  const navigate = useNavigate();
  const location = useLocation();
  const {
    payments,
    isLoading: isLoadingPayments
  } = usePayments({
    userId: user?.id,
    limit: 10
  });


  const { packages } = useSubscriptionPackages();
  const primaryPackage = packages[0];



  // Check if user has a pending payment awaiting verification
  const hasPendingPayment = useMemo(() => {
    if (!payments || payments.length === 0) return false;
    return payments.some(p => p.status === 'pending');
  }, [payments]);

  // Determine if popup should be shown based on subscription and payment status
  const shouldShowPopup = useMemo(() => {
    // Don't show if not logged in
    if (!user) return false;
    // Signal providers are promoted by admin and should never see subscription prompts.
    if (isSignalProvider) return false;
    // Don't show for users with active subscription
    if (hasActiveSubscription) return false;
    // Don't show while loading payments
    if (isLoadingPayments) return false;
    // Don't show if user has a pending payment awaiting verification
    if (hasPendingPayment) return false;
    // Don't show if user is already on the subscription page
    if (location.pathname === '/subscription') return false;
    // Show for: no subscription, expired subscription, or rejected payments
    return true;
  }, [hasActiveSubscription, user, isLoadingPayments, hasPendingPayment, location.pathname, isSignalProvider]);

  useEffect(() => {
    // Don't show popup if conditions aren't met
    if (!shouldShowPopup) return;

    // Check if user has already seen the popup
    const hasSeenPopup = localStorage.getItem('hasSeenSubscriptionReminder');

    if (hasSeenPopup) return;

    // Show popup after 30 seconds only once
    const timeout = setTimeout(() => {
      setIsOpen(true);
      localStorage.setItem('hasSeenSubscriptionReminder', 'true');
    }, 30000);

    return () => clearTimeout(timeout);
  }, [shouldShowPopup]);

  // Don't render anything if popup shouldn't be shown
  if (!shouldShowPopup) return null;


  return <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto border-border bg-background p-0">
      {/* Close button */}
      <button onClick={() => setIsOpen(false)} className="absolute right-4 top-4 z-10 h-8 w-8 flex items-center justify-center rounded-lg bg-secondary hover:bg-accent border border-border transition-colors">
        <X className="h-4 w-4 text-muted-foreground" />
        <span className="sr-only">Close</span>
      </button>

      <div className="p-6 lg:p-8">
        {/* Free Plan Warning */}
        <div className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-center">
          <p className="text-sm text-destructive font-medium leading-relaxed">
            You are currently using the free version of Nomeriq. You will not receive any trading signals on free plan.
          </p>
        </div>



        <div className="flex justify-center">
          {/* Pricing Card */}
          <div className="glass-card p-6 relative overflow-hidden shadow-none w-full max-w-md">
            <div className="absolute top-0 right-0 px-3 py-1.5 bg-success text-success-foreground text-xs font-semibold rounded-bl-xl">
              BEST VALUE
            </div>

            {primaryPackage && (
              <>
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Recommended Plan
                  </p>
                  <h3 className="text-lg font-semibold">{primaryPackage.name}</h3>
                  <p className="text-2xl font-bold mt-1">
                    {primaryPackage.currency} {Number(primaryPackage.price).toFixed(2)}
                    <span className="text-xs text-muted-foreground ml-1">
                      {primaryPackage.duration_type === "lifetime"
                        ? "lifetime"
                        : primaryPackage.duration_type === "monthly"
                        ? "/month"
                        : "/year"}
                    </span>
                  </p>
                </div>

                <div className="space-y-3 mb-6">
                  {primaryPackage.features.slice(0, 4).map((feature) => (
                    <div key={feature.id} className="flex items-center gap-2">
                      <div className="p-0.5 rounded-full bg-success/20">
                        <Check className="w-3 h-3 text-success" />
                      </div>
                      <span className="text-sm">{feature.feature_text}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

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
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/subscription');
              }}
              className="w-full mt-6 bg-primary hover:bg-primary/90 text-white font-bold py-3 px-4 rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98]"
            >
              Subscribe
            </button>
          </div>


        </div>
      </div>
    </DialogContent>
  </Dialog>;
};

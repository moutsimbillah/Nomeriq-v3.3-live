import { useState, useMemo, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, Zap, TrendingUp, Clock, CheckCircle2, XCircle, Loader2, Check, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePayments } from "@/hooks/usePayments";
import { useSubscriptionPackages, useUserSubscriptions, SubscriptionPackageWithFeatures } from "@/hooks/useSubscriptionPackages";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { toast } from "sonner";
import { format } from "date-fns";
import { PaymentMethodSelector, PaymentMethod } from "@/components/subscription/PaymentMethodSelector";
import { UsdtPayment } from "@/components/subscription/UsdtPayment";
import { BankTransferPayment } from "@/components/subscription/BankTransferPayment";
import { StripePayment } from "@/components/subscription/StripePayment";
import { supabase } from "@/integrations/supabase/client";
import { useAdminRoleContext } from "@/contexts/AdminRoleContext";

/** Tier score for upgrade logic: lifetime > yearly > monthly, then by price. Higher = better plan. */
function getPackageTierScore(pkg: { duration_type: string; price: number }): number {
  const w = pkg.duration_type === "lifetime" ? 3 : pkg.duration_type === "yearly" ? 2 : 1;
  return w * 1e9 + Number(pkg.price);
}

const Subscription = () => {
  const { user, subscription: authSubscription, hasActiveSubscription: hasAuthActiveSubscription } = useAuth();
  const { adminRole } = useAdminRoleContext();
  const isSignalProvider = adminRole === "signal_provider_admin" || adminRole === "super_admin";
  const { settings } = useGlobalSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('usdt_trc20');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<typeof payments[0] | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);

  const { packages, isLoading: isLoadingPackages } = useSubscriptionPackages();
  const { activeSubscriptions, refetch: refetchSubscriptions } = useUserSubscriptions();
  const [selectedPackage, setSelectedPackage] = useState<SubscriptionPackageWithFeatures | null>(null);

  // Refetch subscriptions when Subscription page mounts so we have fresh data after verification
  useEffect(() => {
    refetchSubscriptions();
  }, [refetchSubscriptions]);

  const { payments, isLoading, submitPayment, refetch: refetchPayments } = usePayments({
    userId: user?.id,
    limit: 10,
  });

  useEffect(() => {
    const stripeState = searchParams.get("stripe");
    if (!stripeState) return;

    if (stripeState === "success") {
      toast.info("Payment received. Verifying your subscription status...");
      refetchSubscriptions();
      refetchPayments();
    } else if (stripeState === "cancel") {
      toast.message("Stripe checkout was cancelled.");
    }

    const next = new URLSearchParams(searchParams);
    next.delete("stripe");
    next.delete("session_id");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, refetchSubscriptions, refetchPayments]);

  const walletAddress = settings?.wallet_address || "TNYhMKhLQWz6d5oX7Kqj7sdUo8vNcRYuPE";

  const effectiveSelectedPackage = selectedPackage;

  // Displayed price in the UI – prefer the selected package, fall back to legacy global setting
  const subscriptionPrice = useMemo(() => {
    if (effectiveSelectedPackage) {
      return Number(effectiveSelectedPackage.price);
    }
    return settings?.subscription_price || 50;
  }, [effectiveSelectedPackage, settings]);

  // Subscribed package IDs: from both subscription.package_id and subscription.package so we don't miss when .package isn't loaded
  const activePackageIds = useMemo(() => {
    const ids = new Set(
      activeSubscriptions.flatMap((sub) =>
        [sub.package?.id, sub.package_id].filter((id): id is string => !!id)
      )
    );
    if (hasAuthActiveSubscription && authSubscription?.package_id) {
      ids.add(authSubscription.package_id);
    }
    return ids;
  }, [activeSubscriptions, hasAuthActiveSubscription, authSubscription?.package_id]);

  // Best (highest) tier score among active subscriptions; fallback to packages list when .package is missing
  const bestActiveTierScore = useMemo(() => {
    const scores = activeSubscriptions
      .map((s) => {
        const pkg = s.package ?? packages.find((p) => p.id === s.package_id);
        return pkg ? getPackageTierScore(pkg) : -1;
      })
      .filter((o) => o >= 0);

    if (scores.length === 0 && hasAuthActiveSubscription && authSubscription?.package_id) {
      const authPkg = packages.find((p) => p.id === authSubscription.package_id);
      if (authPkg) return getPackageTierScore(authPkg);
    }

    return scores.length > 0 ? Math.max(...scores) : -1;
  }, [activeSubscriptions, packages, hasAuthActiveSubscription, authSubscription?.package_id]);

  const hasAnyActiveSubscription = activeSubscriptions.length > 0 || hasAuthActiveSubscription;

  // Plans currently waiting for admin verification
  const pendingPaymentPackageIds = useMemo(
    () =>
      new Set(
        payments
          .filter((p) => p.status === "pending" && !!p.package_id)
          .map((p) => p.package_id as string)
      ),
    [payments]
  );

  // Get enabled payment methods from settings
  const enabledMethods = useMemo(() => ({
    usdt_trc20: settings?.enable_usdt_trc20 ?? true,
    bank_transfer: settings?.enable_bank_transfer ?? false,
    stripe: (settings?.enable_stripe ?? false) && !!effectiveSelectedPackage?.stripe_price_id,
  }), [settings, effectiveSelectedPackage?.stripe_price_id]);

  useEffect(() => {
    if (selectedPaymentMethod !== "stripe" || enabledMethods.stripe) return;
    if (enabledMethods.usdt_trc20) {
      setSelectedPaymentMethod("usdt_trc20");
      return;
    }
    if (enabledMethods.bank_transfer) {
      setSelectedPaymentMethod("bank_transfer");
    }
  }, [selectedPaymentMethod, enabledMethods]);

  // Handle USDT payment submission
  const handleUsdtSubmit = async (txHash: string, paymentMethod: string) => {
    if (!user) return;
    if (!effectiveSelectedPackage) {
      toast.error("Please select a subscription package.");
      return;
    }
    if (pendingPaymentPackageIds.has(effectiveSelectedPackage.id)) {
      toast.error("This plan already has a pending payment. Please wait for admin review.");
      return;
    }
    setIsSubmitting(true);
    try {
      await submitPayment(
        user.id,
        txHash,
        Number(effectiveSelectedPackage.price),
        paymentMethod,
        {
          packageId: effectiveSelectedPackage.id,
          currency: effectiveSelectedPackage.currency,
        }
      );
      toast.success("Payment submitted! Admin will verify within 24 hours.");
      setSelectedPackage(null);
    } catch (err) {
      console.error('Error submitting payment:', err);
      toast.error("Failed to submit payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Bank Transfer payment submission
  const handleBankTransferSubmit = async (data: {
    userBankAccountName: string;
    userBankAccountNumber: string;
    userBankName: string;
    referenceNumber: string;
  }) => {
    if (!user) return;
    if (!effectiveSelectedPackage) {
      toast.error("Please select a subscription package.");
      return;
    }
    if (pendingPaymentPackageIds.has(effectiveSelectedPackage.id)) {
      toast.error("This plan already has a pending payment. Please wait for admin review.");
      return;
    }
    setIsSubmitting(true);
    try {
      // Submit payment with bank transfer details
      const { error } = await supabase
        .from('payments')
        .insert({
          user_id: user.id,
          amount: Number(effectiveSelectedPackage.price),
          currency: effectiveSelectedPackage.currency,
          tx_hash: data.referenceNumber,
          payment_method: 'bank_transfer',
          user_bank_account_name: data.userBankAccountName,
          user_bank_account_number: data.userBankAccountNumber,
          user_bank_name: data.userBankName,
          status: 'pending',
          package_id: effectiveSelectedPackage.id,
        });

      if (error) throw error;
      toast.success("Payment submitted! Admin will verify within 24 hours.");
      setSelectedPackage(null);
    } catch (err) {
      console.error('Error submitting payment:', err);
      toast.error("Failed to submit payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSignalProvider) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout title="">
      <div className="max-w-[1700px] mx-auto px-4 md:px-8">
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

        <div className="mt-10">
          <div className="relative">
            <div
              className={cn(
                "transition-all duration-500 ease-out",
                effectiveSelectedPackage
                  ? "pointer-events-none max-h-0 -translate-y-2 opacity-0 overflow-hidden"
                  : "max-h-[5000px] translate-y-0 opacity-100"
              )}
            >
              <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/70 px-5 py-4 mb-4">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Choose Your Plan</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Plans resize automatically as your admin adds or removes packages.
                  </p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {packages.length} plan{packages.length === 1 ? "" : "s"}
                </Badge>
              </div>

              {isLoadingPackages ? (
                <div className="glass-card p-8 flex items-center justify-center shadow-none rounded-2xl border border-border/60">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : packages.length === 0 ? (
                <div className="glass-card p-8 text-center text-muted-foreground shadow-none rounded-2xl border border-border/60">
                  <p>No subscription packages are available yet. Please contact support.</p>
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(290px,1fr))] gap-4 md:gap-5">
                  {packages.map((pkg) => {
                    const isSubscribedToPackage = activePackageIds.has(pkg.id);
                    const hasPendingVerification = pendingPaymentPackageIds.has(pkg.id);
                    const pkgTierScore = getPackageTierScore(pkg);
                    const isHigherTierThanCurrent =
                      hasAnyActiveSubscription && pkgTierScore > bestActiveTierScore;
                    const isLowerTierThanCurrent =
                      hasAnyActiveSubscription && pkgTierScore < bestActiveTierScore;
                    const isCurrentTierPlan =
                      hasAnyActiveSubscription && pkgTierScore === bestActiveTierScore;

                    const buttonLabel = hasPendingVerification
                      ? "Pending Verification"
                      : isSubscribedToPackage
                      ? "Subscribed"
                      : isCurrentTierPlan
                      ? "Current Plan"
                      : isHigherTierThanCurrent
                      ? "Upgrade"
                      : "Select Plan";
                    const disabled =
                      hasPendingVerification ||
                      isSubscribedToPackage ||
                      isLowerTierThanCurrent ||
                      isCurrentTierPlan;

                    const onChoosePlan = () => {
                      if (disabled) return;
                      setSelectedPackage(pkg);
                    };

                    return (
                      <div
                        key={pkg.id}
                        className={cn(
                          "group relative h-full overflow-hidden rounded-2xl border bg-background/85 p-5 transition-all duration-200 flex flex-col",
                          disabled
                            ? "border-border/60 opacity-80"
                            : "cursor-pointer border-border/70 hover:border-primary/45 hover:shadow-[0_8px_28px_rgba(17,24,39,0.08)]"
                        )}
                        onClick={onChoosePlan}
                      >
                        <div className="flex-1">
                        {isSubscribedToPackage && (
                          <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-primary-foreground text-[11px] font-semibold rounded-bl-xl">
                            Subscribed
                          </div>
                        )}
                        <div className="mb-4 space-y-1.5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="self-end">
                              <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1 whitespace-nowrap">
                                {pkg.duration_type === "lifetime"
                                  ? "Lifetime Plan"
                                  : pkg.duration_type === "monthly"
                                  ? "Monthly Plan"
                                  : "Yearly Plan"}
                              </p>
                              <h3 className="text-xl font-semibold tracking-tight">{pkg.name}</h3>
                            </div>
                            <div className="shrink-0 rounded-xl border border-border/60 bg-secondary/25 px-4 py-2.5 min-w-[190px]">
                              <div className="flex items-center justify-center text-center">
                                <span className="text-xl md:text-[22px] font-semibold leading-none">
                                  {pkg.currency} {Number(pkg.price).toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {pkg.description && (
                            <p className="text-sm text-muted-foreground leading-relaxed break-words">
                              {pkg.description}
                            </p>
                          )}
                        </div>

                        <div className="mb-4 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="text-[11px] capitalize font-medium">
                            {pkg.duration_type === "lifetime"
                              ? "Lifetime"
                              : pkg.duration_type === "monthly"
                              ? "Monthly"
                              : "Yearly"}
                          </Badge>
                          <Badge variant="outline" className="text-[11px]">
                            {pkg.features.length} feature{pkg.features.length === 1 ? "" : "s"}
                          </Badge>
                        </div>

                        <div className="mb-4">
                          <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground mb-2">
                            Included Categories
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {(pkg.categories && pkg.categories.length > 0) ? (
                              pkg.categories.map((cat) => (
                                <Badge key={cat} variant="outline" className="text-xs px-2 py-0.5">
                                  {cat}
                                </Badge>
                              ))
                            ) : (
                              ["Forex", "Metals", "Crypto", "Indices", "Commodities"].map((cat) => (
                                <Badge key={cat} variant="outline" className="text-xs px-2 py-0.5 text-muted-foreground">
                                  {cat}
                                </Badge>
                              ))
                            )}
                          </div>
                        </div>

                        {pkg.features.length > 0 && (
                          <div className="mb-5 border-t border-border/50 pt-4">
                            <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground mb-3">
                              Key Features
                            </p>
                            <div className="grid gap-2">
                              {pkg.features.slice(0, 4).map((feature) => (
                                <div key={feature.id} className="flex items-center gap-2.5 text-sm">
                                  <div className="rounded-full bg-success/15 p-1">
                                    <Check className="w-3.5 h-3.5 text-success" />
                                  </div>
                                  <span className="text-foreground/95">{feature.feature_text}</span>
                                </div>
                              ))}
                            </div>
                            {pkg.features.length > 4 && (
                              <p className="text-xs text-muted-foreground mt-2">
                                + {pkg.features.length - 4} more features
                              </p>
                            )}
                          </div>
                        )}

                        {isLowerTierThanCurrent && (
                          <p className="text-xs text-muted-foreground mb-3">
                            Your current plan is higher than this package.
                          </p>
                        )}
                        {isCurrentTierPlan && !isSubscribedToPackage && (
                          <p className="text-xs text-muted-foreground mb-3">
                            You already have an active plan at this tier.
                          </p>
                        )}
                        {hasPendingVerification && (
                          <p className="text-xs text-muted-foreground mb-3">
                            Payment for this plan is under review.
                          </p>
                        )}
                        </div>

                        <Button
                          className={cn(
                            "w-full h-10 font-semibold mt-auto text-white disabled:text-white",
                            !disabled && "group-hover:shadow-sm"
                          )}
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            onChoosePlan();
                          }}
                        >
                          {buttonLabel}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className={cn(
                "transition-all duration-500 ease-out",
                effectiveSelectedPackage
                  ? "max-h-[5000px] translate-y-0 opacity-100"
                  : "pointer-events-none max-h-0 translate-y-2 opacity-0 overflow-hidden"
              )}
            >
              {effectiveSelectedPackage && (
                <div className="mx-auto w-full max-w-[1080px] rounded-2xl border border-border/60 bg-background/90 p-6 lg:p-8 shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6 border-b border-border/50 pb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                        <Shield className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold tracking-tight">Select Payment Method</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          You selected <span className="font-medium text-foreground">{effectiveSelectedPackage.name}</span>.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      onClick={() => setSelectedPackage(null)}
                    >
                      Change Plan
                    </Button>
                  </div>

                  <div className="space-y-6">
                    <PaymentMethodSelector
                      selectedMethod={selectedPaymentMethod}
                      onMethodChange={setSelectedPaymentMethod}
                      enabledMethods={enabledMethods}
                    />

                    {selectedPaymentMethod === 'usdt_trc20' && (
                      <UsdtPayment
                        walletAddress={walletAddress}
                        subscriptionPrice={subscriptionPrice}
                        onSubmit={handleUsdtSubmit}
                        isSubmitting={isSubmitting}
                      />
                    )}

                    {selectedPaymentMethod === 'bank_transfer' && (
                      <BankTransferPayment
                        bankAccountName={settings?.bank_account_name || ""}
                        bankAccountNumber={settings?.bank_account_number || ""}
                        bankName={settings?.bank_name || ""}
                        subscriptionPrice={subscriptionPrice}
                        onSubmit={handleBankTransferSubmit}
                        isSubmitting={isSubmitting}
                      />
                    )}

                    {selectedPaymentMethod === 'stripe' && (
                      <StripePayment
                        subscriptionPrice={Number(effectiveSelectedPackage.price)}
                        packageId={effectiveSelectedPackage.id}
                        packageName={effectiveSelectedPackage.name}
                        currency={effectiveSelectedPackage.currency}
                        stripePriceId={effectiveSelectedPackage.stripe_price_id ?? null}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Active Subscriptions Overview */}
        {activeSubscriptions.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-4">Your Active Subscriptions</h2>
            <div className="glass-card p-6 space-y-4 shadow-none">
              {activeSubscriptions.map((sub) => {
                const pkg = sub.package as SubscriptionPackageWithFeatures | null;
                if (!pkg) return null;

                const isLifetimePkg = pkg.duration_type === "lifetime";
                const expiresLabel = sub.expires_at
                  ? format(new Date(sub.expires_at), "dd MMM yyyy")
                  : isLifetimePkg
                  ? "Lifetime"
                  : "No expiry set";

                const categories = (pkg.categories ?? []) as string[];

                return (
                  <div
                    key={sub.id}
                    className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/40 last:border-b-0 pb-3 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-semibold">{pkg.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires: {expiresLabel}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.length > 0 ? (
                        categories.map((cat) => (
                          <Badge
                            key={cat}
                            variant="outline"
                            className="h-6 rounded-full px-2.5 py-0 text-[11px] font-medium leading-none"
                          >
                            {cat}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          All categories
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payment History */}
        {payments.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold mb-6">Your Payment History</h2>
            <div className="glass-card overflow-hidden shadow-none">
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
                          Invoice ID
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Payment Method
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Package
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Duration
                        </th>
                        <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Date & Time
                        </th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Amount
                        </th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Status
                        </th>
                        <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {payments.map((payment) => (
                        <tr key={payment.id} className="hover:bg-accent/30 transition-colors">
                          <td className="px-6 py-4">
                            <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                              {payment.id.slice(0, 8).toUpperCase()}
                            </code>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-medium">
                              {payment.payment_method === 'usdt_trc20' && 'USDT (TRC20)'}
                              {payment.payment_method === 'bank_transfer' && 'Bank Transfer'}
                              {payment.payment_method === 'stripe' && 'Card Payment'}
                              {!payment.payment_method && 'USDT (TRC20)'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm">
                              {payment.package?.name ?? '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm capitalize">
                              {payment.package?.duration_type === 'lifetime'
                                ? 'Lifetime'
                                : payment.package?.duration_type === 'monthly'
                                ? 'Monthly'
                                : payment.package?.duration_type === 'yearly'
                                ? 'Yearly'
                                : '—'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-sm">
                              {format(new Date(payment.created_at), 'dd MMM yyyy, HH:mm')}
                            </p>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-semibold">${payment.amount}</span>
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
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedPayment(payment);
                                setIsDetailsDialogOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              View
                            </button>
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

        {/* Payment Details Dialog */}
        <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto shadow-none">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Payment Details</DialogTitle>
            </DialogHeader>
            {selectedPayment && (
              <div className="space-y-6">
                {/* Header Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-secondary/30 border border-border/50">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Invoice ID</p>
                    <code className="text-sm bg-background px-2 py-1 rounded font-mono">
                      {selectedPayment.id}
                    </code>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-sm",
                        selectedPayment.status === "pending" &&
                        "border-warning/30 text-warning bg-warning/10",
                        selectedPayment.status === "verified" &&
                        "border-success/30 text-success bg-success/10",
                        selectedPayment.status === "rejected" &&
                        "border-destructive/30 text-destructive bg-destructive/10"
                      )}
                    >
                      {selectedPayment.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                      {selectedPayment.status === "verified" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                      {selectedPayment.status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                      {selectedPayment.status.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Payment Method</p>
                    <p className="text-sm font-semibold">
                      {selectedPayment.payment_method === 'usdt_trc20' && 'USDT (TRC20)'}
                      {selectedPayment.payment_method === 'bank_transfer' && 'Bank Transfer'}
                      {selectedPayment.payment_method === 'stripe' && 'Card Payment'}
                      {!selectedPayment.payment_method && 'USDT (TRC20)'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Amount</p>
                    <p className="text-xl font-bold text-primary">${selectedPayment.amount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Package</p>
                    <p className="text-sm font-semibold">
                      {selectedPayment.package?.name ?? '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Duration</p>
                    <p className="text-sm font-semibold capitalize">
                      {selectedPayment.package?.duration_type === 'lifetime'
                        ? 'Lifetime'
                        : selectedPayment.package?.duration_type === 'monthly'
                        ? 'Monthly'
                        : selectedPayment.package?.duration_type === 'yearly'
                        ? 'Yearly'
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Payment Destination - Where User Sent Payment */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Payment Sent To
                  </h3>
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                    {selectedPayment.payment_method === 'bank_transfer' ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Account Holder</p>
                            <p className="text-sm font-medium">{settings?.bank_account_name || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Bank Name</p>
                            <p className="text-sm font-medium">{settings?.bank_name || 'N/A'}</p>
                          </div>
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                            <code className="text-sm bg-background px-2 py-1 rounded font-mono">
                              {settings?.bank_account_number || 'N/A'}
                            </code>
                          </div>
                        </div>
                      </>
                    ) : selectedPayment.payment_method === 'stripe' ? (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Provider</p>
                        <p className="text-sm font-medium">Stripe Checkout</p>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Wallet Address (TRC20)</p>
                          <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all block">
                            {walletAddress}
                          </code>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* User's Payment Information */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-success" />
                    Your Payment Information
                  </h3>
                  <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Transaction Hash / Reference</p>
                      <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all block">
                        {selectedPayment.tx_hash || '-'}
                      </code>
                    </div>
                    {selectedPayment.payment_method === 'stripe' && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Stripe Session ID</p>
                          <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all block">
                            {selectedPayment.provider_session_id || '-'}
                          </code>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Stripe Payment ID</p>
                          <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all block">
                            {selectedPayment.provider_payment_id || '-'}
                          </code>
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Submitted On</p>
                      <p className="text-sm font-medium">
                        {format(new Date(selectedPayment.created_at), 'dd MMMM yyyy, HH:mm:ss')}
                      </p>
                    </div>
                    {selectedPayment.payment_method === 'bank_transfer' && (
                      <>
                        <div className="pt-3 border-t border-border/50">
                          <p className="text-sm font-semibold mb-3">Your Bank Details</p>
                          <div className="grid grid-cols-2 gap-3">
                            {selectedPayment.user_bank_account_name && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Account Holder</p>
                                <p className="text-sm">{selectedPayment.user_bank_account_name}</p>
                              </div>
                            )}
                            {selectedPayment.user_bank_name && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Bank Name</p>
                                <p className="text-sm">{selectedPayment.user_bank_name}</p>
                              </div>
                            )}
                            {selectedPayment.user_bank_account_number && (
                              <div className="col-span-2">
                                <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                                <code className="text-sm bg-background px-2 py-1 rounded font-mono">
                                  {selectedPayment.user_bank_account_number}
                                </code>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Verification Status */}
                {(selectedPayment.verified_at || selectedPayment.rejection_reason) && (
                  <div className="space-y-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {selectedPayment.status === 'verified' ? (
                        <CheckCircle2 className="w-5 h-5 text-success" />
                      ) : (
                        <XCircle className="w-5 h-5 text-destructive" />
                      )}
                      Verification Details
                    </h3>
                    <div className={cn(
                      "p-4 rounded-xl border",
                      selectedPayment.status === 'verified'
                        ? "bg-success/5 border-success/20"
                        : "bg-destructive/5 border-destructive/20"
                    )}>
                      {selectedPayment.verified_at && (
                        <div className="mb-2">
                          <p className="text-xs text-muted-foreground mb-1">Verified At</p>
                          <p className="text-sm font-medium text-success">
                            {format(new Date(selectedPayment.verified_at), 'dd MMMM yyyy, HH:mm:ss')}
                          </p>
                        </div>
                      )}
                      {selectedPayment.rejection_reason && (
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Rejection Reason</p>
                          <p className="text-sm text-destructive font-medium">{selectedPayment.rejection_reason}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Subscription;

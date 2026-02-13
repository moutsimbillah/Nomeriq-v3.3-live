import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, CheckCircle2, XCircle, Clock, ExternalLink, Copy, Check, Loader2, Eye, Shield, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePayments } from "@/hooks/usePayments";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
const AdminPayments = () => {
  const {
    user
  } = useAuth();
  const { settings } = useGlobalSettings();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "verified" | "rejected">("all");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const {
    payments,
    isLoading,
    verifyPayment,
    rejectPayment,
    totalCount
  } = usePayments({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit: 50
  });
  const filteredPayments = payments.filter(payment => {
    const userName = [payment.profile?.first_name, payment.profile?.last_name].filter(Boolean).join(' ');
    const needle = searchQuery.toLowerCase();
    const matchesSearch =
      userName.toLowerCase().includes(needle) ||
      (payment.profile?.email || "").toLowerCase().includes(needle) ||
      (payment.tx_hash || "").toLowerCase().includes(needle) ||
      (payment.provider_session_id || "").toLowerCase().includes(needle) ||
      (payment.provider_payment_id || "").toLowerCase().includes(needle);
    return matchesSearch;
  });
  const selectedPayment = payments.find(p => p.id === selectedPaymentId);
  const handleVerify = async () => {
    if (!selectedPaymentId || !user) return;
    try {
      await verifyPayment(selectedPaymentId, user.id);
      toast.success("Payment verified and subscription activated");
      setSelectedPaymentId(null);
    } catch (err) {
      console.error('Error verifying payment:', err);
      toast.error("Failed to verify payment");
    }
  };
  const handleReject = async (id: string) => {
    try {
      await rejectPayment(id, "Payment could not be verified on blockchain");
      toast.success("Payment rejected");
    } catch (err) {
      console.error('Error rejecting payment:', err);
      toast.error("Failed to reject payment");
    }
  };
  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };
  const pendingCount = payments.filter(p => p.status === "pending").length;
  const verifiedRevenue = payments.filter(p => p.status === "verified").reduce((sum, p) => sum + p.amount, 0);
  return <AdminLayout title="Payment Verification">
    {/* Header */}
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input placeholder="Search by name, email, or TX hash..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10 bg-secondary/50" />
      </div>
      <div className="flex gap-2">
        {(["all", "pending", "verified", "rejected"] as const).map(status => <Button key={status} variant={statusFilter === status ? "default" : "outline"} size="sm" onClick={() => setStatusFilter(status)} className={cn(statusFilter === status && status === "pending" && "bg-warning hover:bg-warning/90", statusFilter === status && status === "verified" && "bg-success hover:bg-success/90", statusFilter === status && status === "rejected" && "bg-destructive hover:bg-destructive/90")}>
          {status.charAt(0).toUpperCase() + status.slice(1)}
          {status === "pending" && pendingCount > 0 && <span className="ml-1.5 px-1.5 py-0.5 rounded bg-background/20 text-xs">
            {pendingCount}
          </span>}
        </Button>)}
      </div>
    </div>

    {/* Stats */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="glass-card p-4 shadow-none">
        <p className="text-2xl font-bold">{isLoading ? "..." : totalCount}</p>
        <p className="text-sm text-muted-foreground">Total Payments</p>
      </div>
      <div className="glass-card p-4 shadow-none">
        <p className="text-2xl font-bold text-warning">{isLoading ? "..." : pendingCount}</p>
        <p className="text-sm text-muted-foreground">Pending Verification</p>
      </div>
      <div className="glass-card p-4 shadow-none">
        <p className="text-2xl font-bold text-success">
          {isLoading ? "..." : payments.filter(p => p.status === "verified").length}
        </p>
        <p className="text-sm text-muted-foreground">Verified</p>
      </div>
      <div className="glass-card p-4 shadow-none">
        <p className="text-2xl font-bold text-success">
          ${isLoading ? "..." : verifiedRevenue}
        </p>
        <p className="text-sm text-muted-foreground">Total Revenue</p>
      </div>
    </div>

    {/* Payments Table */}
    <div className="glass-card overflow-hidden shadow-none">
      {isLoading ? <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div> : filteredPayments.length === 0 ? <div className="text-center py-12 text-muted-foreground">
        <p>No payments found</p>
      </div> : <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50 bg-secondary/30">
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Invoice ID</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">User</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Payment Method</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Package</th>
              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Date & Time</th>
              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Amount</th>
              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Status</th>
              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filteredPayments.map(payment => {
              const userName = [payment.profile?.first_name, payment.profile?.last_name].filter(Boolean).join(' ') || 'Unknown';
              return <tr key={payment.id} className="hover:bg-accent/30 transition-colors">
                <td className="px-6 py-4">
                  <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                    {payment.id.slice(0, 8).toUpperCase()}
                  </code>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="font-semibold">{userName}</p>
                    <p className="text-xs text-muted-foreground">{payment.profile?.email}</p>
                  </div>
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
                  {payment.package ? (
                    <div>
                      <p className="text-sm font-semibold">{payment.package.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {payment.package.duration_type === 'lifetime'
                          ? 'Lifetime'
                          : `${payment.package.duration_months} ${
                              payment.package.duration_type === 'monthly'
                                ? 'month'
                                : 'months'
                            }`}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Legacy (no package)</span>
                  )}
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
                  <Badge variant="outline" className={cn(payment.status === "pending" && "border-warning/30 text-warning bg-warning/10", payment.status === "verified" && "border-success/30 text-success bg-success/10", payment.status === "rejected" && "border-destructive/30 text-destructive bg-destructive/10")}>
                    {payment.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                    {payment.status === "verified" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {payment.status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                    {payment.status}
                  </Badge>
                </td>
                <td className="px-6 py-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedPaymentId(payment.id);
                        setIsDetailsDialogOpen(true);
                      }}
                      className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </button>
                    {payment.status === "pending" && <>
                      <Button size="sm" variant="outline" className="border-success/30 text-success hover:bg-success/10" onClick={() => handleVerify()}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => handleReject(payment.id)}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </>}
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>}
    </div>

    {/* Payment Details Dialog */}
    <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                <p className="text-xs text-muted-foreground mb-1">User</p>
                <p className="text-sm font-semibold">
                  {[selectedPayment.profile?.first_name, selectedPayment.profile?.last_name].filter(Boolean).join(' ') || 'Unknown'}
                </p>
                <p className="text-xs text-muted-foreground">{selectedPayment.profile?.email}</p>
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
                <p className="text-xs text-muted-foreground mb-1">Subscribed Package</p>
                {selectedPayment.package ? (
                  <div>
                    <p className="text-sm font-semibold">{selectedPayment.package.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedPayment.package.duration_type === 'lifetime'
                        ? 'Lifetime'
                        : `${selectedPayment.package.duration_months} ${
                            selectedPayment.package.duration_type === 'monthly'
                              ? 'month(s)'
                              : 'months'
                          }`}
                      {selectedPayment.package.currency && ` · ${selectedPayment.package.currency} ${Number(selectedPayment.package.price).toFixed(2)}`}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Legacy (no package linked)</p>
                )}
              </div>
            </div>

            {/* Payment Destination */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Payment Sent To (Admin Account)
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
                ) : selectedPayment.payment_method === "stripe" ? (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Provider</p>
                    <p className="text-sm font-medium">Stripe Checkout</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Wallet Address (TRC20)</p>
                      <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all block">
                        {settings?.wallet_address || 'N/A'}
                      </code>
                    </div>
                    {selectedPayment.tx_hash && selectedPayment.payment_method === "usdt_trc20" && (
                      <a
                        href={`https://tronscan.org/#/transaction/${selectedPayment.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-primary hover:underline text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        View on TronScan
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* User's Payment Information */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-success" />
                User's Payment Information
              </h3>
              <div className="p-4 rounded-xl bg-secondary/30 border border-border/50 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Transaction Hash / Reference</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all flex-1">
                      {selectedPayment.tx_hash || '-'}
                    </code>
                    {selectedPayment.tx_hash && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => selectedPayment.tx_hash && copyHash(selectedPayment.tx_hash)}
                      >
                        {copiedHash === selectedPayment.tx_hash ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                  </div>
                </div>
                {selectedPayment.payment_method === "stripe" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Stripe Session ID</p>
                      <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all block">
                        {selectedPayment.provider_session_id || "-"}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Stripe Payment ID</p>
                      <code className="text-xs bg-background px-2 py-1 rounded font-mono break-all block">
                        {selectedPayment.provider_payment_id || "-"}
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
                      <p className="text-sm font-semibold mb-3">User's Bank Details</p>
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

            {/* Action Buttons for Pending Payments */}
            {selectedPayment.status === 'pending' && (
              <div className="flex gap-3 pt-4 border-t border-border/50">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setIsDetailsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    handleReject(selectedPayment.id);
                    setIsDetailsDialogOpen(false);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject Payment
                </Button>
                <Button
                  variant="default"
                  className="flex-1 bg-success hover:bg-success/90"
                  onClick={() => {
                    handleVerify();
                    setIsDetailsDialogOpen(false);
                  }}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Verify & Activate
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  </AdminLayout>;
};
export default AdminPayments;

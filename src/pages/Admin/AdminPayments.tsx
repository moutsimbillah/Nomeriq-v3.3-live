import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, CheckCircle2, XCircle, Clock, ExternalLink, Copy, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePayments } from "@/hooks/usePayments";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
const AdminPayments = () => {
  const {
    user
  } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "verified" | "rejected">("all");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
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
    const matchesSearch = userName.toLowerCase().includes(searchQuery.toLowerCase()) || (payment.profile?.email || '').toLowerCase().includes(searchQuery.toLowerCase()) || payment.tx_hash.toLowerCase().includes(searchQuery.toLowerCase());
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
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">User</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">TX Hash</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Amount</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Submitted</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredPayments.map(payment => {
              const userName = [payment.profile?.first_name, payment.profile?.last_name].filter(Boolean).join(' ') || 'Unknown';
              return <tr key={payment.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-semibold">{userName}</p>
                          <p className="text-xs text-muted-foreground">{payment.profile?.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-secondary/50 px-2 py-1 rounded font-mono">
                            {payment.tx_hash.slice(0, 12)}...{payment.tx_hash.slice(-8)}
                          </code>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyHash(payment.tx_hash)}>
                            {copiedHash === payment.tx_hash ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                          </Button>
                          <a href={`https://tronscan.org/#/transaction/${payment.tx_hash}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="font-semibold">${payment.amount}</span>
                        <p className="text-xs text-muted-foreground">USDT</p>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="outline" className={cn(payment.status === "pending" && "border-warning/30 text-warning bg-warning/10", payment.status === "verified" && "border-success/30 text-success bg-success/10", payment.status === "rejected" && "border-destructive/30 text-destructive bg-destructive/10")}>
                          {payment.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                          {payment.status === "verified" && <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {payment.status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
                          {payment.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm">
                          {formatDistanceToNow(new Date(payment.created_at), {
                      addSuffix: true
                    })}
                        </p>
                        {payment.verified_at && <p className="text-xs text-muted-foreground">
                            Verified: {formatDistanceToNow(new Date(payment.verified_at), {
                      addSuffix: true
                    })}
                          </p>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {payment.status === "pending" && <>
                              <Button size="sm" variant="outline" className="border-success/30 text-success hover:bg-success/10" onClick={() => setSelectedPaymentId(payment.id)}>
                                <CheckCircle2 className="w-4 h-4 mr-1" />
                                Verify
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

      {/* Verification Dialog */}
      <Dialog open={!!selectedPaymentId} onOpenChange={() => setSelectedPaymentId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify Payment</DialogTitle>
            <DialogDescription>
              Confirm that you have verified this payment on the blockchain.
            </DialogDescription>
          </DialogHeader>
          
          {selectedPayment && <div className="space-y-4">
              <div className="p-4 rounded-lg bg-secondary/50">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">User</p>
                    <p className="font-medium">
                      {[selectedPayment.profile?.first_name, selectedPayment.profile?.last_name].filter(Boolean).join(' ') || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Amount</p>
                    <p className="font-medium">${selectedPayment.amount} USDT</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2">Transaction Hash</p>
                <code className="block text-xs bg-secondary/50 p-3 rounded-lg font-mono break-all">
                  {selectedPayment.tx_hash}
                </code>
              </div>

              <a href={`https://tronscan.org/#/transaction/${selectedPayment.tx_hash}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-primary hover:underline text-sm">
                <ExternalLink className="w-4 h-4" />
                View on TronScan
              </a>
            </div>}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSelectedPaymentId(null)}>
              Cancel
            </Button>
            <Button variant="default" className="bg-success hover:bg-success/90" onClick={handleVerify}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirm Verification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>;
};
export default AdminPayments;
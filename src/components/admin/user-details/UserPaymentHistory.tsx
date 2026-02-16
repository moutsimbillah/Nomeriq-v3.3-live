import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, ExternalLink, CheckCircle, XCircle, Clock, Eye, Shield, TrendingUp, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useGlobalSettings } from "@/hooks/useGlobalSettings";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
  payment_method?: string | null;
  provider_session_id?: string | null;
  provider_payment_id?: string | null;
  package?: {
    name?: string | null;
    duration_type?: string | null;
  } | null;
  user_bank_account_name?: string | null;
  user_bank_account_number?: string | null;
  user_bank_name?: string | null;
}

interface UserPaymentHistoryProps {
  payments: Payment[];
  isLoading: boolean;
}

export const UserPaymentHistory = ({ payments, isLoading }: UserPaymentHistoryProps) => {
  const { settings } = useGlobalSettings();
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [rowsPerPage, setRowsPerPage] = useState<string>("10");
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => {
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    return Math.max(1, Math.ceil(payments.length / size));
  }, [payments.length, rowsPerPage]);

  const paginatedPayments = useMemo(() => {
    const size = Math.max(1, parseInt(rowsPerPage, 10));
    const start = (page - 1) * size;
    return payments.slice(start, start + size);
  }, [payments, rowsPerPage, page]);

  useEffect(() => {
    setPage(1);
  }, [payments.length, rowsPerPage]);

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="glass-card p-6 shadow-none">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          Payment History
        </h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-secondary/30 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="glass-card shadow-none overflow-hidden">
        <div className="p-6 border-b border-border/50 flex items-center justify-between gap-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Payment History ({payments.length})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Rows</span>
            <Select value={rowsPerPage} onValueChange={setRowsPerPage}>
              <SelectTrigger className="h-8 w-[90px] bg-secondary/40 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {payments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No payment records found</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
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
                {paginatedPayments.map((payment) => (
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
                        {payment.package?.name || "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm capitalize">
                        {payment.package?.duration_type === "lifetime"
                          ? "Lifetime"
                          : payment.package?.duration_type === "monthly"
                          ? "Monthly"
                          : payment.package?.duration_type === "yearly"
                          ? "Yearly"
                          : "-"}
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
                        {payment.status === "pending" && <Clock className="w-3 h-3 mr-1" />}
                        {payment.status === "verified" && <CheckCircle className="w-3 h-3 mr-1" />}
                        {payment.status === "rejected" && <XCircle className="w-3 h-3 mr-1" />}
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
        {payments.length > 0 && (
          <div className="px-6 py-4 border-t border-border/40 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
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
                    {selectedPayment.status === "verified" && <CheckCircle className="w-3 h-3 mr-1" />}
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
                    {selectedPayment.package?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Duration</p>
                  <p className="text-sm font-semibold capitalize">
                    {selectedPayment.package?.duration_type === "lifetime"
                      ? "Lifetime"
                      : selectedPayment.package?.duration_type === "monthly"
                      ? "Monthly"
                      : selectedPayment.package?.duration_type === "yearly"
                      ? "Yearly"
                      : "-"}
                  </p>
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
                      <CheckCircle className="w-5 h-5 text-success" />
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
    </>
  );
};

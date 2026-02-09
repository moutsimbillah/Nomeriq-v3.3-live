import { Badge } from "@/components/ui/badge";
import { Receipt, ExternalLink, CheckCircle, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface Payment {
  id: string;
  amount: number;
  currency: string;
  tx_hash: string;
  status: string;
  created_at: string;
  verified_at: string | null;
  rejection_reason: string | null;
}

interface UserPaymentHistoryProps {
  payments: Payment[];
  isLoading: boolean;
}

export const UserPaymentHistory = ({ payments, isLoading }: UserPaymentHistoryProps) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return (
          <Badge variant="outline" className="border-success/30 text-success bg-success/10">
            <CheckCircle className="w-3 h-3 mr-1" />
            Verified
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10">
            <XCircle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-warning/30 text-warning bg-warning/10">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const truncateTxHash = (hash: string) => {
    if (hash.length <= 16) return hash;
    return `${hash.slice(0, 8)}...${hash.slice(-8)}`;
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
    <div className="glass-card p-6 shadow-none">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Receipt className="w-4 h-4 text-primary" />
        Payment History ({payments.length})
      </h3>
      
      {payments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Receipt className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No payment records found</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {payments.map((payment) => (
            <div 
              key={payment.id} 
              className={cn(
                "p-3 rounded-lg bg-secondary/30 space-y-2",
                payment.status === "rejected" && "border border-destructive/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg">
                    ${payment.amount.toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {payment.currency}
                  </span>
                </div>
                {getStatusBadge(payment.status)}
              </div>
              
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {format(new Date(payment.created_at), "MMM dd, yyyy HH:mm")}
                </span>
                <a 
                  href={`https://tronscan.org/#/transaction/${payment.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  {truncateTxHash(payment.tx_hash)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {payment.status === "verified" && payment.verified_at && (
                <div className="text-xs text-success">
                  Verified on {format(new Date(payment.verified_at), "MMM dd, yyyy HH:mm")}
                </div>
              )}

              {payment.status === "rejected" && payment.rejection_reason && (
                <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                  Reason: {payment.rejection_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

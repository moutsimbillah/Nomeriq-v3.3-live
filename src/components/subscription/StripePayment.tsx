import { CreditCard } from "lucide-react";

interface StripePaymentProps {
    subscriptionPrice: number;
}

export const StripePayment = ({ subscriptionPrice }: StripePaymentProps) => {
    return (
        <div className="space-y-4">
            <div className="p-3 rounded-xl bg-secondary/50">
                <p className="text-sm text-muted-foreground mb-1">
                    Payment Amount
                </p>
                <p className="text-xl font-bold">${subscriptionPrice}</p>
            </div>

            <div className="p-8 rounded-xl bg-primary/5 border border-primary/10 text-center">
                <CreditCard className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Stripe Integration Coming Soon</h3>
                <p className="text-sm text-muted-foreground">
                    Credit and debit card payments via Stripe will be available soon.
                    Please use an alternative payment method for now.
                </p>
            </div>

            <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                <p className="text-xs text-warning leading-relaxed">
                    ℹ️ This payment method is currently being configured. Please contact support
                    or use USDT or Bank Transfer to subscribe.
                </p>
            </div>
        </div>
    );
};

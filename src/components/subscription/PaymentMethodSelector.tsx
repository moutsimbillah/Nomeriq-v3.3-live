import { CreditCard, Building2, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaymentMethod = 'usdt_trc20' | 'bank_transfer' | 'stripe';

interface PaymentMethodSelectorProps {
    selectedMethod: PaymentMethod;
    onMethodChange: (method: PaymentMethod) => void;
    enabledMethods: {
        usdt_trc20: boolean;
        bank_transfer: boolean;
        stripe: boolean;
    };
}

export const PaymentMethodSelector = ({
    selectedMethod,
    onMethodChange,
    enabledMethods,
}: PaymentMethodSelectorProps) => {
    const methods = [
        {
            id: 'usdt_trc20' as PaymentMethod,
            name: 'USDT (TRC20)',
            description: 'Cryptocurrency payment',
            icon: Wallet,
            enabled: enabledMethods.usdt_trc20,
        },
        {
            id: 'bank_transfer' as PaymentMethod,
            name: 'Bank Transfer',
            description: 'Traditional bank payment',
            icon: Building2,
            enabled: enabledMethods.bank_transfer,
        },
        {
            id: 'stripe' as PaymentMethod,
            name: 'Card Payment',
            description: 'Credit/Debit card via Stripe',
            icon: CreditCard,
            enabled: enabledMethods.stripe,
        },
    ].filter(method => method.enabled);

    // If no methods are enabled, show a message
    if (methods.length === 0) {
        return (
            <div className="p-4 rounded-xl bg-warning/10 border border-warning/20 text-center">
                <p className="text-sm text-warning">
                    No payment methods are currently enabled. Please contact support.
                </p>
            </div>
        );
    }

    // If only one method is enabled, auto-select it
    if (methods.length === 1 && selectedMethod !== methods[0].id) {
        onMethodChange(methods[0].id);
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {methods.map((method) => {
                    const Icon = method.icon;
                    const isSelected = selectedMethod === method.id;

                    return (
                        <button
                            key={method.id}
                            onClick={() => onMethodChange(method.id)}
                            className={cn(
                                "p-4 rounded-xl border-2 transition-all text-left",
                                isSelected
                                    ? "border-primary bg-primary/10"
                                    : "border-border/50 bg-secondary/30 hover:border-primary/50"
                            )}
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <Icon className={cn(
                                    "w-5 h-5",
                                    isSelected ? "text-primary" : "text-muted-foreground"
                                )} />
                                <span className="text-sm font-semibold">{method.name}</span>
                            </div>
                            <p className="text-xs text-muted-foreground">{method.description}</p>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

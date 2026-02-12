import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface UsdtPaymentProps {
    walletAddress: string;
    subscriptionPrice: number;
    onSubmit: (txHash: string, paymentMethod: string) => Promise<void>;
    isSubmitting: boolean;
}

export const UsdtPayment = ({
    walletAddress,
    subscriptionPrice,
    onSubmit,
    isSubmitting,
}: UsdtPaymentProps) => {
    const [txHash, setTxHash] = useState("");
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(walletAddress);
        setCopied(true);
        toast.success("Wallet address copied!");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSubmit = async () => {
        await onSubmit(txHash.trim(), 'usdt_trc20');
        setTxHash("");
    };

    return (
        <div className="space-y-4">
            <div className="p-3 rounded-xl bg-secondary/50">
                <p className="text-sm text-muted-foreground mb-1">
                    Payment Amount
                </p>
                <p className="text-xl font-bold">{subscriptionPrice} USDT</p>
                <p className="text-xs text-muted-foreground mt-1">
                    TRC20 Network Only
                </p>
            </div>

            <div>
                <Label className="text-sm text-muted-foreground">
                    Send USDT (TRC20) to this address:
                </Label>
                <div className="flex gap-2 mt-2">
                    <Input
                        value={walletAddress}
                        readOnly
                        className="font-mono text-sm bg-secondary/50"
                    />
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopy}
                        className="shrink-0"
                    >
                        {copied ? (
                            <Check className="w-4 h-4 text-success" />
                        ) : (
                            <Copy className="w-4 h-4" />
                        )}
                    </Button>
                </div>
            </div>

            <div>
                <Label htmlFor="txHash">Transaction Hash</Label>
                <Input
                    id="txHash"
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="Enter your TRC20 transaction hash"
                    className="mt-2 bg-secondary/50"
                />
                <p className="text-xs text-muted-foreground mt-2">
                    After sending payment, paste your transaction hash above for
                    verification.
                </p>
            </div>

            <Button
                size="lg"
                variant="default"
                className="w-full bg-primary hover:bg-primary/90 text-white"
                disabled={!txHash.trim() || isSubmitting}
                onClick={handleSubmit}
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Submitting...
                    </>
                ) : (
                    <>
                        Submit for Verification
                        <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                )}
            </Button>

            <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                <p className="text-xs text-warning leading-relaxed">
                    ⚠️ Admin will verify your payment within 24 hours. Your
                    subscription will be activated automatically after verification.
                </p>
            </div>
        </div>
    );
};

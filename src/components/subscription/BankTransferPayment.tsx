import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";

interface BankTransferPaymentProps {
    bankAccountName: string;
    bankAccountNumber: string;
    bankName: string;
    subscriptionPrice: number;
    onSubmit: (data: {
        userBankAccountName: string;
        userBankAccountNumber: string;
        userBankName: string;
        referenceNumber: string;
    }) => Promise<void>;
    isSubmitting: boolean;
}

export const BankTransferPayment = ({
    bankAccountName,
    bankAccountNumber,
    bankName,
    subscriptionPrice,
    onSubmit,
    isSubmitting,
}: BankTransferPaymentProps) => {
    const [userBankAccountName, setUserBankAccountName] = useState("");
    const [userBankAccountNumber, setUserBankAccountNumber] = useState("");
    const [userBankName, setUserBankName] = useState("");
    const [referenceNumber, setReferenceNumber] = useState("");

    const handleSubmit = async () => {
        await onSubmit({
            userBankAccountName,
            userBankAccountNumber,
            userBankName,
            referenceNumber,
        });
        // Clear form on success
        setUserBankAccountName("");
        setUserBankAccountNumber("");
        setUserBankName("");
        setReferenceNumber("");
    };

    const isFormValid = userBankAccountName.trim() && userBankAccountNumber.trim() && userBankName.trim() && referenceNumber.trim();

    return (
        <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
                <div className="p-3 rounded-xl bg-secondary/50">
                    <p className="text-sm text-muted-foreground mb-1">
                        Payment Amount
                    </p>
                    <p className="text-xl font-bold">${subscriptionPrice}</p>
                </div>

                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
                    <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                        <span className="text-sm text-muted-foreground">Account Holder</span>
                        <span className="font-semibold text-sm">{bankAccountName}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                        <span className="text-sm text-muted-foreground">Account Number</span>
                        <span className="font-mono font-semibold text-sm">{bankAccountNumber}</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Bank Name</span>
                        <span className="font-semibold text-sm">{bankName}</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
                    <p className="text-xs text-warning leading-relaxed text-center">
                        ⚠️ Admin will verify your payment within 24 hours. Your
                        subscription will be activated automatically after verification.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div>
                    <Label htmlFor="userBankAccountName">Your Full Name</Label>
                    <Input
                        id="userBankAccountName"
                        value={userBankAccountName}
                        onChange={(e) => setUserBankAccountName(e.target.value)}
                        placeholder="John Doe"
                        className="mt-2 bg-secondary/50"
                    />
                </div>

                <div>
                    <Label htmlFor="userBankAccountNumber">Your Account Number</Label>
                    <Input
                        id="userBankAccountNumber"
                        value={userBankAccountNumber}
                        onChange={(e) => setUserBankAccountNumber(e.target.value)}
                        placeholder="1234567890"
                        className="mt-2 bg-secondary/50 font-mono"
                    />
                </div>

                <div>
                    <Label htmlFor="userBankName">Your Bank Name</Label>
                    <Input
                        id="userBankName"
                        value={userBankName}
                        onChange={(e) => setUserBankName(e.target.value)}
                        placeholder="Bank of America"
                        className="mt-2 bg-secondary/50"
                    />
                </div>

                <div>
                    <Label htmlFor="referenceNumber">Transaction ID/Reference</Label>
                    <Input
                        id="referenceNumber"
                        value={referenceNumber}
                        onChange={(e) => setReferenceNumber(e.target.value)}
                        placeholder="Enter reference number"
                        className="mt-2 bg-secondary/50"
                    />
                </div>

                <Button
                    size="lg"
                    variant="default"
                    className="w-full bg-primary hover:bg-primary/90 mt-2 text-white"
                    disabled={!isFormValid || isSubmitting}
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
            </div>


        </div>
    );
};

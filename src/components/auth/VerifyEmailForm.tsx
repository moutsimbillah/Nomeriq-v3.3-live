import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, Mail, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface VerifyEmailFormProps {
    email?: string;
    onBackToLogin?: () => void;
    onClose?: () => void;
}

export const VerifyEmailForm = ({ email: initialEmail, onBackToLogin, onClose }: VerifyEmailFormProps) => {
    const [email, setEmail] = useState(initialEmail || "");
    const [code, setCode] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const { openModal } = useAuthModal();

    // Auto-submit when 6 digits entered
    useEffect(() => {
        if (code.length === 6 && !isVerifying && !isVerified && email) {
            handleVerify();
        }
    }, [code, isVerifying, isVerified, email]);

    const handleVerify = async () => {
        if (code.length !== 6 || isVerifying || isVerified) {
            if (code.length !== 6) {
                toast({
                    title: "Invalid Code",
                    description: "Please enter the 6-digit verification code.",
                    variant: "destructive",
                });
            }
            return;
        }

        setIsVerifying(true);

        try {
            const { data, error } = await supabase.functions.invoke("verify-email-token", {
                body: { email, code },
            });

            if (error) {
                console.error("Verification function error:", error);
                toast({
                    title: "Verification Failed",
                    description: "Invalid or expired verification code. Please try again.",
                    variant: "destructive",
                });
                setCode("");
                setIsVerifying(false);
                return;
            }

            if (data?.error) {
                toast({
                    title: "Verification Failed",
                    description: data.error.includes("expired")
                        ? "Verification code has expired. Please request a new one."
                        : "Invalid verification code. Please check and try again.",
                    variant: "destructive",
                });
                setCode("");
                setIsVerifying(false);
                return;
            }

            setIsVerified(true);
            toast({
                title: "Email Verified!",
                description: "Your email has been verified. You can now sign in.",
            });

            setTimeout(() => {
                if (onClose) onClose();
                openModal("login");
            }, 2000);
        } catch (err) {
            console.error("Verification error:", err);
            toast({
                title: "Verification Failed",
                description: "Invalid or expired verification code. Please try again.",
                variant: "destructive",
            });
            setCode("");
            setIsVerifying(false);
        }
    };

    const handleResend = async () => {
        if (!email) {
            toast({
                title: "Error",
                description: "Email address not found. Please sign up again.",
                variant: "destructive",
            });
            return;
        }

        setIsResending(true);

        try {
            const { data, error } = await supabase.functions.invoke("send-verification-email", {
                body: { email },
            });

            if (error) {
                console.error("Resend function error:", error);
                toast({
                    title: "Unable to Send Code",
                    description: "Please wait a moment and try again.",
                    variant: "destructive",
                });
                return;
            }

            if (data?.error) {
                console.error("Resend response error:", data.error);
                toast({
                    title: "Unable to Send Code",
                    description: data.error.includes("rate") || data.error.includes("Too many")
                        ? "Too many attempts. Please wait before trying again."
                        : "Please wait a moment and try again.",
                    variant: "destructive",
                });
                return;
            }

            toast({
                title: "Code Sent",
                description: "A new verification code has been sent to your email.",
            });
        } catch (err) {
            console.error("Resend error:", err);
            toast({
                title: "Unable to Send Code",
                description: "Please wait a moment and try again.",
                variant: "destructive",
            });
        } finally {
            setIsResending(false);
        }
    };

    if (isVerified) {
        return (
            <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-success/20 to-success/5 border border-success/20 mb-5">
                    <CheckCircle className="w-7 h-7 text-success" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">Email Verified!</h2>
                <p className="text-sm text-muted-foreground mb-6">
                    Redirecting you to sign in...
                </p>
                <div className="flex justify-center">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5">
                <Mail className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Verify Your Email</h2>
            <p className="text-sm text-muted-foreground mb-2">
                We've sent a 6-digit code to
            </p>
            {email && (
                <p className="font-medium text-foreground mb-6">{email}</p>
            )}

            <div className="flex justify-center mb-6">
                <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={(value) => setCode(value)}
                    disabled={isVerifying}
                >
                    <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                    </InputOTPGroup>
                </InputOTP>
            </div>

            <Button
                onClick={handleVerify}
                className="w-full h-12 font-medium mb-4 text-white"
                disabled={isVerifying || code.length !== 6}
            >
                {isVerifying ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                    "Verify Email"
                )}
            </Button>

            <div className="p-4 rounded-xl glass border border-black/10 dark:border-white/10 mb-4">
                <p className="text-xs text-muted-foreground">
                    Didn't receive the code? Check your spam folder or click below to resend.
                </p>
            </div>

            <Button
                variant="outline"
                className="w-full h-12 font-medium text-white"
                onClick={handleResend}
                disabled={isResending}
            >
                {isResending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Resend Code
            </Button>

            {/* Back to Login */}
            <div className="mt-4">
                <button
                    onClick={onBackToLogin ? onBackToLogin : () => openModal("login")}
                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                    Back to Sign In
                </button>
            </div>
        </div>
    );
};

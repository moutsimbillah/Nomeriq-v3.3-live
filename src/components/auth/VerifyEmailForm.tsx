import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle, Mail, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useOptionalAuthModal } from "@/contexts/AuthModalContext";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

interface VerifyEmailFormProps {
    email?: string;
    onBackToLogin?: () => void;
    onClose?: () => void;
}

const getPendingVerificationEmail = () => {
    if (typeof window === "undefined") return "";
    return (window.sessionStorage.getItem("pending_verification_email") || "").trim().toLowerCase();
};

const extractFunctionErrorMessage = async (error: unknown, fallback: string): Promise<string> => {
    if (error && typeof error === "object" && "context" in error) {
        const response = (error as { context?: unknown }).context;
        if (response instanceof Response) {
            try {
                const json = await response.clone().json();
                if (json && typeof json === "object") {
                    if ("error" in json && typeof (json as { error?: unknown }).error === "string") {
                        return (json as { error: string }).error;
                    }
                    if ("message" in json && typeof (json as { message?: unknown }).message === "string") {
                        return (json as { message: string }).message;
                    }
                }
            } catch {
                // Ignore and fallback.
            }
        }
    }

    if (error && typeof error === "object" && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string" && message.trim()) {
            return message;
        }
    }

    return fallback;
};

export const VerifyEmailForm = ({ email: initialEmail, onBackToLogin, onClose }: VerifyEmailFormProps) => {
    const normalizedInitialEmail = (initialEmail || "").trim().toLowerCase();
    const email = normalizedInitialEmail || getPendingVerificationEmail();
    const [code, setCode] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);
    const [isResending, setIsResending] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const authModal = useOptionalAuthModal();

    useEffect(() => {
        if (typeof window === "undefined" || !email) return;
        window.sessionStorage.setItem("pending_verification_email", email);
    }, [email]);

    const handleVerify = useCallback(async () => {
        const emailToVerify = email || getPendingVerificationEmail();

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

        if (!emailToVerify) {
            toast({
                title: "Email Required",
                description: "Please enter your email address first.",
                variant: "destructive",
            });
            return;
        }

        setIsVerifying(true);

        try {
            const { data, error } = await supabase.functions.invoke("verify-email-token", {
                body: { email: emailToVerify, code },
            });

            if (error) {
                console.error("Verification function error:", error);
                const reason = await extractFunctionErrorMessage(error, "Invalid or expired verification code. Please try again.");
                const isRateLimited =
                    reason.toLowerCase().includes("too many") || reason.toLowerCase().includes("rate");
                toast({
                    title: "Verification Failed",
                    description: isRateLimited
                        ? "Too many verification attempts. Please wait before trying again."
                        : reason,
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
            if (typeof window !== "undefined") {
                window.sessionStorage.removeItem("pending_verification_email");
            }
            toast({
                title: "Email Verified!",
                description: "Your email has been verified. You can now sign in.",
            });

            setTimeout(() => {
                if (onClose) onClose();
                if (authModal) {
                    authModal.openModal("login");
                    return;
                }
                navigate("/login");
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
    }, [authModal, code, email, isVerified, isVerifying, navigate, onClose, toast]);

    // Auto-submit when 6 digits entered
    useEffect(() => {
        if (code.length === 6 && !isVerifying && !isVerified && email) {
            void handleVerify();
        }
    }, [code, email, handleVerify, isVerified, isVerifying]);

    const handleResend = async () => {
        const emailToResend = email || getPendingVerificationEmail();

        if (!emailToResend) {
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
                body: { email: emailToResend },
            });

            if (error) {
                console.error("Resend function error:", error);
                const reason = await extractFunctionErrorMessage(error, "Please wait a moment and try again.");
                const isRateLimited =
                    reason.toLowerCase().includes("too many") || reason.toLowerCase().includes("rate");
                toast({
                    title: "Unable to Send Code",
                    description: isRateLimited
                        ? "Too many code requests. Please wait up to 1 hour before requesting another code."
                        : reason,
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
                className="w-full h-12 font-medium text-foreground"
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
                    onClick={
                        onBackToLogin
                            ? onBackToLogin
                            : () => (authModal ? authModal.openModal("login") : navigate("/login"))
                    }
                    className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                    Back to Sign In
                </button>
            </div>
        </div>
    );
};

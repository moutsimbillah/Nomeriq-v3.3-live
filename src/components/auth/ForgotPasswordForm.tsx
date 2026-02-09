import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuthModal } from "@/contexts/AuthModalContext";

interface ForgotPasswordFormProps {
    onBackToLogin?: () => void;
    onClose?: () => void;
}

export const ForgotPasswordForm = ({ onBackToLogin, onClose }: ForgotPasswordFormProps) => {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const { openModal } = useAuthModal();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { error } = await supabase.functions.invoke("send-password-reset", {
                body: { email },
            });

            if (error) throw error;

            toast({
                title: "Code Sent",
                description: "If an account exists with this email, you'll receive a reset code.",
            });

            if (onClose) onClose();
            navigate("/reset-password", { state: { email } });
        } catch (error) {
            console.error("Error sending password reset:", error);
            toast({
                title: "Error",
                description: "Failed to send password reset code. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-5">
            <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                        Email Address
                    </Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        className="h-12 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>

                <Button
                    type="submit"
                    className="w-full h-12 font-medium text-base text-white"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                        <>
                            Send Reset Code
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                    )}
                </Button>
            </form>

            {/* Footer */}
            <div className="pt-4 border-t border-border/50 text-center">
                <p className="text-sm text-muted-foreground">
                    Remember your password?{" "}
                    <button
                        onClick={onBackToLogin ? onBackToLogin : () => openModal("login")}
                        className="text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                        Sign in
                    </button>
                </p>
            </div>
        </div>
    );
};

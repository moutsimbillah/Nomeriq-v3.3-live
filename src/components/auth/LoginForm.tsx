import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, Shield, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuthModal } from "@/contexts/AuthModalContext";

interface LoginFormProps {
    onSwitchToSignup?: () => void;
    onClose?: () => void;
}

export const LoginForm = ({ onSwitchToSignup, onClose }: LoginFormProps) => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { toast } = useToast();
    const { openModal } = useAuthModal();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });
            if (error) {
                toast({
                    title: "Login Failed",
                    description: error.message || "Invalid email or password",
                    variant: "destructive"
                });
                setIsLoading(false);
                return;
            }

            const userMetadata = data.user?.user_metadata;
            const isCustomVerified = userMetadata?.custom_email_verified === true;
            if (data.user && !isCustomVerified) {
                await supabase.auth.signOut();
                try {
                    await supabase.functions.invoke("send-verification-email", {
                        body: { email }
                    });
                    toast({
                        title: "Verification Required",
                        description: "A new verification code has been sent to your email."
                    });
                } catch (err) {
                    console.error("Error sending verification email:", err);
                    toast({
                        title: "Verification Required",
                        description: "Please verify your email. We couldn't send a new code - try again on the verification page.",
                        variant: "destructive"
                    });
                }
                openModal("verify-email");
                setIsLoading(false);
                return;
            }

            toast({
                title: "Welcome back!",
                description: "You have successfully signed in."
            });
            if (onClose) onClose();
            navigate("/dashboard");
        } catch (err) {
            console.error("Login error:", err);
            toast({
                title: "Login Failed",
                description: "An unexpected error occurred. Please try again.",
                variant: "destructive"
            });
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
                        onChange={e => setEmail(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="password" className="text-sm font-medium">
                            Password
                        </Label>
                        <button
                            type="button"
                            onClick={() => openModal("forgot-password")}
                            className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
                        >
                            Forgot password?
                        </button>
                    </div>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            className="h-12 bg-secondary/50 border-border/50 focus:border-primary/50 pr-12 transition-colors"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

                <Button type="submit" className="w-full h-12 font-medium text-base text-white" disabled={isLoading}>
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                        <>
                            Sign In
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                    )}
                </Button>
            </form>

            {/* Security Note */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5 text-success" />
                <span>Secured with industry-standard encryption</span>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-border/50 text-center">
                <p className="text-sm text-muted-foreground">
                    Don't have an account?{" "}
                    <button
                        onClick={onSwitchToSignup ? onSwitchToSignup : () => openModal("signup")}
                        className="text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                        Create account
                    </button>
                </p>
            </div>
        </div>
    );
};

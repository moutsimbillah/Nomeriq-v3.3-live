import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, ArrowRight, Shield, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuthModal } from "@/contexts/AuthModalContext";
import { countries } from "@/constants/countries";

interface SignupFormProps {
    onSwitchToLogin?: () => void;
    onClose?: () => void;
}

export const SignupForm = ({ onSwitchToLogin, onClose }: SignupFormProps) => {
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [country, setCountry] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();
    const { signUp } = useAuth();
    const { toast } = useToast();
    const { openModal } = useAuthModal();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!agreeTerms) {
            toast({
                title: "Terms Required",
                description: "Please agree to the Terms of Service and Privacy Policy.",
                variant: "destructive"
            });
            return;
        }
        if (password.length < 8) {
            toast({
                title: "Password Requirements",
                description: "Password must be at least 8 characters long.",
                variant: "destructive"
            });
            return;
        }
        setIsLoading(true);

        await supabase.auth.signOut();
        const { error } = await signUp(email, password, firstName, lastName, phone, country);
        if (error) {
            toast({
                title: "Signup Failed",
                description: error.message || "Failed to create account. Please try again.",
                variant: "destructive"
            });
            setIsLoading(false);
            return;
        }

        await supabase.auth.signOut();

        try {
            const { error: emailError } = await supabase.functions.invoke("send-verification-email", {
                body: { email }
            });
            if (emailError) {
                console.error("Error sending verification email:", emailError);
                toast({
                    title: "Account Created",
                    description: "Account created but we couldn't send the verification code. Please try to resend it.",
                    variant: "destructive"
                });
            } else {
                toast({
                    title: "Account Created",
                    description: "Please check your email for the verification code."
                });
            }
        } catch (err) {
            console.error("Error invoking verification function:", err);
        }

        if (onClose) onClose();
        openModal("verify-email");
    };

    return (
        <div className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="firstName" className="text-sm font-medium">
                            First Name
                        </Label>
                        <Input
                            id="firstName"
                            placeholder="John"
                            className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors"
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="lastName" className="text-sm font-medium">
                            Last Name
                        </Label>
                        <Input
                            id="lastName"
                            placeholder="Doe"
                            className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors"
                            value={lastName}
                            onChange={e => setLastName(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                        Email Address
                    </Label>
                    <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">
                        Phone Number <span className="text-muted-foreground font-normal">(Optional)</span>
                    </Label>
                    <Input
                        id="phone"
                        type="tel"
                        placeholder="+1 (555) 123-4567"
                        className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="country" className="text-sm font-medium">
                        Country <span className="text-muted-foreground font-normal">(Optional)</span>
                    </Label>
                    <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors">
                            <SelectValue placeholder="Select your country" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px] z-[9999]">
                            {countries.map((c) => (
                                <SelectItem key={c} value={c}>
                                    {c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">
                        Password
                    </Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            placeholder="Minimum 8 characters"
                            className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 pr-12 transition-colors"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            minLength={8}
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

                {/* Terms Checkbox */}
                <div className="flex items-start gap-3 pt-2">
                    <Checkbox
                        id="terms"
                        className="mt-0.5"
                        checked={agreeTerms}
                        onCheckedChange={checked => setAgreeTerms(checked as boolean)}
                    />
                    <Label htmlFor="terms" className="text-sm text-muted-foreground leading-relaxed font-normal cursor-pointer">
                        I agree to the{" "}
                        <Link to="/terms" className="text-primary hover:text-primary/80 transition-colors">
                            Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link to="/privacy" className="text-primary hover:text-primary/80 transition-colors">
                            Privacy Policy
                        </Link>
                    </Label>
                </div>

                <Button type="submit" className="w-full h-12 font-medium text-base mt-2 text-white" disabled={isLoading}>
                    {isLoading ? (
                        <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                        <>
                            Create Account
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                    )}
                </Button>
            </form>

            {/* Security Note */}
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5 text-success" />
                <span>Your data is protected with enterprise-grade security</span>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-border/50 text-center">
                <p className="text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <button
                        onClick={onSwitchToLogin ? onSwitchToLogin : () => openModal("login")}
                        className="text-primary hover:text-primary/80 font-medium transition-colors"
                    >
                        Sign in
                    </button>
                </p>
            </div>
        </div>
    );
};

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Eye, EyeOff, ArrowRight, Shield, UserPlus, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
const Signup = () => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const {
    signUp
  } = useAuth();
  const {
    toast
  } = useToast();
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

    // Sign out first to prevent any brief authenticated state
    await supabase.auth.signOut();
    const {
      error
    } = await signUp(email, password, firstName, lastName, phone);
    if (error) {
      toast({
        title: "Signup Failed",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive"
      });
      setIsLoading(false);
      return;
    }

    // Immediately sign out to prevent authenticated state
    await supabase.auth.signOut();

    // Send verification code via our edge function
    try {
      const {
        error: emailError
      } = await supabase.functions.invoke("send-verification-email", {
        body: {
          email
        }
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

    // Navigate to verify page with email
    navigate("/verify-email", {
      state: {
        email
      }
    });
  };
  return <AuthLayout alternateAction={{
    text: "Already have an account?",
    linkText: "Sign In",
    href: "/login"
  }}>
    <div className="glass p-8 sm:p-10">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5">
          <UserPlus className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-2">Create Account</h1>
        <p className="text-sm text-muted-foreground">
          Join the platform for signal delivery and analytics
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName" className="text-sm font-medium">
              First Name
            </Label>
            <Input id="firstName" placeholder="John" className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors" value={firstName} onChange={e => setFirstName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName" className="text-sm font-medium">
              Last Name
            </Label>
            <Input id="lastName" placeholder="Doe" className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors" value={lastName} onChange={e => setLastName(e.target.value)} required />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            Email Address
          </Label>
          <Input id="email" type="email" placeholder="you@example.com" className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-sm font-medium">
            Phone Number <span className="text-muted-foreground font-normal">(Optional)</span>
          </Label>
          <Input id="phone" type="tel" placeholder="+1 (555) 123-4567" className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 transition-colors" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">
            Password
          </Label>
          <div className="relative">
            <Input id="password" type={showPassword ? "text" : "password"} placeholder="Minimum 8 characters" className="h-11 bg-secondary/50 border-border/50 focus:border-primary/50 pr-12 transition-colors" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Terms Checkbox */}
        <div className="flex items-start gap-3 pt-2">
          <Checkbox id="terms" className="mt-0.5" checked={agreeTerms} onCheckedChange={checked => setAgreeTerms(checked as boolean)} />
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

        <Button type="submit" className="w-full h-12 font-medium text-base mt-2" disabled={isLoading}>
          {isLoading ? <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" /> : <>
            Create Account
            <ArrowRight className="w-4 h-4 ml-2" />
          </>}
        </Button>
      </form>

      {/* Info Note */}
      <div className="mt-6 p-4 rounded-xl glass border border-black/10 dark:border-white/10">
        <div className="flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Creating an account provides access to the platform.
            Subscription-based access unlocks signal delivery and advanced analytics features.
          </p>
        </div>
      </div>

      {/* Security Note */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Shield className="w-3.5 h-3.5 text-success" />
        <span>Your data is protected with enterprise-grade security</span>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-6 border-t border-border/50 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  </AuthLayout>;
};
export default Signup;
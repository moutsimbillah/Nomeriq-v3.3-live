import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

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

      // Navigate to reset password page with email
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
    <AuthLayout
      alternateAction={{
        text: "Back to",
        linkText: "Sign In",
        href: "/login",
      }}
    >
      <div className="rounded-2xl border border-border/50 bg-background/70 backdrop-blur-xl p-8 sm:p-10 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)]">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Reset Password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a reset code
          </p>
        </div>

        {/* Form */}
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
        <div className="mt-8 pt-6 border-t border-border/50 text-center">
          <p className="text-sm text-muted-foreground">
            Remember your password?{" "}
            <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
};

export default ForgotPassword;

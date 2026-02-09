import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Mail, ArrowRight, RefreshCw } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const SignupSuccess = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || "";
  const [isResending, setIsResending] = useState(false);
  const { toast } = useToast();

  const handleResendCode = async () => {
    if (!email) {
      toast({
        title: "Error",
        description: "Email address not found. Please try signing up again.",
        variant: "destructive",
      });
      return;
    }

    setIsResending(true);

    try {
      const { error } = await supabase.functions.invoke("send-verification-email", {
        body: { email },
      });

      if (error) throw error;

      toast({
        title: "Code Sent",
        description: "A new verification code has been sent to your email.",
      });
    } catch (error) {
      console.error("Error resending verification code:", error);
      toast({
        title: "Error",
        description: "Failed to resend verification code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  const goToVerify = () => {
    navigate("/verify-email", { state: { email } });
  };

  return (
    <AuthLayout
      alternateAction={{
        text: "Already verified?",
        linkText: "Sign In",
        href: "/login",
      }}
    >
      <div className="glass-card p-8 sm:p-10">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5">
            <Mail className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Check Your Email</h1>
          <p className="text-sm text-muted-foreground mb-6">
            We've sent a 6-digit verification code to{" "}
            {email ? (
              <span className="font-medium text-foreground">{email}</span>
            ) : (
              "your email address"
            )}
          </p>

          <div className="space-y-4">
            <Button
              className="w-full h-12 font-medium"
              onClick={goToVerify}
            >
              Enter Verification Code
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>

            <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Didn't receive the code? Check your spam folder or click below to resend.
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full h-12 font-medium"
              onClick={handleResendCode}
              disabled={isResending}
            >
              {isResending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Resend Verification Code
            </Button>

            <Link to="/login">
              <Button variant="ghost" className="w-full h-12 font-medium">
                Back to Sign In
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default SignupSuccess;

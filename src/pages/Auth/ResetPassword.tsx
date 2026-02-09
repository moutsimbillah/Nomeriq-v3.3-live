import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight, Lock, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const ResetPassword = () => {
  const location = useLocation();
  const email = location.state?.email || "";

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [step, setStep] = useState<"code" | "password">("code");
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect to forgot-password if no email provided
  useEffect(() => {
    if (!email) {
      navigate("/forgot-password");
    }
  }, [email, navigate]);

  const [isVerifying, setIsVerifying] = useState(false);

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter the 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsVerifying(true);

    try {
      const response = await supabase.functions.invoke("verify-reset-code", {
        body: { email, code },
      });

      const data = response.data;

      if (!data?.valid) {
        const errorMsg = data?.error === "Code has expired"
          ? "This code has expired. Please request a new one."
          : "The code you entered is incorrect. Please try again.";

        toast({
          title: "Invalid Code",
          description: errorMsg,
          variant: "destructive",
        });
        setCode("");
        return;
      }

      // Code is valid, proceed to password step
      setStep("password");
    } catch (err) {
      console.error("Error verifying code:", err);
      toast({
        title: "Verification Failed",
        description: "Unable to verify the code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: "Passwords Don't Match",
        description: "Please make sure your passwords match.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke("verify-password-reset", {
        body: { email, code, newPassword: password },
      });

      // Handle both error formats from edge function
      const errorMessage = response.data?.error || response.error?.message;

      if (errorMessage) {
        // Map technical errors to user-friendly messages
        let userMessage = "Please try again.";
        if (errorMessage.includes("Invalid or expired") || errorMessage.includes("not found")) {
          userMessage = "The verification code is incorrect or has expired. Please request a new code.";
        } else if (errorMessage.includes("User not found")) {
          userMessage = "We couldn't find an account with this email address.";
        } else if (errorMessage.includes("Password")) {
          userMessage = errorMessage;
        }

        toast({
          title: "Reset Failed",
          description: userMessage,
          variant: "destructive",
        });
        // Go back to code step if the code was invalid
        setStep("code");
        setCode("");
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      toast({
        title: "Password Updated",
        description: "Your password has been successfully reset.",
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      console.error("Error resetting password:", err);
      toast({
        title: "Something went wrong",
        description: "Unable to reset your password. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      toast({
        title: "Error",
        description: "Email address not found. Please start over.",
        variant: "destructive",
      });
      navigate("/forgot-password");
      return;
    }

    setIsResending(true);

    try {
      const { error } = await supabase.functions.invoke("send-password-reset", {
        body: { email },
      });

      if (error) throw error;

      toast({
        title: "Code Sent",
        description: "A new verification code has been sent to your email.",
      });
    } catch (err) {
      console.error("Resend error:", err);
      toast({
        title: "Error",
        description: "Failed to resend code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  // Success state
  if (isSuccess) {
    return (
      <AuthLayout
        alternateAction={{
          text: "Ready to sign in?",
          linkText: "Go to Login",
          href: "/login",
        }}
      >
        <div className="glass p-8 sm:p-10">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-success/20 to-success/5 border border-success/20 mb-5">
              <CheckCircle className="w-7 h-7 text-success" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Password Reset!</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Your password has been successfully updated. Redirecting you to login...
            </p>
            <div className="flex justify-center">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Code verification step
  if (step === "code") {
    return (
      <AuthLayout
        alternateAction={{
          text: "Remember your password?",
          linkText: "Sign In",
          href: "/login",
        }}
      >
        <div className="glass p-8 sm:p-10">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Enter Reset Code</h1>
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
              onClick={handleVerifyCode}
              className="w-full h-12 font-medium mb-4"
              disabled={code.length !== 6 || isVerifying}
            >
              {isVerifying ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  Verify Code
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>

            <div className="p-4 rounded-xl glass border border-black/10 dark:border-white/10 mb-4">
              <p className="text-xs text-muted-foreground">
                Didn't receive the code? Check your spam folder or click below to resend.
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full h-12 font-medium"
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
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Password entry step
  return (
    <AuthLayout
      alternateAction={{
        text: "Remember your password?",
        linkText: "Sign In",
        href: "/login",
      }}
    >
      <div className="glass p-8 sm:p-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Set New Password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your new password below
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              New Password
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Minimum 8 characters"
                className="h-12 bg-secondary/50 border-border/50 focus:border-primary/50 pr-12 transition-colors"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                className="h-12 bg-secondary/50 border-border/50 focus:border-primary/50 pr-12 transition-colors"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showConfirmPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-12 font-medium text-base"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                Reset Password
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => setStep("code")}
          >
            ← Back to code entry
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

export default ResetPassword;

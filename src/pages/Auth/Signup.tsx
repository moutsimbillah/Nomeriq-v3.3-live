import { AuthLayout } from "@/components/auth/AuthLayout";
import { UserPlus } from "lucide-react";
import { SignupForm } from "@/components/auth/SignupForm";

const Signup = () => {
  return (
    <AuthLayout
      alternateAction={{
        text: "Already have an account?",
        linkText: "Sign In",
        href: "/login",
      }}
    >
      <div className="rounded-2xl border border-border/50 bg-background/70 backdrop-blur-xl p-5 sm:p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)]">
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-3">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1.5">Create Your Account</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Join the platform and start receiving professional trading signals.
          </p>
        </div>

        <SignupForm standalone />
      </div>
    </AuthLayout>
  );
};

export default Signup;

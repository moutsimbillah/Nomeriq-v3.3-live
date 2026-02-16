import { useSearchParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";

const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";

  return (
    <AuthLayout
      alternateAction={{
        text: "Back to",
        linkText: "Sign In",
        href: "/login",
      }}
    >
      <div className="rounded-2xl border border-border/50 bg-background/70 backdrop-blur-xl p-8 sm:p-10 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.6)]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 mb-5">
            <MailCheck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Verify Your Email</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code sent to your inbox
          </p>
        </div>

        <VerifyEmailForm email={email} />
      </div>
    </AuthLayout>
  );
};

export default VerifyEmail;

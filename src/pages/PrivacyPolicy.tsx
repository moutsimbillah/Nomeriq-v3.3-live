import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const PrivacyPolicy = () => {
  const [title, setTitle] = useState("Privacy Policy");
  const [content, setContent] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrivacy = async () => {
      const { data } = await supabase
        .from("legal_pages")
        .select("title, content, updated_at")
        .eq("slug", "privacy")
        .maybeSingle();

      if (data) {
        setTitle(data.title || "Privacy Policy");
        setContent(data.content || "");
        setUpdatedAt(data.updated_at || null);
      }
    };

    fetchPrivacy();
  }, []);

  const effectiveDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "February 11, 2026";

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-border/50 bg-background/70 p-6 sm:p-10">
        <div className="mb-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/50 bg-secondary/30 px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Nomeriq Legal
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Effective date: {effectiveDate}</p>
        </div>

        <div className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
          {content || "Privacy policy content will be available soon."}
        </div>

        <div className="mt-10 border-t border-border/50 pt-5 text-sm">
          <Link to="/signup" className="text-primary hover:text-primary/80">
            Back to Signup
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;


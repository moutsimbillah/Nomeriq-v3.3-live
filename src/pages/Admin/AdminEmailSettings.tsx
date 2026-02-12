import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Mail, Loader2, Save, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

type EmailTemplateSettings = {
  id?: string;
  sender_name: string;
  sender_email: string;
  verification_subject: string;
  verification_body: string;
  reset_subject: string;
  reset_body: string;
};

const DEFAULT_SETTINGS: EmailTemplateSettings = {
  sender_name: "nomeriq",
  sender_email: "noreply@nomeriq.com",
  verification_subject: "Your verification code: {{otp_code}}",
  verification_body:
    "Hi {{user_email}},\n\nUse this verification code to activate your account:\n\n{{otp_code}}\n\nThis code expires in {{code_expiry_minutes}} minutes.\n\nIf you did not request this, ignore this message.\n\n- {{brand_name}}",
  reset_subject: "Your {{brand_name}} password reset code",
  reset_body:
    "Hi {{user_email}},\n\nUse this code to reset your password:\n\n{{otp_code}}\n\nThis code expires in {{code_expiry_minutes}} minutes.\n\nIf you did not request this, ignore this message.\n\nSupport: {{support_email}}",
};

const AdminEmailSettings = () => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<EmailTemplateSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingVerification, setIsTestingVerification] = useState(false);
  const [isTestingReset, setIsTestingReset] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("email_template_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      if (error) {
        toast.error("Failed to load email settings");
        setIsLoading(false);
        return;
      }

      if (data) {
        setSettings({
          id: data.id,
          sender_name: data.sender_name || DEFAULT_SETTINGS.sender_name,
          sender_email: data.sender_email || DEFAULT_SETTINGS.sender_email,
          verification_subject: data.verification_subject || DEFAULT_SETTINGS.verification_subject,
          verification_body: data.verification_body || DEFAULT_SETTINGS.verification_body,
          reset_subject: data.reset_subject || DEFAULT_SETTINGS.reset_subject,
          reset_body: data.reset_body || DEFAULT_SETTINGS.reset_body,
        });
      }

      setIsLoading(false);
    };

    fetchSettings();
  }, []);

  const setField = (field: keyof EmailTemplateSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!settings.sender_email.trim()) {
      toast.error("Sender email is required");
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        sender_name: settings.sender_name.trim(),
        sender_email: settings.sender_email.trim(),
        verification_subject: settings.verification_subject.trim(),
        verification_body: settings.verification_body.trim(),
        reset_subject: settings.reset_subject.trim(),
        reset_body: settings.reset_body.trim(),
      };

      if (settings.id) {
        const { error } = await supabase
          .from("email_template_settings")
          .update(payload)
          .eq("id", settings.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("email_template_settings")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) {
          setSettings((prev) => ({ ...prev, id: data.id }));
        }
      }

      toast.success("Email settings saved");
    } catch (error) {
      console.error("Error saving email settings:", error);
      toast.error("Failed to save email settings");
    } finally {
      setIsSaving(false);
    }
  };

  const sendTestTemplate = async (templateType: "verification" | "reset") => {
    const toEmail = user?.email;
    if (!toEmail) {
      toast.error("Unable to detect your admin email");
      return;
    }

    if (templateType === "verification") {
      setIsTestingVerification(true);
    } else {
      setIsTestingReset(true);
    }

    try {
      const { error } = await supabase.functions.invoke("send-test-email-template", {
        body: {
          toEmail,
          templateType,
          templates: settings,
        },
      });

      if (error) throw error;

      toast.success(
        `Test ${templateType === "verification" ? "verification" : "reset"} email sent to ${toEmail}`
      );
    } catch (error) {
      console.error("Error sending test email:", error);
      toast.error("Failed to send test email");
    } finally {
      if (templateType === "verification") {
        setIsTestingVerification(false);
      } else {
        setIsTestingReset(false);
      }
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Email Settings" subtitle="Manage sender identity and OTP email templates">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Email Settings"
      subtitle="Manage Resend sender identity and OTP email templates"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => sendTestTemplate("verification")}
            disabled={isTestingVerification || isTestingReset}
            className="text-white"
          >
            {isTestingVerification ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Test Verification Template
          </Button>
          <Button
            variant="outline"
            onClick={() => sendTestTemplate("reset")}
            disabled={isTestingVerification || isTestingReset}
            className="text-white"
          >
            {isTestingReset ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Test Reset Template
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="text-white">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Templates
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <Card className="border-border/50">
          <div className="border-b border-border/50 p-4">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Sender Configuration</h2>
            </div>
          </div>
          <CardContent className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sender-name">Sender Name</Label>
              <Input
                id="sender-name"
                value={settings.sender_name}
                onChange={(e) => setField("sender_name", e.target.value)}
                placeholder="nomeriq"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender-email">Sender Email</Label>
              <Input
                id="sender-email"
                value={settings.sender_email}
                onChange={(e) => setField("sender_email", e.target.value)}
                placeholder="noreply@nomeriq.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <div className="border-b border-border/50 p-4">
            <h2 className="text-lg font-semibold">Verification Email Template</h2>
          </div>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="verification-subject">Subject</Label>
              <Input
                id="verification-subject"
                value={settings.verification_subject}
                onChange={(e) => setField("verification_subject", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="verification-body">Body</Label>
              <Textarea
                id="verification-body"
                value={settings.verification_body}
                onChange={(e) => setField("verification_body", e.target.value)}
                className="min-h-[220px]"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <div className="border-b border-border/50 p-4">
            <h2 className="text-lg font-semibold">Password Reset Email Template</h2>
          </div>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-2">
              <Label htmlFor="reset-subject">Subject</Label>
              <Input
                id="reset-subject"
                value={settings.reset_subject}
                onChange={(e) => setField("reset_subject", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-body">Body</Label>
              <Textarea
                id="reset-body"
                value={settings.reset_body}
                onChange={(e) => setField("reset_body", e.target.value)}
                className="min-h-[220px]"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 text-warning" />
              <div>
                Available placeholders:
                {" "}
                <code>{"{{brand_name}}"}</code>
                ,{" "}
                <code>{"{{user_email}}"}</code>
                ,{" "}
                <code>{"{{otp_code}}"}</code>
                ,{" "}
                <code>{"{{code_expiry_minutes}}"}</code>
                ,{" "}
                <code>{"{{support_email}}"}</code>
                .
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminEmailSettings;

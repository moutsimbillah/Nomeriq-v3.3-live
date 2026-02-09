import { useState, useEffect, useRef } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Palette,
  Save,
  Loader2,
  Image as ImageIcon,
  Facebook,
  Twitter,
  Instagram,
  Send,
  MessageCircle,
  Mail,
  Copyright,
  FileText,
  Upload,
  Trash2,
  Sun,
  Moon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

const AdminBranding = () => {
  const { settings, refreshSettings } = useBrand();
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLight, setIsUploadingLight] = useState(false);
  const [isUploadingDark, setIsUploadingDark] = useState(false);
  const lightFileInputRef = useRef<HTMLInputElement>(null);
  const darkFileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUrlDark, setLogoUrlDark] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [copyrightName, setCopyrightName] = useState("");
  const [disclaimerText, setDisclaimerText] = useState("");
  const [socialFacebook, setSocialFacebook] = useState("");
  const [socialTwitter, setSocialTwitter] = useState("");
  const [socialInstagram, setSocialInstagram] = useState("");
  const [socialTelegram, setSocialTelegram] = useState("");
  const [socialDiscord, setSocialDiscord] = useState("");

  // Initialize form from settings
  useEffect(() => {
    if (settings) {
      setLogoUrl(settings.logo_url || "");
      setLogoUrlDark(settings.logo_url_dark || "");
      setSupportEmail(settings.support_email || "");
      setCopyrightName(settings.copyright_name || settings.brand_name || "");
      setDisclaimerText(settings.disclaimer_text || "");
      setSocialFacebook(settings.social_facebook || "");
      setSocialTwitter(settings.social_twitter || "");
      setSocialInstagram(settings.social_instagram || "");
      setSocialTelegram(settings.social_telegram || "");
      setSocialDiscord(settings.social_discord || "");
    }
  }, [settings]);

  const handleLogoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'light' | 'dark'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - SVG excluded to prevent XSS attacks
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error("Invalid file type. Please upload JPG, PNG, WebP or GIF.");
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 5MB.");
      return;
    }

    const setIsUploading = type === 'light' ? setIsUploadingLight : setIsUploadingDark;
    const currentUrl = type === 'light' ? logoUrl : logoUrlDark;
    const setUrl = type === 'light' ? setLogoUrl : setLogoUrlDark;

    setIsUploading(true);
    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${type}-${Date.now()}.${fileExt}`;

      // Delete old logo if exists
      if (currentUrl) {
        const oldPath = currentUrl.split('/brand-assets/')[1];
        if (oldPath) {
          await supabase.storage.from('brand-assets').remove([oldPath]);
        }
      }

      // Upload new logo
      const { error: uploadError } = await supabase.storage
        .from('brand-assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('brand-assets')
        .getPublicUrl(fileName);

      setUrl(publicUrl);
      toast.success(`${type === 'light' ? 'Light' : 'Dark'} mode logo uploaded!`);
    } catch (err) {
      console.error('Error uploading logo:', err);
      toast.error("Failed to upload logo");
    } finally {
      setIsUploading(false);
      const ref = type === 'light' ? lightFileInputRef : darkFileInputRef;
      if (ref.current) {
        ref.current.value = '';
      }
    }
  };

  const handleRemoveLogo = async (type: 'light' | 'dark') => {
    const currentUrl = type === 'light' ? logoUrl : logoUrlDark;
    const setUrl = type === 'light' ? setLogoUrl : setLogoUrlDark;

    if (!currentUrl) return;

    try {
      const oldPath = currentUrl.split('/brand-assets/')[1];
      if (oldPath) {
        await supabase.storage.from('brand-assets').remove([oldPath]);
      }
      setUrl("");
      toast.success(`${type === 'light' ? 'Light' : 'Dark'} mode logo removed`);
    } catch (err) {
      console.error('Error removing logo:', err);
      toast.error("Failed to remove logo");
    }
  };

  const handleSave = async () => {
    if (!settings?.id) {
      toast.error("Settings not loaded yet. Please wait and try again.");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('global_settings')
        .update({
          logo_url: logoUrl || null,
          logo_url_dark: logoUrlDark || null,
          support_email: supportEmail.trim() || null,
          copyright_name: copyrightName.trim() || settings.brand_name,
          disclaimer_text: disclaimerText.trim() || null,
          social_facebook: socialFacebook.trim() || null,
          social_twitter: socialTwitter.trim() || null,
          social_instagram: socialInstagram.trim() || null,
          social_telegram: socialTelegram.trim() || null,
          social_discord: socialDiscord.trim() || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id);

      if (error) throw error;

      await refreshSettings();
      toast.success("Branding settings saved successfully!");
    } catch (err) {
      console.error('Error saving branding:', err);
      toast.error(`Failed to save branding settings: ${(err as any).message || 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const LogoUploadCard = ({
    type,
    label,
    icon: Icon,
    logoUrl: url,
    isUploading,
    fileInputRef
  }: {
    type: 'light' | 'dark';
    label: string;
    icon: typeof Sun;
    logoUrl: string;
    isUploading: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
  }) => (
    <div className="space-y-2">
      <Label className="flex items-center gap-2 text-xs">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </Label>
      <div className="flex items-center gap-3">
        {url ? (
          <div className="relative group">
            <div className={`h-12 min-w-[80px] max-w-[140px] rounded-lg border border-border/50 flex items-center justify-center overflow-hidden px-2 ${type === 'dark' ? 'bg-zinc-900' : 'bg-white'}`}>
              <img
                src={url}
                alt={`${label} preview`}
                className="max-h-10 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/placeholder.svg';
                }}
              />
            </div>
            <button
              onClick={() => handleRemoveLogo(type)}
              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        ) : (
          <div className={`h-12 min-w-[80px] rounded-lg border border-dashed border-border flex items-center justify-center ${type === 'dark' ? 'bg-zinc-900/50' : 'bg-muted/30'}`}>
            <ImageIcon className="w-5 h-5 text-muted-foreground" />
          </div>
        )}

        <div className="flex-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => handleLogoUpload(e, type)}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full h-8 text-xs"
          >
            {isUploading ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <Upload className="w-3 h-3 mr-1.5" />
            )}
            {isUploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <AdminLayout title="Branding">
      <div className="max-w-3xl space-y-6">
        {/* Logo Section */}
        <div className="glass-card p-4 shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Palette className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Logo</h3>
              <p className="text-[10px] text-muted-foreground">
                Upload logos for light and dark themes (recommended: horizontal, max height 40px)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LogoUploadCard
              type="light"
              label="Light Mode Logo"
              icon={Sun}
              logoUrl={logoUrl}
              isUploading={isUploadingLight}
              fileInputRef={lightFileInputRef}
            />
            <LogoUploadCard
              type="dark"
              label="Dark Mode Logo"
              icon={Moon}
              logoUrl={logoUrlDark}
              isUploading={isUploadingDark}
              fileInputRef={darkFileInputRef}
            />
          </div>
          <p className="text-[10px] text-muted-foreground mt-3">
            Max 5MB each (JPG, PNG, WebP, GIF). Logos auto-switch based on theme.
          </p>
        </div>

        {/* Social Media Links */}
        <div className="glass-card p-4 shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Facebook className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Social Media</h3>
              <p className="text-[10px] text-muted-foreground">
                Add your social media profile links
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="facebook" className="flex items-center gap-1.5 text-xs">
                <Facebook className="w-3 h-3 text-primary" />
                Facebook
              </Label>
              <Input
                id="facebook"
                value={socialFacebook}
                onChange={(e) => setSocialFacebook(e.target.value)}
                placeholder="https://facebook.com/..."
                className="bg-secondary/50 h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="twitter" className="flex items-center gap-1.5 text-xs">
                <Twitter className="w-3 h-3 text-primary" />
                Twitter / X
              </Label>
              <Input
                id="twitter"
                value={socialTwitter}
                onChange={(e) => setSocialTwitter(e.target.value)}
                placeholder="https://twitter.com/..."
                className="bg-secondary/50 h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="instagram" className="flex items-center gap-1.5 text-xs">
                <Instagram className="w-3 h-3 text-primary" />
                Instagram
              </Label>
              <Input
                id="instagram"
                value={socialInstagram}
                onChange={(e) => setSocialInstagram(e.target.value)}
                placeholder="https://instagram.com/..."
                className="bg-secondary/50 h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="telegram" className="flex items-center gap-1.5 text-xs">
                <Send className="w-3 h-3 text-primary" />
                Telegram
              </Label>
              <Input
                id="telegram"
                value={socialTelegram}
                onChange={(e) => setSocialTelegram(e.target.value)}
                placeholder="https://t.me/..."
                className="bg-secondary/50 h-8 text-xs"
              />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="discord" className="flex items-center gap-1.5 text-xs">
                <MessageCircle className="w-3 h-3 text-primary" />
                Discord
              </Label>
              <Input
                id="discord"
                value={socialDiscord}
                onChange={(e) => setSocialDiscord(e.target.value)}
                placeholder="https://discord.gg/..."
                className="bg-secondary/50 h-8 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Contact & Legal */}
        <div className="glass-card p-4 shadow-none">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-success/10">
              <Mail className="w-4 h-4 text-success" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Contact & Legal</h3>
              <p className="text-[10px] text-muted-foreground">
                Configure contact and legal information
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="supportEmail" className="flex items-center gap-1.5 text-xs">
                <Mail className="w-3 h-3" />
                Support Email
              </Label>
              <Input
                id="supportEmail"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="support@yourdomain.com"
                className="bg-secondary/50 h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="copyrightName" className="flex items-center gap-1.5 text-xs">
                <Copyright className="w-3 h-3" />
                Copyright Name
              </Label>
              <Input
                id="copyrightName"
                value={copyrightName}
                onChange={(e) => setCopyrightName(e.target.value)}
                placeholder="Your Company Name"
                className="bg-secondary/50 h-8 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">
                Appears in footer copyright notice
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="disclaimerText" className="flex items-center gap-1.5 text-xs">
                <FileText className="w-3 h-3" />
                Disclaimer Text
              </Label>
              <Textarea
                id="disclaimerText"
                value={disclaimerText}
                onChange={(e) => setDisclaimerText(e.target.value)}
                placeholder="Enter your disclaimer text..."
                className="bg-secondary/50 min-h-[60px] text-xs"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end">
          <Button onClick={handleSave} variant="gradient" size="sm" disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1.5" />
            )}
            {isSaving ? "Saving..." : "Save Branding"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminBranding;

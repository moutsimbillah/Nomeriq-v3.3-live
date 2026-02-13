import { useBrand } from "@/contexts/BrandContext";
import { Facebook, Twitter, Instagram, Send, MessageCircle, Mail } from "lucide-react";
import { buildSocialUrl } from "@/lib/social";
import { BrandedLogo } from "@/components/landing/BrandedLogo";

export const Footer = () => {
  const { settings } = useBrand();

  const socialLinks = [
    { icon: Facebook, url: buildSocialUrl(settings?.social_facebook, "facebook"), label: "Facebook" },
    { icon: Twitter, url: buildSocialUrl(settings?.social_twitter, "twitter"), label: "Twitter" },
    { icon: Instagram, url: buildSocialUrl(settings?.social_instagram, "instagram"), label: "Instagram" },
    { icon: Send, url: buildSocialUrl(settings?.social_telegram, "telegram"), label: "Telegram" },
    { icon: MessageCircle, url: buildSocialUrl(settings?.social_discord, "discord"), label: "Discord" },
  ].filter((link) => !!link.url);

  const currentYear = new Date().getFullYear();
  const copyrightName = settings?.copyright_name || "nomeriq";
  const disclaimerText = settings?.disclaimer_text ||
    "Trading involves substantial risk and is not suitable for every investor. Past performance is not indicative of future results.";

  return (
    <footer className="w-full py-8 px-6 border-t border-border bg-background">
      <div className="max-w-[1400px] mx-auto flex flex-col items-center gap-6">
        <p className="text-[10px] leading-relaxed text-center text-muted-foreground max-w-4xl">
          {disclaimerText}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground w-full">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <BrandedLogo className="h-5 w-auto" />
            </div>
          </div>

          <span>|</span>
          <span>© {currentYear} {copyrightName}</span>
          <span>|</span>

          <div className="flex items-center gap-4">
            {socialLinks.map((link, index) => (
              <a
                key={index}
                href={link.url!}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-primary transition-colors flex items-center gap-1"
                aria-label={link.label}
              >
                <link.icon className="w-4 h-4" />
              </a>
            ))}
          </div>

          <div className="h-4 w-px bg-border mx-2" />

          {settings?.support_email ? (
            <a
              href={`mailto:${settings.support_email}`}
              className="hover:text-primary transition-colors flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              <span>Contact</span>
            </a>
          ) : (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span>Contact</span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};

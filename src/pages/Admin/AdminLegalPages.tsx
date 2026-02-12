import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FileText, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type LegalSlug = "terms" | "privacy";

type LegalPageForm = {
  id?: string;
  slug: LegalSlug;
  title: string;
  content: string;
};

const EMPTY_PAGES: Record<LegalSlug, LegalPageForm> = {
  terms: { slug: "terms", title: "Terms of Service", content: "" },
  privacy: { slug: "privacy", title: "Privacy Policy", content: "" },
};

const AdminLegalPages = () => {
  const [pages, setPages] = useState<Record<LegalSlug, LegalPageForm>>(EMPTY_PAGES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const orderedPages = useMemo(
    () => [pages.terms, pages.privacy],
    [pages]
  );

  useEffect(() => {
    const fetchPages = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("legal_pages")
        .select("id, slug, title, content")
        .in("slug", ["terms", "privacy"]);

      if (error) {
        toast.error("Failed to load legal pages");
        setIsLoading(false);
        return;
      }

      const next = { ...EMPTY_PAGES };
      for (const row of data || []) {
        if (row.slug === "terms" || row.slug === "privacy") {
          next[row.slug] = {
            id: row.id,
            slug: row.slug,
            title: row.title || (row.slug === "terms" ? "Terms of Service" : "Privacy Policy"),
            content: row.content || "",
          };
        }
      }
      setPages(next);
      setIsLoading(false);
    };

    fetchPages();
  }, []);

  const updatePageField = (slug: LegalSlug, field: "title" | "content", value: string) => {
    setPages((prev) => ({
      ...prev,
      [slug]: {
        ...prev[slug],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      for (const page of orderedPages) {
        if (page.id) {
          const { error } = await supabase
            .from("legal_pages")
            .update({
              title: page.title.trim(),
              content: page.content.trim(),
            })
            .eq("id", page.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("legal_pages")
            .insert({
              slug: page.slug,
              title: page.title.trim(),
              content: page.content.trim(),
            });
          if (error) throw error;
        }
      }
      toast.success("Legal pages updated");
    } catch (error) {
      console.error("Error saving legal pages:", error);
      toast.error("Failed to save legal pages");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Legal Pages" subtitle="Manage Terms of Service and Privacy Policy content">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Legal Pages"
      subtitle="Manage Terms of Service and Privacy Policy content"
      action={
        <Button onClick={handleSave} disabled={isSaving} className="text-white">
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6">
        {orderedPages.map((page) => (
          <Card key={page.slug} className="border-border/50">
            <div className="border-b border-border/50 p-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">
                  {page.slug === "terms" ? "Terms of Service" : "Privacy Policy"}
                </h2>
              </div>
            </div>
            <CardContent className="space-y-4 p-6">
              <div className="space-y-2">
                <Label htmlFor={`${page.slug}-title`}>Page Title</Label>
                <Input
                  id={`${page.slug}-title`}
                  value={page.title}
                  onChange={(e) => updatePageField(page.slug, "title", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${page.slug}-content`}>Page Content</Label>
                <Textarea
                  id={`${page.slug}-content`}
                  value={page.content}
                  onChange={(e) => updatePageField(page.slug, "content", e.target.value)}
                  className="min-h-[360px]"
                  placeholder="Enter legal content..."
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
};

export default AdminLegalPages;


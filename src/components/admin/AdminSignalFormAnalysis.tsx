import * as React from "react";
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Youtube, FileText, ImageIcon, ChevronDown, ChevronUp, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AnalysisFormData {
  analysisVideoUrl: string;
  analysisNotes: string;
  analysisImageUrl: string;
}

interface AdminSignalFormAnalysisProps {
  formData: AnalysisFormData;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
}

export const AdminSignalFormAnalysis = React.memo(function AdminSignalFormAnalysis({
  formData,
  setFormData,
}: AdminSignalFormAnalysisProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasAnyContent = formData.analysisVideoUrl || formData.analysisNotes || formData.analysisImageUrl;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      toast.error("Only JPEG and PNG images are allowed");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `analysis/${fileName}`;

      const { data, error } = await supabase.storage
        .from('signal-analysis')
        .upload(filePath, file);

      if (error) throw error;

      // Get public URL
      const { data: publicUrlData } = supabase.storage
        .from('signal-analysis')
        .getPublicUrl(filePath);

      setFormData((prev: any) => ({
        ...prev,
        analysisImageUrl: publicUrlData.publicUrl
      }));

      toast.success("Image uploaded successfully");
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error("Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeImage = () => {
    setFormData((prev: any) => ({
      ...prev,
      analysisImageUrl: ''
    }));
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
        >
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Analysis Content (Optional)
            {hasAnyContent && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                Added
              </span>
            )}
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-4 space-y-4">
        {/* YouTube Video URL */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Youtube className="w-4 h-4 text-destructive" />
            YouTube Video URL
          </Label>
          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={formData.analysisVideoUrl}
            onChange={(e) => setFormData((prev: any) => ({ 
              ...prev, 
              analysisVideoUrl: e.target.value 
            }))}
            className="bg-secondary/50"
          />
          <p className="text-xs text-muted-foreground">
            Paste a YouTube link to embed video analysis
          </p>
        </div>

        {/* Analysis Notes */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Analysis Notes
          </Label>
          <Textarea
            placeholder="Write your trade analysis, reasoning, key levels to watch..."
            value={formData.analysisNotes}
            onChange={(e) => setFormData((prev: any) => ({ 
              ...prev, 
              analysisNotes: e.target.value 
            }))}
            className="bg-secondary/50 min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">
            Detailed notes will be expandable when viewed
          </p>
        </div>

        {/* Image Upload */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-success" />
            Chart/Image (JPEG or PNG)
          </Label>
          
          {formData.analysisImageUrl ? (
            <div className="relative">
              <img
                src={formData.analysisImageUrl}
                alt="Analysis preview"
                className="w-full h-32 object-cover rounded-lg border border-border"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={removeImage}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Uploading...</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Click to upload chart screenshot
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JPEG or PNG, max 5MB
                  </p>
                </>
              )}
            </div>
          )}
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={handleImageUpload}
            disabled={isUploading}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
});

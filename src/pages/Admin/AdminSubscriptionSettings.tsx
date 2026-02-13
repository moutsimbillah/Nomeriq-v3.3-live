import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSubscriptionPackages, SubscriptionPackageWithFeatures } from "@/hooks/useSubscriptionPackages";
import { SignalCategory } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { getSafeErrorMessage } from "@/lib/error-sanitizer";

interface EditableFeature {
  id?: string;
  feature_text: string;
}

const AdminSubscriptionSettings = () => {
  const { packages, isLoading, error, refetch } = useSubscriptionPackages({
    statusFilter: 'all',
  });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SubscriptionPackageWithFeatures | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  const [formState, setFormState] = useState<{
    name: string;
    description: string;
    status: "active" | "inactive";
    price: string;
    currency: string;
    duration_type: "monthly" | "yearly" | "lifetime";
    duration_months: string;
    availability: "single" | "multiple";
    stripe_price_id: string;
    categories: SignalCategory[];
    features: EditableFeature[];
  }>({
    name: "",
    description: "",
    status: "active",
    price: "",
    currency: "USD",
    duration_type: "monthly",
    duration_months: "1",
    availability: "single",
    stripe_price_id: "",
    categories: ["Forex", "Metals", "Crypto", "Indices", "Commodities"],
    features: [],
  });

  const openCreateDialog = () => {
    setEditingPackage(null);
    setFormState({
      name: "",
      description: "",
      status: "active",
      price: "",
      currency: "USD",
      duration_type: "monthly",
      duration_months: "1",
      availability: "single",
      stripe_price_id: "",
      categories: ["Forex", "Metals", "Crypto", "Indices", "Commodities"],
      features: [],
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (pkg: SubscriptionPackageWithFeatures) => {
    setEditingPackage(pkg);
    setFormState({
      name: pkg.name,
      description: pkg.description || "",
      status: pkg.status,
      price: String(pkg.price),
      currency: pkg.currency,
      duration_type: pkg.duration_type,
      duration_months: String(pkg.duration_months),
      availability: pkg.availability,
      stripe_price_id: pkg.stripe_price_id || "",
      categories: (pkg.categories && pkg.categories.length > 0
        ? pkg.categories
        : ["Forex", "Metals", "Crypto", "Indices", "Commodities"]) as SignalCategory[],
      features: pkg.features.map((f) => ({
        id: f.id,
        feature_text: f.feature_text,
      })),
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formState.name || !formState.price) {
      toast.error("Package name and price are required");
      return;
    }

    setIsSaving(true);
    try {
      const basePayload = {
        name: formState.name,
        description: formState.description || null,
        status: formState.status,
        price: Number(formState.price),
        currency: formState.currency,
        duration_type: formState.duration_type,
        duration_months:
          formState.duration_type === "lifetime"
            ? 0
            : Number(formState.duration_months || "1"),
        availability: formState.availability,
        stripe_price_id: formState.stripe_price_id.trim() || null,
        categories: formState.categories,
      };

      let packageId = editingPackage?.id;

      if (editingPackage) {
        const { error } = await supabase
          .from("subscription_packages")
          .update(basePayload)
          .eq("id", editingPackage.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("subscription_packages")
          .insert(basePayload)
          .select()
          .single();
        if (error) throw error;
        packageId = data.id;
      }

      if (packageId) {
        // Simplest: delete existing features and recreate from form state
        await supabase
          .from("subscription_package_features")
          .delete()
          .eq("package_id", packageId);

        const cleanedFeatures = formState.features
          .map((f) => f.feature_text.trim())
          .filter(Boolean);

        if (cleanedFeatures.length > 0) {
          const featurePayload = cleanedFeatures.map((text, index) => ({
            package_id: packageId,
            feature_text: text,
            sort_order: index,
          }));
          const { error: featError } = await supabase
            .from("subscription_package_features")
            .insert(featurePayload);
          if (featError) throw featError;
        }
      }

      toast.success(
        editingPackage ? "Subscription package updated" : "Subscription package created"
      );
      setIsDialogOpen(false);
      setEditingPackage(null);
      await refetch();
    } catch (err) {
      console.error("Error saving subscription package:", err);
      toast.error(getSafeErrorMessage(err, "Failed to save subscription package"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (pkg: SubscriptionPackageWithFeatures) => {
    setIsDeleting(pkg.id);
    try {
      // Soft-delete semantics: mark as inactive instead of full delete
      const { error } = await supabase
        .from("subscription_packages")
        .update({ status: "inactive" })
        .eq("id", pkg.id);
      if (error) throw error;

      toast.success("Package disabled (inactive) successfully");
      await refetch();
    } catch (err) {
      console.error("Error disabling package:", err);
      toast.error("Failed to disable package");
    } finally {
      setIsDeleting(null);
    }
  };

  const addFeatureRow = () => {
    setFormState((prev) => ({
      ...prev,
      features: [...prev.features, { feature_text: "" }],
    }));
  };

  const updateFeatureText = (index: number, text: string) => {
    setFormState((prev) => {
      const next = [...prev.features];
      next[index] = { ...next[index], feature_text: text };
      return { ...prev, features: next };
    });
  };

  const removeFeature = (index: number) => {
    setFormState((prev) => {
      const next = [...prev.features];
      next.splice(index, 1);
      return { ...prev, features: next };
    });
  };

  return (
    <AdminLayout
      title="Subscription Settings"
      subtitle="Configure subscription packages, pricing, and included features."
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-semibold">Subscription Packages</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage the plans that users can subscribe to.
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="w-4 h-4 mr-2" />
          New Package
        </Button>
      </div>

      <div className="space-y-4">
        {error && (
          <div className="glass-card p-6 border-destructive/30 bg-destructive/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <p className="text-sm text-destructive">
              {getSafeErrorMessage(error, "Failed to load subscription packages. Please try again.")}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : packages.length === 0 ? (
          <div className="glass-card p-6 text-center text-muted-foreground">
            <p>No subscription packages yet. Create your first package to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="glass-card p-5 flex flex-col justify-between border border-border/60"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      {pkg.name}
                      <Badge
                        variant={pkg.status === "active" ? "default" : "outline"}
                        className={
                          pkg.status === "active"
                            ? "bg-success text-success-foreground"
                            : "border-muted-foreground/40 text-muted-foreground"
                        }
                      >
                        {pkg.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </h3>
                    {pkg.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {pkg.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {pkg.currency} {Number(pkg.price).toFixed(2)}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">
                      {pkg.duration_type === "lifetime"
                        ? "Lifetime"
                        : `${pkg.duration_months} ${
                            pkg.duration_type === "monthly" ? "month" : "months"
                          }`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-3 gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Availability: {pkg.availability === "single" ? "Single" : "Multiple"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Features: {pkg.features.length}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-3">
                  Stripe Price: {pkg.stripe_price_id || "Not configured"}
                </p>

                {pkg.categories && pkg.categories.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {pkg.categories.map((cat) => (
                      <Badge
                        key={cat}
                        variant="outline"
                        className="text-xs px-2 py-0.5"
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                )}

                {pkg.features.length > 0 && (
                  <ul className="space-y-1 mb-4">
                    {pkg.features.slice(0, 4).map((feature) => (
                      <li key={feature.id} className="text-sm text-muted-foreground flex">
                        <span className="mt-1 mr-2 text-xs text-primary">
                          <GripVertical className="w-3 h-3" />
                        </span>
                        <span>{feature.feature_text}</span>
                      </li>
                    ))}
                    {pkg.features.length > 4 && (
                      <li className="text-xs text-muted-foreground">
                        + {pkg.features.length - 4} more features
                      </li>
                    )}
                  </ul>
                )}

                <div className="flex justify-end gap-2 mt-auto pt-3 border-t border-border/40">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(pkg)}
                  >
                    <Pencil className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(pkg)}
                    disabled={isDeleting === pkg.id}
                  >
                    {isDeleting === pkg.id ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-1" />
                    )}
                    Disable
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? "Edit Subscription Package" : "New Subscription Package"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Package Name</label>
                <Input
                  value={formState.name}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="Pro Signals"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select
                  value={formState.status}
                  onValueChange={(value: "active" | "inactive") =>
                    setFormState((prev) => ({ ...prev, status: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={formState.description}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Short description of what this plan includes."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Price</label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formState.price}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, price: e.target.value }))
                  }
                  placeholder="50"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Currency</label>
                <Input
                  value={formState.currency}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, currency: e.target.value }))
                  }
                  placeholder="USD"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Availability</label>
                <Select
                  value={formState.availability}
                  onValueChange={(value: "single" | "multiple") =>
                    setFormState((prev) => ({ ...prev, availability: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single</SelectItem>
                    <SelectItem value="multiple">Multiple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Stripe Price ID</label>
              <Input
                value={formState.stripe_price_id}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, stripe_price_id: e.target.value }))
                }
                placeholder="price_12345..."
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required for Stripe checkout. Leave empty to keep Stripe disabled for this package.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Categories</label>
              <p className="text-xs text-muted-foreground mb-2">
                Select which signal categories this package grants access to.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["Forex", "Metals", "Crypto", "Indices", "Commodities"] as SignalCategory[]).map(
                  (cat) => {
                    const selected = formState.categories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() =>
                          setFormState((prev) => {
                            const exists = prev.categories.includes(cat);
                            return {
                              ...prev,
                              categories: exists
                                ? prev.categories.filter((c) => c !== cat)
                                : [...prev.categories, cat],
                            };
                          })
                        }
                        className={cn(
                          "px-3 py-1 rounded-full text-xs border transition-colors",
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/60"
                        )}
                      >
                        {cat}
                      </button>
                    );
                  }
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Duration Type</label>
                <Select
                  value={formState.duration_type}
                  onValueChange={(
                    value: "monthly" | "yearly" | "lifetime"
                  ) =>
                    setFormState((prev) => ({
                      ...prev,
                      duration_type: value,
                      duration_months:
                        value === "lifetime" ? "0" : prev.duration_months || "1",
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="lifetime">Lifetime</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formState.duration_type !== "lifetime" && (
                <div>
                  <label className="text-sm font-medium">Duration (months)</label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={formState.duration_months}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        duration_months: e.target.value,
                      }))
                    }
                    placeholder={
                      formState.duration_type === "monthly" ? "1" : "12"
                    }
                  />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">
                  Features ({formState.features.length})
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addFeatureRow}
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Add feature
                </Button>
              </div>
              {formState.features.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No features added yet. Add at least a few bullet points so users
                  understand what this plan includes.
                </p>
              ) : (
                <div className="space-y-2">
                  {formState.features.map((feature, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-4 text-right">
                        {index + 1}.
                      </span>
                      <Input
                        value={feature.feature_text}
                        onChange={(e) =>
                          updateFeatureText(index, e.target.value)
                        }
                        placeholder="Feature description"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeFeature(index)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {isSaving && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Save Package
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSubscriptionSettings;


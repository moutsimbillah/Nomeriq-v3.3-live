import { useState } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Tag, Percent, DollarSign, Loader2, Calendar, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDiscounts } from "@/hooks/useDiscounts";
import { toast } from "sonner";
import { format } from "date-fns";
const AdminDiscounts = () => {
  const {
    discounts,
    isLoading,
    createDiscount,
    updateDiscount,
    deleteDiscount
  } = useDiscounts();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingDiscountId, setEditingDiscountId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    type: "percentage" as "percentage" | "fixed",
    value: "",
    is_active: true,
    expires_at: "",
    max_uses: ""
  });
  const resetForm = () => {
    setFormData({
      code: "",
      type: "percentage",
      value: "",
      is_active: true,
      expires_at: "",
      max_uses: ""
    });
  };
  const handleCreate = async () => {
    if (!formData.code || !formData.value) {
      toast.error("Please fill in code and value");
      return;
    }
    setIsSubmitting(true);
    try {
      await createDiscount({
        code: formData.code,
        type: formData.type,
        value: parseFloat(formData.value),
        is_active: formData.is_active,
        expires_at: formData.expires_at || null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null
      });
      toast.success("Discount code created!");
      setIsCreateOpen(false);
      resetForm();
    } catch (err) {
      console.error('Error creating discount:', err);
      toast.error("Failed to create discount");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleEdit = async () => {
    if (!editingDiscountId) return;
    setIsSubmitting(true);
    try {
      await updateDiscount(editingDiscountId, {
        code: formData.code.toUpperCase(),
        type: formData.type,
        value: parseFloat(formData.value),
        is_active: formData.is_active,
        expires_at: formData.expires_at || null,
        max_uses: formData.max_uses ? parseInt(formData.max_uses) : null
      });
      toast.success("Discount updated!");
      setEditingDiscountId(null);
      resetForm();
    } catch (err) {
      console.error('Error updating discount:', err);
      toast.error("Failed to update discount");
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this discount?")) return;
    try {
      await deleteDiscount(id);
      toast.success("Discount deleted");
    } catch (err) {
      console.error('Error deleting discount:', err);
      toast.error("Failed to delete discount");
    }
  };
  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await updateDiscount(id, {
        is_active: !currentActive
      });
      toast.success(`Discount ${!currentActive ? 'activated' : 'deactivated'}`);
    } catch (err) {
      console.error('Error toggling discount:', err);
      toast.error("Failed to update discount");
    }
  };
  const openEditDialog = (discount: typeof discounts[0]) => {
    setFormData({
      code: discount.code,
      type: discount.type as "percentage" | "fixed",
      value: discount.value.toString(),
      is_active: discount.is_active,
      expires_at: discount.expires_at ? discount.expires_at.split('T')[0] : "",
      max_uses: discount.max_uses?.toString() || ""
    });
    setEditingDiscountId(discount.id);
  };
  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };
  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };
  const isMaxedOut = (discount: typeof discounts[0]) => {
    if (!discount.max_uses) return false;
    return discount.current_uses >= discount.max_uses;
  };
  const DiscountForm = ({
    onSubmit,
    submitLabel
  }: {
    onSubmit: () => void;
    submitLabel: string;
  }) => <div className="space-y-4">
      <div className="space-y-2">
        <Label>Discount Code</Label>
        <Input placeholder="e.g., SAVE20" value={formData.code} onChange={e => setFormData({
        ...formData,
        code: e.target.value.toUpperCase()
      })} className="bg-secondary/50 uppercase" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={formData.type} onValueChange={(v: "percentage" | "fixed") => setFormData({
          ...formData,
          type: v
        })}>
            <SelectTrigger className="bg-secondary/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="fixed">Fixed Amount ($)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Value</Label>
          <div className="relative">
            <Input type="number" placeholder={formData.type === "percentage" ? "20" : "10"} value={formData.value} onChange={e => setFormData({
            ...formData,
            value: e.target.value
          })} className="bg-secondary/50 pr-8" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {formData.type === "percentage" ? "%" : "$"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Expires At (Optional)</Label>
          <Input type="date" value={formData.expires_at} onChange={e => setFormData({
          ...formData,
          expires_at: e.target.value
        })} className="bg-secondary/50" />
        </div>
        <div className="space-y-2">
          <Label>Max Uses (Optional)</Label>
          <Input type="number" placeholder="Unlimited" value={formData.max_uses} onChange={e => setFormData({
          ...formData,
          max_uses: e.target.value
        })} className="bg-secondary/50" />
        </div>
      </div>

      <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
        <div>
          <p className="font-medium">Active</p>
          <p className="text-xs text-muted-foreground">Users can apply this code</p>
        </div>
        <Switch checked={formData.is_active} onCheckedChange={checked => setFormData({
        ...formData,
        is_active: checked
      })} />
      </div>

      <DialogFooter>
        <Button onClick={onSubmit} className="w-full" variant="gradient" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Tag className="w-4 h-4 mr-2" />}
          {submitLabel}
        </Button>
      </DialogFooter>
    </div>;
  const activeCount = discounts.filter(d => d.is_active && !isExpired(d.expires_at) && !isMaxedOut(d)).length;
  const totalUses = discounts.reduce((sum, d) => sum + d.current_uses, 0);
  return <AdminLayout title="Discount Management">
      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4">
          <div className="glass-card px-4 py-2 shadow-none">
            <p className="text-2xl font-bold text-success">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Active Codes</p>
          </div>
          <div className="glass-card px-4 py-2 shadow-none">
            <p className="text-2xl font-bold">{totalUses}</p>
            <p className="text-xs text-muted-foreground">Total Uses</p>
          </div>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="gradient" onClick={resetForm}>
              <Plus className="w-4 h-4 mr-2" />
              Create Discount
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Discount Code</DialogTitle>
              <DialogDescription>
                Create a new discount code for users to apply during payment.
              </DialogDescription>
            </DialogHeader>
            <DiscountForm onSubmit={handleCreate} submitLabel="Create Discount" />
          </DialogContent>
        </Dialog>
      </div>

      {/* Discounts Table */}
      <div className="glass-card overflow-hidden shadow-none">
        {isLoading ? <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div> : discounts.length === 0 ? <div className="text-center py-12 text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No discount codes yet</p>
            <p>Create your first discount code to get started.</p>
          </div> : <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/50 bg-secondary/30">
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Code</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Discount</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Usage</th>
                  <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Expires</th>
                  <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-6 py-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {discounts.map(discount => {
              const expired = isExpired(discount.expires_at);
              const maxedOut = isMaxedOut(discount);
              const isValid = discount.is_active && !expired && !maxedOut;
              return <tr key={discount.id} className="hover:bg-accent/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <code className="text-lg font-bold bg-secondary/50 px-3 py-1 rounded">
                            {discount.code}
                          </code>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyCode(discount.code)}>
                            {copiedCode === discount.code ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                          </Button>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {discount.type === "percentage" ? <Percent className="w-4 h-4 text-primary" /> : <DollarSign className="w-4 h-4 text-success" />}
                          <span className="font-semibold">
                            {discount.type === "percentage" ? `${discount.value}% off` : `$${discount.value} off`}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={cn("font-mono", maxedOut && "text-destructive")}>
                          {discount.current_uses}
                          {discount.max_uses && ` / ${discount.max_uses}`}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge variant="outline" className={cn(isValid && "border-success/30 text-success bg-success/10", expired && "border-destructive/30 text-destructive bg-destructive/10", maxedOut && "border-warning/30 text-warning bg-warning/10", !discount.is_active && !expired && !maxedOut && "border-muted-foreground/30 text-muted-foreground")}>
                          {expired ? "Expired" : maxedOut ? "Max Uses" : discount.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-6 py-4">
                        {discount.expires_at ? <div className="flex items-center gap-2 text-sm">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            {format(new Date(discount.expires_at), "MMM d, yyyy")}
                          </div> : <span className="text-sm text-muted-foreground">Never</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <Switch checked={discount.is_active} onCheckedChange={() => toggleActive(discount.id, discount.is_active)} />
                          <Dialog open={editingDiscountId === discount.id} onOpenChange={open => !open && setEditingDiscountId(null)}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="ghost" onClick={() => openEditDialog(discount)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Discount</DialogTitle>
                                <DialogDescription>Update the discount details.</DialogDescription>
                              </DialogHeader>
                              <DiscountForm onSubmit={handleEdit} submitLabel="Update Discount" />
                            </DialogContent>
                          </Dialog>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(discount.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>;
            })}
              </tbody>
            </table>
          </div>}
      </div>
    </AdminLayout>;
};
export default AdminDiscounts;
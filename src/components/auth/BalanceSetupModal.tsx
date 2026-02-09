import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, DollarSign, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const BalanceSetupModal = () => {
  const { needsBalanceSetup, setAccountBalance, user } = useAuth();
  const [balance, setBalance] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  if (!needsBalanceSetup || !user) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const balanceValue = parseFloat(balance);
    
    if (isNaN(balanceValue) || balanceValue <= 0) {
      toast({
        title: 'Invalid Balance',
        description: 'Please enter a valid positive number.',
        variant: 'destructive',
      });
      return;
    }
    
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    const balanceValue = parseFloat(balance);
    
    const { error } = await setAccountBalance(balanceValue);
    
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to set account balance. Please try again.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Balance Set',
        description: `Your starting balance of $${balanceValue.toLocaleString()} has been saved.`,
      });
    }
    
    setIsSubmitting(false);
    setShowConfirm(false);
  };

  return (
    <>
      <Dialog open={needsBalanceSetup}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Set Your Starting Balance
            </DialogTitle>
            <DialogDescription>
              Enter your USD account balance to start tracking your performance.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="balance">Account Balance (USD)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="balance"
                  type="number"
                  min="1"
                  step="0.01"
                  placeholder="10000"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  className="pl-8 bg-secondary/50"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-warning">Important Notice</p>
                  <p className="text-xs text-warning/80 leading-relaxed">
                    ⚠️ You can only set your account balance <strong>ONE TIME</strong>.
                    This value cannot be changed by you later.
                    To change balance in the future, you must contact support.
                  </p>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" variant="gradient" size="lg" disabled={isSubmitting}>
              Set Balance & Continue
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Confirm Your Balance
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              <p>
                You are about to set your starting balance to{' '}
                <strong className="text-foreground">${parseFloat(balance || '0').toLocaleString()}</strong>.
              </p>
              <p className="text-warning font-medium">
                ⚠️ Are you sure? This cannot be changed later.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Setting...
                </>
              ) : (
                'Yes, Set Balance'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

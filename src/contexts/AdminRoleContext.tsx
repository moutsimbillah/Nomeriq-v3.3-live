import { createContext, ReactNode, useContext } from "react";
import { useAdminRole } from "@/hooks/useAdminRole";
import { AdminRole } from "@/types/database";

interface AdminRoleContextValue {
  adminRole: AdminRole | null;
  isProvider: boolean;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

const AdminRoleContext = createContext<AdminRoleContextValue | undefined>(undefined);

export function AdminRoleProvider({ children }: { children: ReactNode }) {
  const value = useAdminRole();
  return <AdminRoleContext.Provider value={value}>{children}</AdminRoleContext.Provider>;
}

export function useAdminRoleContext() {
  const ctx = useContext(AdminRoleContext);
  if (!ctx) throw new Error("useAdminRoleContext must be used within an AdminRoleProvider");
  return ctx;
}

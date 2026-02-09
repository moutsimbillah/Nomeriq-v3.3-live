import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AdminRoleProvider } from "@/contexts/AdminRoleContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/auth/AdminProtectedRoute";
import { BalanceSetupModal } from "@/components/auth/BalanceSetupModal";

// Public pages
import Index from "./pages/Index";
import Login from "./pages/Auth/Login";
import Signup from "./pages/Auth/Signup";
import SignupSuccess from "./pages/Auth/SignupSuccess";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";
import VerifyEmail from "./pages/Auth/VerifyEmail";
import NotFound from "./pages/NotFound";
import AccessDenied from "./pages/AccessDenied";

// User pages
import Dashboard from "./pages/Dashboard";
import ActiveTrades from "./pages/ActiveTrades";
import Upcoming from "./pages/Upcoming";
import History from "./pages/History";
import Calendar from "./pages/Calendar";
import Subscription from "./pages/Subscription";
import Settings from "./pages/Settings";
import MySignals from "./pages/MySignals";

// Admin pages
import AdminDashboard from "./pages/Admin/AdminDashboard";
import AdminTradeStats from "./pages/Admin/AdminTradeStats";
import AdminSignals from "./pages/Admin/AdminSignals";
import AdminUsers from "./pages/Admin/AdminUsers";
import AdminUserDetails from "./pages/Admin/AdminUserDetails";
import AdminPayments from "./pages/Admin/AdminPayments";
import AdminSettings from "./pages/Admin/AdminSettings";
import AdminDiscounts from "./pages/Admin/AdminDiscounts";
import AdminManagement from "./pages/Admin/AdminManagement";
import AdminBranding from "./pages/Admin/AdminBranding";
import ProviderDashboard from "./pages/Admin/ProviderDashboard";
import ProviderSignals from "./pages/Admin/ProviderSignals";
import TelegramIntegration from "./pages/Admin/TelegramIntegration";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent automatic refetch on window focus which causes UI flicker
      refetchOnWindowFocus: false,
      // Keep data fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Retry failed requests once
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
            <BrandProvider>
              <AdminRoleProvider>
                <Toaster />
                <Sonner />
                <BalanceSetupModal />
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/signup-success" element={<SignupSuccess />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/access-denied" element={<AccessDenied />} />
              
              {/* Protected User Routes */}
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/active-trades" element={
                <ProtectedRoute requireSubscription>
                  <ActiveTrades />
                </ProtectedRoute>
              } />
              <Route path="/upcoming" element={
                <ProtectedRoute requireSubscription>
                  <Upcoming />
                </ProtectedRoute>
              } />
              <Route path="/history" element={
                <ProtectedRoute requireSubscription>
                  <History />
                </ProtectedRoute>
              } />
              <Route path="/calendar" element={
                <ProtectedRoute requireSubscription>
                  <Calendar />
                </ProtectedRoute>
              } />
              <Route path="/subscription" element={
                <ProtectedRoute>
                  <Subscription />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/my-signals" element={
                <ProtectedRoute requireSubscription>
                  <MySignals />
                </ProtectedRoute>
              } />

              {/* Admin Routes - Dashboard accessible to super_admin and payments_admin only */}
              <Route path="/admin" element={
                <AdminProtectedRoute allowedRoles={['super_admin', 'payments_admin']}>
                  <AdminDashboard />
                </AdminProtectedRoute>
              } />
              
              {/* Signal Provider routes - Provider sees their own isolated data */}
              <Route path="/admin/provider-dashboard" element={
                <AdminProtectedRoute allowedRoles={['signal_provider_admin']}>
                  <ProviderDashboard />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/provider-signals" element={
                <AdminProtectedRoute allowedRoles={['signal_provider_admin']}>
                  <ProviderSignals />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/telegram" element={
                <AdminProtectedRoute allowedRoles={['signal_provider_admin']}>
                  <TelegramIntegration />
                </AdminProtectedRoute>
              } />
              
              {/* Trade stats - Super Admin sees global, Provider sees their own */}
              <Route path="/admin/trade-stats" element={
                <AdminProtectedRoute allowedRoles={['super_admin', 'signal_provider_admin']}>
                  <AdminTradeStats />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/signals" element={
                <AdminProtectedRoute allowedRoles={['super_admin', 'signal_provider_admin']}>
                  <AdminSignals />
                </AdminProtectedRoute>
              } />
              
              {/* Payment-related routes - Payments Admin + Super Admin */}
              <Route path="/admin/users" element={
                <AdminProtectedRoute allowedRoles={['super_admin', 'payments_admin']}>
                  <AdminUsers />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/users/:userId" element={
                <AdminProtectedRoute allowedRoles={['super_admin', 'payments_admin']}>
                  <AdminUserDetails />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/payments" element={
                <AdminProtectedRoute allowedRoles={['super_admin', 'payments_admin']}>
                  <AdminPayments />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/discounts" element={
                <AdminProtectedRoute allowedRoles={['super_admin', 'payments_admin']}>
                  <AdminDiscounts />
                </AdminProtectedRoute>
              } />
              
              {/* Super Admin only routes */}
              <Route path="/admin/branding" element={
                <AdminProtectedRoute allowedRoles={['super_admin']}>
                  <AdminBranding />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/settings" element={
                <AdminProtectedRoute allowedRoles={['super_admin']}>
                  <AdminSettings />
                </AdminProtectedRoute>
              } />
              <Route path="/admin/management" element={
                <AdminProtectedRoute allowedRoles={['super_admin']}>
                  <AdminManagement />
                </AdminProtectedRoute>
              } />

              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
              </AdminRoleProvider>
            </BrandProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;

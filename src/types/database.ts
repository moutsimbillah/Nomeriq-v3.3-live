// Database types for the trading signal platform

export type AppRole = 'admin' | 'user';
export type AdminRole = 'super_admin' | 'payments_admin' | 'signal_provider_admin';
export type AdminStatus = 'active' | 'suspended';

export type SignalStatus = 'active' | 'closed' | 'tp_hit' | 'sl_hit' | 'upcoming' | 'cancelled' | 'breakeven';
export type SignalCategory = 'Forex' | 'Metals' | 'Crypto' | 'Indices' | 'Commodities';
export type SignalDirection = 'BUY' | 'SELL';
export type SignalType = 'signal' | 'upcoming';
export type UpcomingStatus = 'waiting' | 'near_entry' | 'preparing';
export type SubscriptionStatus = 'active' | 'inactive' | 'expired' | 'pending';
export type PaymentStatus = 'pending' | 'verified' | 'rejected';
export type TradeResult = 'win' | 'loss' | 'pending' | 'breakeven';
export type DiscountType = 'percentage' | 'fixed';

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  country: string | null;
  username: string | null;
  account_balance: number | null;
  balance_set_at: string | null;
  custom_risk_percent: number | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}

export interface AdminRoleRecord {
  id: string;
  user_id: string;
  admin_role: AdminRole;
  status: AdminStatus;
  last_login: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminAuditLog {
  id: string;
  performed_by: string;
  target_user_id: string;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  tx_hash: string;
  status: PaymentStatus;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface Signal {
  id: string;
  pair: string;
  category: SignalCategory;
  direction: SignalDirection;
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  status: SignalStatus;
  signal_type: SignalType;
  upcoming_status: UpcomingStatus | null;
  notes: string | null;
  created_by: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  // Analysis content fields
  analysis_video_url: string | null;
  analysis_notes: string | null;
  analysis_image_url: string | null;
}

export interface UserTrade {
  id: string;
  user_id: string;
  signal_id: string;
  risk_percent: number;
  risk_amount: number;
  pnl: number | null;
  result: TradeResult | null;
  created_at: string;
  closed_at: string | null;
  signal?: Signal;
}

export interface Favorite {
  id: string;
  user_id: string;
  pair: string;
  created_at: string;
}

export interface GlobalSettings {
  id: string;
  global_risk_percent: number;
  subscription_price: number;
  wallet_address: string;
  brand_name: string;
  logo_url: string | null;
  logo_url_dark: string | null;
  support_email: string | null;
  support_phone: string | null;
  timezone: string;
  social_facebook: string | null;
  social_twitter: string | null;
  social_instagram: string | null;
  social_telegram: string | null;
  social_discord: string | null;
  copyright_name: string | null;
  disclaimer_text: string | null;
  updated_at: string;
}

export interface Discount {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  created_at: string;
}

export interface LegalPage {
  id: string;
  slug: string;
  title: string;
  content: string;
  updated_at: string;
}

export interface ProviderTelegramSettings {
  id: string;
  user_id: string;
  bot_token: string;
  chat_id: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Helper type for admin with profile info
export interface AdminWithProfile extends AdminRoleRecord {
  profile?: Profile;
}

import { useBrand } from '@/contexts/BrandContext';

// Common timezones for display
export const TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Sao_Paulo', label: 'Brasília Time' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Central European Time' },
  { value: 'Europe/Istanbul', label: 'Turkey Time' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Asia/Karachi', label: 'Pakistan Standard Time' },
  { value: 'Asia/Kolkata', label: 'India Standard Time' },
  { value: 'Asia/Bangkok', label: 'Indochina Time' },
  { value: 'Asia/Singapore', label: 'Singapore Time' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time' },
  { value: 'Asia/Shanghai', label: 'China Standard Time' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time' },
  { value: 'Pacific/Auckland', label: 'New Zealand Time' },
];

export const useTimezone = () => {
  const { settings } = useBrand();
  const timezone = settings?.timezone || 'UTC';

  const formatInTimezone = (date: Date | string, formatStr: string = 'MMM d, yyyy HH:mm'): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      // Fallback if timezone is invalid
      return d.toISOString();
    }
  };

  const formatDateOnly = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(d);
    } catch {
      return d.toISOString().split('T')[0];
    }
  };

  const formatTimeOnly = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    } catch {
      return d.toISOString().split('T')[1].substring(0, 5);
    }
  };

  const getCurrentTimeInTimezone = (): string => {
    return formatInTimezone(new Date());
  };

  return {
    timezone,
    formatInTimezone,
    formatDateOnly,
    formatTimeOnly,
    getCurrentTimeInTimezone,
  };
};

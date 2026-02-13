
import { useState, useEffect } from 'react';

export type DashboardSectionId =
    // User Dashboard
    | 'stats'
    | 'active-trades'
    | 'upcoming-trades'
    | 'calendar'
    | 'performance-analytics'
    | 'charts-and-signals'
    | 'trade-history'
    // Provider Dashboard
    | 'provider-welcome'
    | 'provider-kpi'
    | 'provider-period-analytics'
    | 'provider-equity-signals'
    | 'provider-pair-performance'
    // Admin Dashboard
    | 'admin-executive'
    | 'admin-analytics-tabs'
    | 'admin-signal-quality'
    | 'admin-provider-performance';

export interface DashboardSection {
    id: DashboardSectionId;
    label: string;
    enabled: boolean;
}

const DEFAULT_USER_SECTIONS: DashboardSection[] = [
    { id: 'stats', label: 'Overview Stats', enabled: true },
    { id: 'charts-and-signals', label: 'Equity Chart & Recent Signals', enabled: true },
    { id: 'performance-analytics', label: 'Performance Analytics', enabled: true },
    { id: 'calendar', label: 'Trading Calendar', enabled: true },
    { id: 'active-trades', label: 'Active Trades', enabled: true },
    { id: 'upcoming-trades', label: 'Upcoming Trades', enabled: true },
    { id: 'trade-history', label: 'Trade History', enabled: true },
];

export const useDashboardLayout = (
    storageKey: string = 'dashboard-layout-v4',
    defaultSections: DashboardSection[] = DEFAULT_USER_SECTIONS
) => {
    const [sections, setSections] = useState<DashboardSection[]>(defaultSections);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load from local storage on mount
    useEffect(() => {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    const defaultMap = new Map(defaultSections.map(s => [s.id, s]));
                    const parsedMap = new Map(
                        parsed
                            .filter((s: any) => s && typeof s.id === 'string' && defaultMap.has(s.id))
                            .map((s: any) => [s.id, s])
                    );

                    // Keep ONLY known sections and preserve DEFAULT order.
                    // Enabled state is restored from saved values when present.
                    const normalized = defaultSections.map((section) => {
                        const savedSection = parsedMap.get(section.id);
                        return savedSection
                            ? { ...section, enabled: !!savedSection.enabled }
                            : section;
                    });

                    setSections(normalized);
                }
            } catch (e) {
                console.error("Failed to parse dashboard layout", e);
            }
        }
        setIsLoaded(true);
    }, [storageKey, defaultSections]);

    // Save to local storage whenever sections change
    useEffect(() => {
        if (isLoaded) {
            localStorage.setItem(storageKey, JSON.stringify(sections));
        }
    }, [sections, isLoaded, storageKey]);

    const updateOrder = (newSections: DashboardSection[]) => {
        setSections(newSections);
    };

    const resetLayout = () => {
        setSections(defaultSections);
    };

    return {
        sections,
        updateOrder,
        resetLayout,
        isLoaded
    };
};

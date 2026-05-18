import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface SiteSettingsPublic {
  logo_url: string;
  platform_name: string;
}

const DEFAULT: SiteSettingsPublic = { logo_url: '', platform_name: 'Maximus Academy' };

// Module-level cache so all mounted components share the same value
// but we always re-fetch on first component mount (cached = null after reload)
let cached: SiteSettingsPublic | null = null;
const listeners = new Set<(s: SiteSettingsPublic) => void>();

function broadcast(s: SiteSettingsPublic) {
  cached = s;
  listeners.forEach(fn => fn(s));
}

export async function refreshSiteSettings() {
  const { data } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['logo_url', 'platform_name']);
  if (!data) return;
  const map: Record<string, string> = {};
  data.forEach(row => { map[row.key] = row.value ?? ''; });
  broadcast({
    logo_url: map['logo_url'] ?? '',
    platform_name: map['platform_name'] || 'Maximus Academy',
  });
}

export function useSiteSettings(): SiteSettingsPublic {
  const [settings, setSettings] = useState<SiteSettingsPublic>(cached ?? DEFAULT);

  useEffect(() => {
    listeners.add(setSettings);
    // Always refresh from DB on mount
    refreshSiteSettings();
    return () => { listeners.delete(setSettings); };
  }, []);

  return settings;
}

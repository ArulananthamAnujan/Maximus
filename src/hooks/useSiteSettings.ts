import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface SiteSettingsPublic {
  logo_url: string;
  platform_name: string;
}

let cached: SiteSettingsPublic | null = null;
const listeners: Array<(s: SiteSettingsPublic) => void> = [];

async function fetchAndBroadcast() {
  const { data } = await supabase.from('site_settings').select('key, value').in('key', ['logo_url', 'platform_name']);
  if (!data) return;
  const map: Record<string, string> = {};
  data.forEach(row => { map[row.key] = row.value ?? ''; });
  cached = {
    logo_url: map['logo_url'] ?? '',
    platform_name: map['platform_name'] ?? 'Maximus Academy',
  };
  listeners.forEach(fn => fn(cached!));
}

export function useSiteSettings(): SiteSettingsPublic {
  const [settings, setSettings] = useState<SiteSettingsPublic>(
    cached ?? { logo_url: '', platform_name: 'Maximus Academy' }
  );

  useEffect(() => {
    if (!cached) {
      fetchAndBroadcast();
    }
    listeners.push(setSettings);
    return () => {
      const idx = listeners.indexOf(setSettings);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  return settings;
}

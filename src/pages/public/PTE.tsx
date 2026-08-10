import { useEffect } from 'react';

const PTE_SITE_URL = 'https://synapvexpte.netlify.app/';

export default function PTE() {
  useEffect(() => {
    window.location.replace(PTE_SITE_URL);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto mb-5" />
        <p className="text-slate-700 font-semibold">Taking you to Maximus PTE…</p>
        <p className="text-sm text-slate-400 mt-2">
          If you are not redirected,{' '}
          <a href={PTE_SITE_URL} className="text-sky-600 font-semibold hover:underline">
            click here
          </a>
          .
        </p>
      </div>
    </div>
  );
}

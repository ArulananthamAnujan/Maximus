import { useEffect } from 'react';

const PTE_SITE_URL = 'https://practice.maximusacademy.edu/';

export default function PTE() {
  useEffect(() => {
    // Navigate the TOP-level window (not just this frame) so the redirect
    // works even when the app is running inside a preview iframe — external
    // sites refuse to be loaded inside a frame ("refused to connect").
    try {
      const top = window.top ?? window;
      top.location.href = PTE_SITE_URL;
    } catch {
      window.location.href = PTE_SITE_URL;
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto mb-5" />
        <p className="text-slate-700 font-semibold">Taking you to Maximus PTE…</p>
        <p className="text-sm text-slate-400 mt-2">
          If you are not redirected,{' '}
          <a
            href={PTE_SITE_URL}
            target="_top"
            rel="noopener noreferrer"
            className="text-sky-600 font-semibold hover:underline"
          >
            click here
          </a>
          .
        </p>
      </div>
    </div>
  );
}

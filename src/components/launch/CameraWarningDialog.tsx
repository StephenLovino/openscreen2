import { useEffect, useCallback } from "react";
import { Button } from "../ui/button";

export function CameraWarningDialog() {
  const handleContinue = useCallback(() => {
    if (window.electronAPI?.send) {
      window.electronAPI.send('camera-warning-dialog-response', { action: 'continue' });
    }
  }, []);

  useEffect(() => {
    // Make background transparent
    document.body.style.background = 'transparent';
    document.documentElement.style.background = 'transparent';
    const root = document.getElementById('root');
    if (root) {
      root.style.setProperty('background', 'transparent');
      root.style.setProperty('padding', '0');
      root.style.setProperty('margin', '0');
      root.style.setProperty('max-width', 'none');
    }

    // Close dialog on ESC key (treat as continue)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleContinue();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleContinue]);

  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: 'transparent' }}>
      <div className="w-full max-w-md mx-4 rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl">
        <div className="p-8 space-y-6">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold text-white leading-tight">
              Camera Preview Will Be Hidden
            </h2>
            <p className="text-base text-white/90 leading-relaxed">
              We will remove the camera preview when recording to prevent it from being part of the screen record. You can always turn it on or off during edit.
            </p>
          </div>
          
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleContinue}
              className="px-8 py-2.5 bg-[#DA1F26] hover:bg-[#b81a20] text-white font-medium text-base shadow-lg shadow-[#DA1F26]/20 transition-all"
            >
              Got it
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


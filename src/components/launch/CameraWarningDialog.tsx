import { useEffect } from "react";
import { Button } from "../ui/button";
import { apiBridge } from "../../lib/apiBridge";

export function CameraWarningDialog() {
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
  }, []);

  const handleContinue = () => {
    if (window.electronAPI?.send) {
      window.electronAPI.send('camera-warning-dialog-response', { action: 'continue' });
    }
  };

  const handleCancel = () => {
    if (window.electronAPI?.send) {
      window.electronAPI.send('camera-warning-dialog-response', { action: 'cancel' });
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-transparent">
      <div
        className="w-full max-w-md mx-4 rounded-2xl border border-white/20 shadow-2xl"
        style={{
          background: 'linear-gradient(135deg, rgba(30,30,40,0.98) 0%, rgba(20,20,30,0.95) 100%)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        }}
      >
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-white">
              Camera Preview Will Be Hidden
            </h2>
            <p className="text-sm text-white/70 leading-relaxed">
              We will remove the camera preview when recording to prevent it from being part of the screen record. You can always turn it on or off during edit.
            </p>
          </div>
          
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1 border-white/20 text-white/80 hover:text-white hover:bg-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={handleContinue}
              className="flex-1 bg-[#34B27B] hover:bg-[#2a9d6a] text-white"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}


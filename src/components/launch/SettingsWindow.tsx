import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Cloud, CloudOff, Cpu, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AhaConfigDialog } from '@/components/video-editor/AhaConfigDialog';
import { apiBridge } from '@/lib/apiBridge';

export function SettingsWindow() {
  const [showAhaConfig, setShowAhaConfig] = useState(false);
  const [hasAhaConfig, setHasAhaConfig] = useState(false);
  const [preferGpuAcceleration, setPreferGpuAcceleration] = useState<boolean>(() => {
    // Load from localStorage, default to true (prefer GPU)
    const saved = localStorage.getItem('preferGpuAcceleration');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    loadAhaConfigStatus();
  }, []);

  const loadAhaConfigStatus = async () => {
    try {
      const config = await apiBridge.getAhaConfig();
      setHasAhaConfig(config.hasConfig);
    } catch (error) {
      console.error('Error loading AHA config status:', error);
    }
  };

  const handleAhaConfigUpdated = () => {
    loadAhaConfigStatus();
  };

  const handleGpuAccelerationChange = (prefer: boolean) => {
    setPreferGpuAcceleration(prefer);
    localStorage.setItem('preferGpuAcceleration', String(prefer));
  };

  return (
    <div className="w-full h-screen bg-[#09090b] text-slate-200 flex flex-col">
      {/* Header */}
      <div className="h-14 flex-shrink-0 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <SettingsIcon className="w-5 h-5 text-slate-200" />
          <h1 className="text-lg font-semibold text-slate-200">Settings</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* AHA Innovations Integration Section */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-medium text-slate-200 mb-1">Cloud Sharing</h2>
                <p className="text-sm text-slate-400">
                  Configure your AHA Innovations account to share exports via URL
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasAhaConfig ? (
                  <>
                    <Cloud className="w-5 h-5 text-green-400" />
                    <span className="text-sm text-green-400 font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-5 h-5 text-slate-500" />
                    <span className="text-sm text-slate-500 font-medium">Not Connected</span>
                  </>
                )}
              </div>
            </div>
            
            <Button
              onClick={() => setShowAhaConfig(true)}
              variant="outline"
              className="w-full bg-white/5 text-slate-200 border-white/10 hover:bg-white/10"
            >
              {hasAhaConfig ? 'Manage AHA Account' : 'Setup AHA Account'}
            </Button>

            {hasAhaConfig && (
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-xs text-green-400">
                  ✓ Your AHA Innovations account is configured. You can now share exports via URL.
                </p>
              </div>
            )}
          </div>

          {/* More Settings Section */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6 space-y-4">
            <h2 className="text-base font-medium text-slate-200 mb-4">More Settings</h2>
            
            {/* GPU Acceleration Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-white/5 border border-white/5">
              <div className="flex items-center gap-3">
                {preferGpuAcceleration ? (
                  <Zap className="w-5 h-5 text-yellow-400" />
                ) : (
                  <Cpu className="w-5 h-5 text-slate-400" />
                )}
                <div>
                  <div className="text-sm font-medium text-slate-200">GPU Acceleration</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {preferGpuAcceleration 
                      ? 'Will use GPU if available (faster export)' 
                      : 'Will use CPU encoding (more stable)'}
                  </div>
                </div>
              </div>
              <Switch
                checked={preferGpuAcceleration}
                onCheckedChange={handleGpuAccelerationChange}
                className="data-[state=checked]:bg-[#DA1F26]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* AHA Config Dialog */}
      <AhaConfigDialog
        isOpen={showAhaConfig}
        onClose={() => {
          setShowAhaConfig(false);
          loadAhaConfigStatus();
        }}
        onConfigUpdated={handleAhaConfigUpdated}
      />
    </div>
  );
}


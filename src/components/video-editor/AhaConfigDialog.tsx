import { useState, useEffect } from 'react';
import { X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiBridge } from '@/lib/apiBridge';
import { toast } from 'sonner';

interface AhaConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated?: () => void;
}

export function AhaConfigDialog({ isOpen, onClose, onConfigUpdated }: AhaConfigDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [subaccountId, setSubaccountId] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  const loadConfig = async () => {
    try {
      const config = await apiBridge.getAhaConfig();
      setHasConfig(config.hasConfig);
      if (config.hasConfig && config.subaccountId) {
        setSubaccountId(config.subaccountId);
      }
      // Don't load API key for security (it's never returned)
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const handleVerify = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your private integration key');
      return;
    }

    setIsVerifying(true);
    try {
      // Verify the API key directly without saving first
      const verifyResult = await apiBridge.verifyAhaConfig(apiKey.trim());
      if (verifyResult.valid) {
        setIsConnected(true);
        toast.success('Connection verified successfully!');
      } else {
        setIsConnected(false);
        // If it's a 404, show a warning but allow saving
        if (verifyResult.error?.includes('404')) {
          toast.warning(verifyResult.error || 'Could not verify endpoint, but you can still save and test with an upload');
        } else {
          toast.error(verifyResult.error || 'Invalid API key');
        }
      }
    } catch (error) {
      setIsConnected(false);
      toast.error('Failed to verify connection');
      console.error('Verification error:', error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your private integration key');
      return;
    }

    setIsSaving(true);
    try {
      // Save first
      const saveResult = await apiBridge.saveAhaConfig(apiKey.trim(), subaccountId.trim() || undefined);
      if (!saveResult.success) {
        toast.error(saveResult.error || 'Failed to save configuration');
        setIsSaving(false);
        return;
      }

      // Verify the saved config
      const verifyResult = await apiBridge.verifyAhaConfig();
      if (verifyResult.valid) {
        setHasConfig(true);
        setIsConnected(true);
        toast.success('Configuration saved and verified successfully!');
        onConfigUpdated?.();
        onClose();
      } else {
        // If verification failed due to 404 (endpoint not found), keep the config
        // The user can test it with an actual upload. Only delete on clear auth errors (401)
        if (verifyResult.error?.includes('401') || verifyResult.error?.includes('Invalid API key')) {
          // Delete invalid config only on authentication errors
          await apiBridge.deleteAhaConfig();
          setIsConnected(false);
          toast.error(verifyResult.error || 'Invalid API key. Configuration not saved.');
        } else {
          // For 404 or other errors, keep the config but warn the user
          setHasConfig(true);
          setIsConnected(false);
          toast.warning('Configuration saved, but verification failed. You can still test it with an upload.');
          onConfigUpdated?.();
          onClose();
        }
      }
    } catch (error) {
      toast.error('Failed to save configuration');
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemove = async () => {
    try {
      const result = await apiBridge.deleteAhaConfig();
      if (result.success) {
        setApiKey('');
        setSubaccountId('');
        setHasConfig(false);
        setIsConnected(false);
        toast.success('Configuration removed');
        onConfigUpdated?.();
        onClose();
      } else {
        toast.error(result.error || 'Failed to remove configuration');
      }
    } catch (error) {
      toast.error('Failed to remove configuration');
      console.error('Remove error:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 animate-in fade-in duration-200"
        onClick={onClose}
      />
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] bg-[#09090b] rounded-2xl shadow-2xl border border-white/10 p-8 w-[90vw] max-w-md animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-200">AHA Innovations Account</h2>
            <p className="text-sm text-slate-400 mt-1">Connect your account to share exports via URL</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="hover:bg-white/10 text-slate-400 hover:text-white rounded-full"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-200 mb-2 block">
              Private Integration Key *
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your AHA Innovations private integration key"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#DA1F26] focus:border-transparent"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Your API key is stored locally and never shared
            </p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-200 mb-2 block">
              Subaccount ID (Optional)
            </label>
            <input
              type="text"
              value={subaccountId}
              onChange={(e) => setSubaccountId(e.target.value)}
              placeholder="Enter subaccount ID if needed"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#DA1F26] focus:border-transparent"
            />
          </div>

          {hasConfig && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400">Account configured</span>
            </div>
          )}

          {isConnected && (
            <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400">Connection verified</span>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleVerify}
              disabled={isVerifying || !apiKey.trim()}
              variant="outline"
              className="flex-1 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Connection'
              )}
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !apiKey.trim()}
              className="flex-1 bg-[#DA1F26] text-white hover:bg-[#DA1F26]/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>

          {hasConfig && (
            <Button
              onClick={handleRemove}
              variant="destructive"
              className="w-full bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
            >
              Remove Configuration
            </Button>
          )}

          <div className="pt-4 border-t border-white/5">
            <div className="text-center space-y-2">
              <p className="text-xs text-slate-400">
                No AHA account yet?{' '}
                <button
                  onClick={() => apiBridge.openExternalUrl('https://www.aha-innovations.com/pricing')}
                  className="text-[#DA1F26] hover:text-[#DA1F26]/80 underline"
                >
                  Sign up here
                </button>
              </p>
              <p className="text-[10px] text-slate-500">
                A Basic plan ($10/month) is required for cloud sharing
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


import { useState } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiBridge } from '@/lib/apiBridge';
import { toast } from 'sonner';

interface ShareUrlDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
  fileName: string;
}

export function ShareUrlDialog({ isOpen, onClose, shareUrl, fileName }: ShareUrlDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('URL copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy URL');
      console.error('Copy error:', error);
    }
  };

  const handleOpenInBrowser = () => {
    apiBridge.openExternalUrl(shareUrl);
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
            <h2 className="text-xl font-bold text-slate-200">Share Export</h2>
            <p className="text-sm text-slate-400 mt-1">Your file has been uploaded successfully</p>
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
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Check className="w-4 h-4 text-green-400" />
              <span className="text-xs text-green-400 font-medium">Upload successful</span>
            </div>
            <p className="text-xs text-slate-400">{fileName}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-200 mb-2 block">
              Shareable URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-200 text-sm font-mono focus:outline-none"
              />
              <Button
                onClick={handleCopy}
                variant="outline"
                size="icon"
                className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleOpenInBrowser}
              variant="outline"
              className="flex-1 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open in Browser
            </Button>
            <Button
              onClick={onClose}
              className="flex-1 bg-[#DA1F26] text-white hover:bg-[#DA1F26]/90"
            >
              Done
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}





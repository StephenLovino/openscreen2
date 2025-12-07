import { useEffect, useState, useRef } from 'react';
import { X, Download, Loader2, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import type { ExportProgress } from '@/lib/exporter';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  progress: ExportProgress | null;
  isExporting: boolean;
  error: string | null;
  exportFormat?: 'mp4' | 'gif';
  onCancel?: () => void;
}

export function ExportDialog({
  isOpen,
  onClose,
  progress,
  isExporting,
  error,
  exportFormat = 'mp4',
  onCancel,
}: ExportDialogProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const [soundNotification, setSoundNotification] = useState(() => {
    // Load from localStorage, default to true
    const saved = localStorage.getItem('exportSoundNotification');
    return saved !== null ? saved === 'true' : true;
  });
  const [estimatedFinishTime, setEstimatedFinishTime] = useState<Date | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(Date.now());

  // Save sound notification preference
  useEffect(() => {
    localStorage.setItem('exportSoundNotification', String(soundNotification));
  }, [soundNotification]);

  // Calculate estimated finish time
  useEffect(() => {
    if (isExporting && progress && progress.percentage > 0) {
      const now = Date.now();
      
      // Initialize start time on first progress
      if (startTimeRef.current === null) {
        startTimeRef.current = now;
        lastProgressRef.current = progress.percentage;
        lastUpdateTimeRef.current = now;
        return;
      }

      // Update estimate every second or when progress changes significantly
      const timeSinceLastUpdate = (now - lastUpdateTimeRef.current) / 1000;
      const progressDelta = progress.percentage - lastProgressRef.current;
      
      if (timeSinceLastUpdate >= 1 || Math.abs(progressDelta) > 1) {
        const elapsed = (now - startTimeRef.current) / 1000; // seconds
        
        if (progress.percentage > 1 && elapsed > 0) {
          // Calculate average rate: total progress / elapsed time
          const averageRate = progress.percentage / elapsed; // % per second
          const remaining = (100 - progress.percentage) / averageRate; // seconds remaining
          
          if (remaining > 0 && remaining < 7200) { // Only show if less than 2 hours
            const finishTime = new Date(now + remaining * 1000);
            setEstimatedFinishTime(finishTime);
          } else {
            setEstimatedFinishTime(null);
          }
        }
        
        lastProgressRef.current = progress.percentage;
        lastUpdateTimeRef.current = now;
      }
    } else if (!isExporting) {
      // Reset when export stops
      startTimeRef.current = null;
      lastProgressRef.current = 0;
      lastUpdateTimeRef.current = Date.now();
      setEstimatedFinishTime(null);
    }
  }, [isExporting, progress]);

  // Update estimated finish time display every second while exporting
  useEffect(() => {
    if (!isExporting || !estimatedFinishTime) return;
    
    const interval = setInterval(() => {
      // Force re-render to update time remaining
      setEstimatedFinishTime(prev => prev ? new Date(prev.getTime()) : null);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isExporting, estimatedFinishTime]);

  // Play sound notification when export completes
  useEffect(() => {
    if (!isExporting && progress && progress.percentage >= 100 && !error && soundNotification) {
      // Create a pleasant two-tone notification sound using Web Audio API
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // First tone (C5)
        const osc1 = audioContext.createOscillator();
        const gain1 = audioContext.createGain();
        osc1.type = 'sine';
        osc1.frequency.value = 523.25; // C5
        gain1.gain.setValueAtTime(0, audioContext.currentTime);
        gain1.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.05);
        gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        osc1.connect(gain1);
        gain1.connect(audioContext.destination);
        osc1.start(audioContext.currentTime);
        osc1.stop(audioContext.currentTime + 0.2);
        
        // Second tone (E5) - starts slightly after first
        const osc2 = audioContext.createOscillator();
        const gain2 = audioContext.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 659.25; // E5
        gain2.gain.setValueAtTime(0, audioContext.currentTime + 0.1);
        gain2.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
        
        osc2.connect(gain2);
        gain2.connect(audioContext.destination);
        osc2.start(audioContext.currentTime + 0.1);
        osc2.stop(audioContext.currentTime + 0.35);
      } catch (err) {
        console.warn('Could not play notification sound:', err);
      }
    }
  }, [isExporting, progress, error, soundNotification]);

  useEffect(() => {
    if (!isExporting && progress && progress.percentage >= 100 && !error) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isExporting, progress, error, onClose]);

  // Format time remaining
  const formatTimeRemaining = (): string => {
    if (!estimatedFinishTime) return 'Calculating...';
    
    const now = Date.now();
    const remaining = Math.max(0, estimatedFinishTime.getTime() - now);
    const seconds = Math.floor(remaining / 1000);
    
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  };

  // Format finish time
  const formatFinishTime = (): string => {
    if (!estimatedFinishTime) return '';
    
    const now = new Date();
    const finish = estimatedFinishTime;
    
    // If same day, show time only
    if (finish.toDateString() === now.toDateString()) {
      return finish.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Otherwise show date and time
    return finish.toLocaleString([], { 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 animate-in fade-in duration-200"
        onClick={isExporting ? undefined : onClose}
      />
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[60] bg-[#09090b] rounded-2xl shadow-2xl border border-white/10 p-8 w-[90vw] max-w-md animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {showSuccess ? (
              <>
                <div className="w-12 h-12 rounded-full bg-[#DA1F26]/20 flex items-center justify-center ring-1 ring-[#DA1F26]/50">
                  <Download className="w-6 h-6 text-[#DA1F26]" />
                </div>
                <div>
                  <span className="text-xl font-bold text-slate-200 block">Export Complete</span>
                  <span className="text-sm text-slate-400">Your {exportFormat === 'gif' ? 'GIF' : 'video'} is ready</span>
                </div>
              </>
            ) : (
              <>
                {isExporting ? (
                  <div className="w-12 h-12 rounded-full bg-[#DA1F26]/10 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-[#DA1F26] animate-spin" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                    <Download className="w-6 h-6 text-slate-200" />
                  </div>
                )}
                <div>
                  <span className="text-xl font-bold text-slate-200 block">
                    {error ? 'Export Failed' : isExporting ? (exportFormat === 'gif' ? 'Exporting GIF' : 'Exporting Video') : (exportFormat === 'gif' ? 'Export GIF' : 'Export Video')}
                  </span>
                  <span className="text-sm text-slate-400">
                    {error ? 'Please try again' : isExporting ? 'This may take a moment...' : 'Ready to start'}
                  </span>
                </div>
              </>
            )}
          </div>
          {!isExporting && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="hover:bg-white/10 text-slate-400 hover:text-white rounded-full"
            >
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        {error && (
          <div className="mb-6 animate-in slide-in-from-top-2">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
              <div className="p-1 bg-red-500/20 rounded-full">
                <X className="w-3 h-3 text-red-400" />
              </div>
              <p className="text-sm text-red-400 leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {isExporting && progress && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-400 uppercase tracking-wider">
                <span>Progress</span>
                <span className="font-mono text-slate-200">{progress.percentage.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-[#DA1F26] shadow-[0_0_10px_rgba(218,31,38,0.3)] transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(progress.percentage, 100)}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Current Frame</div>
                <div className="text-slate-200 font-mono text-lg font-medium">
                  {progress.currentFrame} <span className="text-slate-500 text-sm">/ {progress.totalFrames}</span>
                </div>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Status</div>
                <div className="text-slate-200 font-medium text-sm flex items-center gap-2 h-[28px]">
                  <span className="w-2 h-2 rounded-full bg-[#DA1F26] animate-pulse" />
                  Processing
                </div>
              </div>
            </div>

            {/* Estimated Finish Time */}
            {estimatedFinishTime && (
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Estimated Finish</div>
                <div className="text-slate-200 font-medium text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{formatFinishTime()}</span>
                    <span className="text-slate-500">({formatTimeRemaining()} remaining)</span>
                  </div>
                </div>
              </div>
            )}

            {/* Sound Notification Toggle */}
            <div className="flex items-center justify-between bg-white/5 rounded-xl p-3 border border-white/5">
              <div className="flex items-center gap-2">
                {soundNotification ? (
                  <Bell className="w-4 h-4 text-slate-400" />
                ) : (
                  <BellOff className="w-4 h-4 text-slate-500" />
                )}
                <div>
                  <div className="text-xs font-medium text-slate-200">Sound Notification</div>
                  <div className="text-[10px] text-slate-500">Play sound when export completes</div>
                </div>
              </div>
              <Switch
                checked={soundNotification}
                onCheckedChange={setSoundNotification}
                className="data-[state=checked]:bg-[#DA1F26]"
              />
            </div>

            {onCancel && (
              <div className="pt-2">
                <Button
                  onClick={onCancel}
                  variant="destructive"
                  className="w-full py-6 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 hover:border-red-500/30 transition-all rounded-xl"
                >
                  Cancel Export
                </Button>
              </div>
            )}
          </div>
        )}

        {showSuccess && (
          <div className="text-center py-4 animate-in zoom-in-95">
            <p className="text-lg text-slate-200 font-medium">{exportFormat === 'gif' ? 'GIF' : 'Video'} saved successfully!</p>
          </div>
        )}
      </div>
    </>
  );
}

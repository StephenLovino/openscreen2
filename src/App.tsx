import { useEffect, useState } from "react";
import { LaunchWindow } from "./components/launch/LaunchWindow";
import { SourceSelector } from "./components/launch/SourceSelector";
import { CameraPreview } from "./components/launch/CameraPreview";
import { CameraWarningDialog } from "./components/launch/CameraWarningDialog";
import VideoEditor from "./components/video-editor/VideoEditor";
import { SettingsWindow } from "./components/launch/SettingsWindow";

export default function App() {
  const [windowType, setWindowType] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get('windowType') || '';
    setWindowType(type);
    if (type === 'hud-overlay' || type === 'source-selector' || type === 'camera-preview' || type === 'camera-warning-dialog' || type === 'settings') {
      document.body.style.background = 'transparent';
      document.documentElement.style.background = 'transparent';
      const root = document.getElementById('root');
      if (root) {
        root.style.setProperty('background', 'transparent');
        root.style.setProperty('padding', '0');
        root.style.setProperty('margin', '0');
        root.style.setProperty('max-width', 'none');
      }
    }
  }, []);

  switch (windowType) {
    case 'hud-overlay':
      return <LaunchWindow />;
    case 'source-selector':
      return <SourceSelector />;
    case 'camera-preview':
      return <CameraPreview />;
    case 'camera-warning-dialog':
      return <CameraWarningDialog />;
    case 'settings':
      return <SettingsWindow />;
    case 'editor':
      return <VideoEditor />;
      default:
      return (
        <div className="w-full h-full bg-background text-foreground flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-bold">AHA Clips</h1>
            <p className="text-muted-foreground">Web Version</p>
            <div className="space-y-2">
              <a 
                href="/?windowType=source-selector" 
                className="block px-4 py-2 bg-[#DA1F26] text-white rounded hover:bg-[#DA1F26]/80"
              >
                Select Source & Record
              </a>
              <a 
                href="/?windowType=editor" 
                className="block px-4 py-2 bg-zinc-700 text-white rounded hover:bg-zinc-600"
              >
                Open Video Editor
              </a>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Note: Camera recording is available. Desktop recording requires Electron.
            </p>
          </div>
        </div>
      );
  }
}

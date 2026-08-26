import { Canvas, Storyboard } from "tempo-sdk/canvas";
import { ExportPresetsFirstUse } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";
import { PresetPickerOpen as PresetPickerOpen2 } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";
import { PresetApplied as PresetApplied2 } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";
import { SavePresetDialog as SavePresetDialog2 } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";
import { SavedPresetManagement as SavedPresetManagement2 } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";
import { LimitWarning as LimitWarning2 } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";
import { ExportInProgress as ExportInProgress2 } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";
import { ExportError as ExportError2 } from "../../../../src/components/video-editor/ExportPresetsDesignPreview";

export default function ExportPresetsCanvas() {
  return (
    <Canvas name="Export Presets">
      <Storyboard
        id="ExportSettingsFirstUse"
        name="1 · Export settings / first use"
        component={ExportPresetsFirstUse}
        layout={{ x: 0, y: 0, width: 720, height: 620 }}
      />
      <Storyboard
        id="PresetPickerOpen"
        name="2 · Preset picker open"
        component={PresetPickerOpen2}
        layout={{ x: 770, y: 0, width: 720, height: 620 }}
      />
      <Storyboard
        id="PresetApplied"
        name="3 · Preset applied"
        component={PresetApplied2}
        layout={{ x: 1540, y: 0, width: 720, height: 620 }}
      />
      <Storyboard
        id="SavePresetDialog"
        name="4 · Save preset dialog"
        component={SavePresetDialog2}
        layout={{ x: 0, y: 670, width: 720, height: 620 }}
      />
      <Storyboard
        id="SavedPresetManagement"
        name="5 · Saved preset management"
        component={SavedPresetManagement2}
        layout={{ x: 0, y: 1340, width: 720, height: 620 }}
      />
      <Storyboard
        id="LimitWarning"
        name="6 · Limit warning"
        component={LimitWarning2}
        layout={{ x: 0, y: 2010, width: 720, height: 620 }}
      />
      <Storyboard
        id="ExportInProgress"
        name="7 · Export in progress"
        component={ExportInProgress2}
        layout={{ x: 0, y: 2680, width: 720, height: 620 }}
      />
      <Storyboard
        id="ExportError"
        name="8 · Export error"
        component={ExportError2}
        layout={{ x: 0, y: 3350, width: 720, height: 620 }}
      />
    </Canvas>
  );
}

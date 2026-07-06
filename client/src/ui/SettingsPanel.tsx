// Settings (GDD §14, Escape or the Escape-with-nothing-open toggle): view distance,
// master volume, and rebindable keybinds. Values persist to the save's `settings`
// block (updateSettings) and mirror into the live store so the game reads them at once.
// Rebinding captures the next KeyboardEvent.code in the capture phase and swallows it,
// so the pressed key never reaches the game's input handler mid-rebind. Reserved codes
// (movement / hotbar / menu) can't be bound; picking a code another action holds swaps
// the two so no action is ever left unbound or duplicated.

import { useEffect, useState } from 'react';
import {
  KEYBIND_ACTIONS,
  KEYBIND_LABEL,
  RESERVED_CODES,
  defaultKeybinds,
  keyLabel,
  type KeybindAction,
} from '@pathlands/shared';
import type { ShadowQuality, VfxDensity } from '@pathlands/shared';
import { useStore } from '../game/store.js';
import { updateSettings, exportSave, importSave } from '../platform/saveStore.js';
import { colors, panel } from './theme.js';

/** A small segmented radio row: one highlighted option out of a fixed set. */
function Segmented<T extends string | number>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: { label: string; val: T }[];
  onPick: (v: T) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, flex: 1 }}>
      {options.map((o) => {
        const active = o.val === value;
        return (
          <button
            key={String(o.val)}
            onClick={() => onPick(o.val)}
            style={{
              flex: 1,
              background: active ? 'rgba(201,162,63,0.16)' : '#120d09',
              border: `1px solid ${active ? colors.gold : colors.panelBorder}`,
              borderRadius: 5,
              color: active ? colors.gold : colors.ink,
              cursor: 'pointer',
              fontSize: 12,
              padding: '4px 0',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsPanel(): JSX.Element | null {
  const show = useStore((s) => s.showSettings);
  const toggle = useStore((s) => s.toggleSettings);
  const cmd = useStore((s) => s.commands);
  const viewDistance = useStore((s) => s.viewDistance);
  const shadows = useStore((s) => s.shadows);
  const vfxDensity = useStore((s) => s.vfxDensity);
  const resolutionScale = useStore((s) => s.resolutionScale);
  const masterVolume = useStore((s) => s.masterVolume);
  const keybinds = useStore((s) => s.keybinds);
  const setKeybinds = useStore((s) => s.setKeybinds);
  const setMasterVolume = useStore((s) => s.setMasterVolume);

  const [listening, setListening] = useState<KeybindAction | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // While a row is "listening", grab the next key in the capture phase and swallow it
  // so the game's window keydown handler never sees it. Escape cancels; reserved codes
  // are refused with a flash; anything else rebinds (swapping any prior holder).
  useEffect(() => {
    if (!show) {
      if (listening) setListening(null);
      return;
    }
    if (!listening) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        setListening(null);
        return;
      }
      if (RESERVED_CODES.includes(e.code)) {
        setFlash(`${keyLabel(e.code)} is reserved`);
        return;
      }
      const next = { ...keybinds };
      const prevHolder = KEYBIND_ACTIONS.find((a) => a !== listening && next[a] === e.code);
      const old = next[listening];
      next[listening] = e.code;
      if (prevHolder && old) next[prevHolder] = old; // swap so nothing ends up unbound
      setKeybinds(next);
      void updateSettings({ keybinds: next });
      setListening(null);
      setFlash(null);
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [show, listening, keybinds, setKeybinds]);

  if (!show) return null;

  const setView = (n: number): void => {
    cmd?.setViewDistance(n);
    void updateSettings({ viewDistance: n });
  };
  const setShadows = (q: ShadowQuality): void => {
    cmd?.setShadows(q);
    void updateSettings({ shadows: q });
  };
  const setVfx = (d: VfxDensity): void => {
    cmd?.setVfxDensity(d);
    void updateSettings({ vfxDensity: d });
  };
  const setResolution = (scale: number): void => {
    cmd?.setResolutionScale(scale);
    void updateSettings({ resolutionScale: scale });
  };
  const setVolume = (n: number): void => {
    setMasterVolume(n);
    void updateSettings({ masterVolume: n });
  };
  const resetKeys = (): void => {
    const d = defaultKeybinds();
    setKeybinds(d);
    void updateSettings({ keybinds: d });
    setListening(null);
    setFlash(null);
  };
  const downloadBackup = (): void => {
    void exportSave().then((json) => {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pathlands-save-backup.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  };
  const restoreBackup = (file: File): void => {
    void file.text().then(async (text) => {
      const ok = await importSave(text);
      // A successful import replaces the primary save; reload so the game re-seeds
      // cleanly from it (character list, settings, everything).
      if (ok) window.location.reload();
      else setFlash('That file was not a valid Pathlands save.');
    });
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 460,
        maxHeight: '86vh',
        overflowY: 'auto',
        ...panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold, fontSize: 15 }}>Settings</b>
        <button
          onClick={toggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: colors.inkDim,
            cursor: 'pointer',
            fontSize: 16,
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ color: colors.inkDim, fontSize: 11, margin: '10px 0 4px' }}>DISPLAY</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 110, color: colors.ink }}>View distance</span>
        <input
          type="range"
          min={3}
          max={12}
          value={viewDistance}
          onChange={(e) => setView(Number(e.target.value))}
          style={{ flex: 1 }}
        />
        <span style={{ width: 44, textAlign: 'right', color: colors.gold }}>{viewDistance} ch</span>
      </label>

      <div style={{ color: colors.inkDim, fontSize: 11, margin: '10px 0 4px' }}>GRAPHICS</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 110, color: colors.ink }}>Shadows</span>
        <Segmented<ShadowQuality>
          value={shadows}
          onPick={setShadows}
          options={[
            { label: 'Off', val: 'off' },
            { label: 'Low', val: 'low' },
            { label: 'High', val: 'high' },
          ]}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 110, color: colors.ink }}>VFX density</span>
        <Segmented<VfxDensity>
          value={vfxDensity}
          onPick={setVfx}
          options={[
            { label: 'Off', val: 'off' },
            { label: 'Low', val: 'low' },
            { label: 'Full', val: 'full' },
          ]}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 110, color: colors.ink }}>Resolution</span>
        <Segmented<number>
          value={resolutionScale}
          onPick={setResolution}
          options={[
            { label: '75%', val: 0.75 },
            { label: '85%', val: 0.85 },
            { label: '100%', val: 1 },
          ]}
        />
      </label>

      <div style={{ color: colors.inkDim, fontSize: 11, margin: '10px 0 4px' }}>AUDIO</div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ width: 110, color: colors.ink }}>Master volume</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(masterVolume * 100)}
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          style={{ flex: 1 }}
        />
        <span style={{ width: 44, textAlign: 'right', color: colors.gold }}>
          {Math.round(masterVolume * 100)}%
        </span>
      </label>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          margin: '12px 0 4px',
        }}
      >
        <span style={{ color: colors.inkDim, fontSize: 11 }}>KEYBINDS</span>
        <button
          onClick={resetKeys}
          style={{
            background: '#3a2c1e',
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 5,
            color: colors.inkDim,
            cursor: 'pointer',
            fontSize: 11,
            padding: '3px 10px',
          }}
        >
          Reset to defaults
        </button>
      </div>
      {flash && <div style={{ color: '#d98a4b', fontSize: 11, marginBottom: 6 }}>{flash}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {KEYBIND_ACTIONS.map((action) => {
          const active = listening === action;
          return (
            <div
              key={action}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span style={{ color: colors.ink }}>{KEYBIND_LABEL[action]}</span>
              <button
                onClick={() => {
                  setFlash(null);
                  setListening(active ? null : action);
                }}
                style={{
                  minWidth: 84,
                  background: active ? 'rgba(201,162,63,0.16)' : '#120d09',
                  border: `1px solid ${active ? colors.gold : colors.panelBorder}`,
                  borderRadius: 5,
                  color: active ? colors.gold : colors.ink,
                  cursor: 'pointer',
                  fontSize: 12,
                  padding: '4px 10px',
                }}
              >
                {active ? 'Press a key…' : keyLabel(keybinds[action] ?? '')}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ color: colors.inkDim, fontSize: 10, marginTop: 10, lineHeight: 1.4 }}>
        Movement (WASD / Space / Shift), the hotbar digits, and Escape are fixed.
      </div>

      <div style={{ color: colors.inkDim, fontSize: 11, margin: '14px 0 4px' }}>SAVE DATA</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={downloadBackup}
          style={{
            flex: 1,
            background: '#3a2c1e',
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 6,
            color: colors.ink,
            cursor: 'pointer',
            fontSize: 12,
            padding: '6px',
          }}
        >
          Download backup
        </button>
        <label
          style={{
            flex: 1,
            background: '#3a2c1e',
            border: `1px solid ${colors.panelBorder}`,
            borderRadius: 6,
            color: colors.ink,
            cursor: 'pointer',
            fontSize: 12,
            padding: '6px',
            textAlign: 'center',
          }}
        >
          Restore from file
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) restoreBackup(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <div style={{ color: colors.inkDim, fontSize: 10, marginTop: 6, lineHeight: 1.4 }}>
        Your save lives in this browser. Download a backup before clearing site data or switching
        machines; restoring replaces the current save and reloads.
      </div>
    </div>
  );
}

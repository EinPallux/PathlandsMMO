// Onboarding (GDD §13): title → character list → creation → enter the world.
// Characters persist to IndexedDB via the save store. This gates the 3D game: the
// canvas + HUD only mount once a character is entered.

import { useEffect, useState } from 'react';
import {
  CharacterClass,
  CHARACTER_CLASSES,
  CLASS_INFO,
  SKIN_TONES,
  HAIR_COLORS,
  createCharacter,
  type CharacterSave,
  type SaveGame,
} from '@pathlands/shared';
import { loadSave, persistSave } from '../platform/saveStore.js';
import { CLASS_PORTRAITS } from '../platform/assetManifest.js';
import { colors, panel } from './theme.js';

// Brookhollow plaza (matches game.ts SPAWN); y is re-grounded by the game on spawn.
const SPAWN_X = 1536.5;
const SPAWN_Z = 1524.5;

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

const shell: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 18,
  background: 'radial-gradient(circle at 50% 30%, #2a2016, #120d08)',
  color: colors.ink,
  fontFamily: 'system-ui, sans-serif',
  pointerEvents: 'auto',
};

export function Onboarding({
  onEnter,
}: {
  onEnter: (c: CharacterSave, account: SaveGame['account'], settings: SaveGame['settings']) => void;
}): JSX.Element {
  const [save, setSave] = useState<SaveGame | null>(null);
  const [screen, setScreen] = useState<'title' | 'select' | 'create'>('title');

  useEffect(() => {
    void loadSave().then(setSave);
  }, []);

  const commit = async (next: SaveGame): Promise<void> => {
    setSave(next);
    await persistSave(next);
  };

  if (!save) {
    return (
      <div style={shell}>
        <div style={{ color: colors.inkDim }}>Loading…</div>
      </div>
    );
  }

  if (screen === 'title') {
    return (
      <div style={shell}>
        <h1 style={{ fontSize: 58, letterSpacing: 6, margin: 0, color: colors.gold }}>PATHLANDS</h1>
        <div style={{ color: colors.inkDim, marginTop: -8, letterSpacing: 2 }}>
          The road is the game.
        </div>
        <button style={bigBtn} onClick={() => setScreen('select')}>
          Play
        </button>
      </div>
    );
  }

  if (screen === 'create') {
    return (
      <CreateScreen
        onCancel={() => setScreen('select')}
        onCreate={(c) => {
          void commit({ ...save, characters: [...save.characters, c] }).then(() =>
            onEnter(c, save.account, save.settings),
          );
        }}
      />
    );
  }

  // select
  return (
    <div style={shell}>
      <h2 style={{ color: colors.gold, margin: 0 }}>Choose your Wayfarer</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 380 }}>
        {save.characters.length === 0 && (
          <div style={{ ...panel, textAlign: 'center', color: colors.inkDim }}>
            No Wayfarers yet. Create one to begin.
          </div>
        )}
        {save.characters.map((c) => (
          <div key={c.id} style={{ ...panel, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <b>{c.name}</b>
              <div style={{ fontSize: 12, color: colors.inkDim }}>
                Level {c.level} {CLASS_INFO[c.class as CharacterClass]?.name ?? c.class}
              </div>
            </div>
            <button style={smallBtn} onClick={() => onEnter(c, save.account, save.settings)}>
              Enter
            </button>
            <button
              style={{ ...smallBtn, borderColor: '#7a3b34' }}
              onClick={() =>
                void commit({ ...save, characters: save.characters.filter((x) => x.id !== c.id) })
              }
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button style={bigBtn} onClick={() => setScreen('create')}>
        + New Wayfarer
      </button>
    </div>
  );
}

function CreateScreen({
  onCreate,
  onCancel,
}: {
  onCreate: (c: CharacterSave) => void;
  onCancel: () => void;
}): JSX.Element {
  const [cls, setCls] = useState<CharacterClass>(CharacterClass.Warrior);
  const [name, setName] = useState('');
  const [skin, setSkin] = useState(0);
  const [hair, setHair] = useState(1);

  const create = (): void => {
    const finalName = name.trim() || CLASS_INFO[cls].name;
    onCreate(createCharacter(genId(), finalName, cls, { skin, hair }, SPAWN_X, 0, SPAWN_Z));
  };

  return (
    <div style={shell}>
      <h2 style={{ color: colors.gold, margin: 0 }}>Create a Wayfarer</h2>

      <div style={{ display: 'flex', gap: 10 }}>
        {CHARACTER_CLASSES.map((c) => {
          const info = CLASS_INFO[c];
          const portrait = CLASS_PORTRAITS[c];
          const active = c === cls;
          return (
            <button
              key={c}
              onClick={() => setCls(c)}
              style={{
                ...panel,
                width: 150,
                padding: 8,
                cursor: 'pointer',
                border: `2px solid ${active ? colors.gold : colors.panelBorder}`,
                background: active ? 'rgba(201,162,63,0.14)' : (panel.background as string),
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  height: 120,
                  borderRadius: 6,
                  background: '#0d0a07',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {portrait ? (
                  <img
                    src={`/${portrait}`}
                    alt={info.name}
                    style={{ maxWidth: '100%', maxHeight: '100%', imageRendering: 'pixelated' }}
                  />
                ) : (
                  <span style={{ fontSize: 44 }}>🪄</span>
                )}
              </div>
              <b
                style={{ display: 'block', marginTop: 6, color: active ? colors.gold : colors.ink }}
              >
                {info.name}
              </b>
              <div style={{ fontSize: 11, color: colors.inkDim, minHeight: 28 }}>{info.role}</div>
            </button>
          );
        })}
      </div>

      <div style={{ ...panel, width: 470, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 60, color: colors.inkDim }}>Name</span>
          <input
            value={name}
            maxLength={16}
            placeholder={CLASS_INFO[cls].name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            style={{
              flex: 1,
              background: '#0d0a07',
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: 6,
              color: colors.ink,
              padding: '7px 9px',
              fontSize: 14,
            }}
          />
        </label>
        <Swatches label="Skin" colorsList={SKIN_TONES} value={skin} onPick={setSkin} />
        <Swatches label="Hair" colorsList={HAIR_COLORS} value={hair} onPick={setHair} />
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button style={{ ...bigBtn, background: '#3a2c1e' }} onClick={onCancel}>
          Back
        </button>
        <button style={bigBtn} onClick={create}>
          Enter the Vale
        </button>
      </div>
    </div>
  );
}

function Swatches({
  label,
  colorsList,
  value,
  onPick,
}: {
  label: string;
  colorsList: readonly number[];
  value: number;
  onPick: (i: number) => void;
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 60, color: colors.inkDim }}>{label}</span>
      <div style={{ display: 'flex', gap: 6 }}>
        {colorsList.map((c, i) => (
          <button
            key={i}
            onClick={() => onPick(i)}
            title={hex(c)}
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: hex(c),
              cursor: 'pointer',
              border: `2px solid ${value === i ? colors.gold : 'rgba(0,0,0,0.5)'}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

const bigBtn: React.CSSProperties = {
  background: colors.accent,
  border: 'none',
  borderRadius: 8,
  color: '#12200c',
  padding: '11px 28px',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
};

const smallBtn: React.CSSProperties = {
  background: '#3a2c1e',
  border: `1px solid ${colors.panelBorder}`,
  borderRadius: 6,
  color: colors.ink,
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 13,
};

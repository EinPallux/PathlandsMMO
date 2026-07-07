// Combat HUD: player frame (HP/resource/XP), target frame (HP/cast), hotbar with
// cooldowns, and floating combat text. Reads the combat slice the CombatDirector
// publishes; buttons call back through GameCommands. Purely presentational.

import { useStore, type HotbarSlot } from '../game/store.js';
import { colors, panel } from './theme.js';
import { useHoverTip, TooltipPortal, SkillTooltipCard } from './Tooltip.js';

/** One hotbar button with a skill tooltip on hover. */
function HotbarButton({
  slot,
  keyLabel,
  onCast,
}: {
  slot: HotbarSlot;
  keyLabel: string;
  onCast: () => void;
}): JSX.Element {
  const { pos, handlers } = useHoverTip();
  return (
    <>
      <button
        {...handlers}
        onClick={onCast}
        style={{
          position: 'relative',
          width: 46,
          height: 46,
          borderRadius: 6,
          border: `1px solid ${colors.panelBorder}`,
          background: slot.ready ? '#43331f' : '#2a2018',
          color: slot.ready ? colors.ink : colors.inkDim,
          cursor: 'pointer',
          overflow: 'hidden',
          fontSize: 10,
          padding: 2,
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: 3, color: colors.gold, fontSize: 10 }}>
          {keyLabel}
        </span>
        <span style={{ display: 'block', marginTop: 14, lineHeight: 1.05 }}>
          {slot.name.split(' ')[0]}
        </span>
        {slot.cooldownFrac > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: `${slot.cooldownFrac * 100}%`,
              background: 'rgba(0,0,0,0.6)',
            }}
          />
        )}
      </button>
      {pos && (
        <TooltipPortal pos={pos}>
          <SkillTooltipCard skillId={slot.skillId} />
        </TooltipPortal>
      )}
    </>
  );
}

const RESOURCE_COLOR: Record<string, string> = {
  rage: '#b5423a',
  focus: '#c98a3a',
  mana: '#3a6fc9',
};

function Bar({
  frac,
  color,
  bg = '#000',
  height = 14,
  label,
}: {
  frac: number;
  color: string;
  bg?: string;
  height?: number;
  label?: string;
}): JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        height,
        background: bg,
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid rgba(0,0,0,0.6)',
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(1, frac)) * 100}%`,
          height: '100%',
          background: color,
          transition: 'width 0.1s linear',
        }}
      />
      {label && (
        <span
          style={{
            position: 'absolute',
            inset: 0,
            textAlign: 'center',
            fontSize: 11,
            lineHeight: `${height}px`,
            color: '#fff',
            textShadow: '0 1px 2px #000',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

function PlayerFrame(): JSX.Element | null {
  const combat = useStore((s) => s.combat);
  const cmd = useStore((s) => s.commands);
  if (!combat) return null;
  const p = combat.player;
  const rColor = RESOURCE_COLOR[p.resourceKind] ?? colors.accent;

  return (
    <div style={{ position: 'absolute', left: 12, bottom: 12, width: 240, ...panel }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: colors.gold }}>{p.className}</b>
        <span style={{ fontSize: 12, color: colors.inkDim }}>Level {p.level}</span>
      </div>
      <div style={{ marginTop: 5 }}>
        <Bar frac={p.hp / p.maxHP} color="#4caf50" label={`${p.hp} / ${p.maxHP}`} />
      </div>
      <div style={{ marginTop: 4 }}>
        <Bar
          frac={p.maxResource > 0 ? p.resource / p.maxResource : 0}
          color={rColor}
          height={10}
          label={p.maxResource > 0 ? `${p.resourceKind} ${p.resource}` : ''}
        />
      </div>
      <div style={{ marginTop: 4 }}>
        <Bar frac={p.xpForLevel > 0 ? p.xp / p.xpForLevel : 1} color={colors.gold} height={6} />
      </div>
      {!p.alive && (
        <div style={{ marginTop: 8, textAlign: 'center' }}>
          <div style={{ color: '#e0736b', fontWeight: 700, marginBottom: 6 }}>You are slain.</div>
          <button
            onClick={() => cmd?.releaseSpirit()}
            style={{
              background: colors.accent,
              border: 'none',
              borderRadius: 6,
              color: '#12200c',
              padding: '6px 14px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Release Spirit (Enter)
          </button>
        </div>
      )}
    </div>
  );
}

function TargetFrame(): JSX.Element | null {
  const target = useStore((s) => s.combat?.target ?? null);
  if (!target) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 220,
        ...panel,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <b style={{ color: target.hostile ? '#e0736b' : colors.ink }}>{target.name}</b>
        <span style={{ fontSize: 12, color: colors.inkDim }}>Lv {target.level}</span>
      </div>
      <div style={{ marginTop: 5 }}>
        <Bar
          frac={target.hp / target.maxHP}
          color={target.hostile ? '#c0392b' : '#4caf50'}
          label={`${target.hp} / ${target.maxHP}`}
        />
      </div>
      {target.castSkill && (
        <div style={{ marginTop: 4 }}>
          <Bar frac={target.castFrac} color="#d8b24a" height={8} label={target.castSkill} />
        </div>
      )}
    </div>
  );
}

function Hotbar(): JSX.Element | null {
  const hotbar = useStore((s) => s.combat?.hotbar ?? null);
  const auto = useStore((s) => s.combat?.autoAttack ?? false);
  const cmd = useStore((s) => s.commands);
  if (!hotbar || hotbar.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        alignItems: 'flex-end',
        pointerEvents: 'auto',
      }}
    >
      {hotbar.map((slot, i) => {
        const key = i === 9 ? '0' : String(i + 1);
        return (
          <HotbarButton
            key={slot.skillId}
            slot={slot}
            keyLabel={key}
            onCast={() => cmd?.castSlot(i)}
          />
        );
      })}
      <button
        onClick={() => cmd?.toggleAutoAttack()}
        title="Auto-attack (R)"
        style={{
          width: 46,
          height: 46,
          borderRadius: 6,
          border: `1px solid ${auto ? colors.accent : colors.panelBorder}`,
          background: auto ? colors.accent : '#2a2018',
          color: auto ? '#12200c' : colors.inkDim,
          cursor: 'pointer',
          fontSize: 10,
          fontWeight: 600,
        }}
      >
        Auto
      </button>
    </div>
  );
}

const FLOATER_COLOR: Record<string, string> = {
  damage: '#f2f2f2',
  crit: '#ffd23f',
  heal: '#5fbf4e',
  xp: '#8fe6f0',
  miss: '#b8a888',
};

function CombatText(): JSX.Element {
  const floaters = useStore((s) => s.floaters);
  return (
    <>
      {floaters.map((f) => (
        <div
          key={f.id}
          style={{
            position: 'absolute',
            left: f.sx,
            top: f.sy,
            transform: 'translate(-50%, -50%)',
            color: FLOATER_COLOR[f.kind] ?? '#fff',
            fontWeight: f.kind === 'crit' ? 800 : 700,
            fontSize: f.kind === 'crit' ? 22 : 15,
            textShadow: '0 1px 3px #000',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {f.kind === 'crit' ? `${f.text}!` : f.text}
        </div>
      ))}
    </>
  );
}

export function CombatHud(): JSX.Element {
  return (
    <>
      <PlayerFrame />
      <TargetFrame />
      <Hotbar />
      <CombatText />
    </>
  );
}

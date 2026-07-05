// Shared inline-style tokens for the Phase-1 overlay UI. A proper parchment/wood
// UI kit arrives in Phase 5 (ART_GUIDE §7); this keeps panels consistent for now.

import type { CSSProperties } from 'react';

export const colors = {
  panelBg: 'rgba(26, 20, 16, 0.82)',
  panelBorder: '#4f3a26',
  ink: '#f2ead9',
  inkDim: '#b8a888',
  gold: '#c9a23f',
  accent: '#6fa84e',
};

export const panel: CSSProperties = {
  background: colors.panelBg,
  border: `1px solid ${colors.panelBorder}`,
  borderRadius: 8,
  padding: '10px 12px',
  color: colors.ink,
  fontSize: 13,
  lineHeight: 1.5,
  backdropFilter: 'blur(3px)',
  pointerEvents: 'auto',
};

export const button: CSSProperties = {
  background: '#3a2c1e',
  border: `1px solid ${colors.panelBorder}`,
  borderRadius: 6,
  color: colors.ink,
  padding: '5px 9px',
  cursor: 'pointer',
  fontSize: 12,
};

export const buttonActive: CSSProperties = {
  ...button,
  background: colors.accent,
  borderColor: colors.accent,
  color: '#12200c',
  fontWeight: 600,
};

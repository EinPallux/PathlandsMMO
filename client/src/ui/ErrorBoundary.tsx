// Top-level React error boundary (Phase 5 resilience). If any UI throws during
// render, the app shows a calm bug-report screen instead of a white void: the
// error details (copyable), a one-click save-backup download so progress isn't
// lost to the crash, and a reload button. Error boundaries must be class
// components — this is the one class in the UI layer by necessity.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { exportSave } from '../platform/saveStore.js';
import { colors } from './theme.js';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
}

const box = {
  background: '#241a11',
  border: `1px solid ${colors.panelBorder}`,
  borderRadius: 6,
  color: colors.ink,
  cursor: 'pointer',
  fontSize: 13,
  padding: '8px 14px',
} as const;

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info: info.componentStack ?? '' });
    // Keep a console trail for anyone with devtools open.
    console.error('Pathlands UI crashed:', error, info.componentStack);
  }

  private details(): string {
    const { error, info } = this.state;
    return [
      `Pathlands error report`,
      `Message: ${error?.message ?? 'unknown'}`,
      ``,
      `Stack:`,
      error?.stack ?? '(none)',
      ``,
      `Component stack:`,
      info || '(none)',
      ``,
      `UserAgent: ${navigator.userAgent}`,
    ].join('\n');
  }

  private copy = (): void => {
    void navigator.clipboard?.writeText(this.details()).catch(() => {});
  };

  private backup = (): void => {
    void exportSave().then((json) => {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pathlands-save-backup.json';
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(ellipse at center, #1c1611 0%, #0c0906 100%)',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ width: 560, maxWidth: '92vw', color: colors.ink }}>
          <div style={{ color: colors.gold, fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            The path buckled underfoot.
          </div>
          <div style={{ color: colors.inkDim, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
            Something in the interface hit an error. Your save is intact — download a backup below
            to be safe, then reload. If it keeps happening, copy the details for a bug report.
          </div>
          <pre
            style={{
              background: '#120d09',
              border: `1px solid ${colors.panelBorder}`,
              borderRadius: 6,
              color: '#e0b9a0',
              fontSize: 11,
              lineHeight: 1.4,
              margin: '0 0 12px',
              maxHeight: 180,
              overflow: 'auto',
              padding: 10,
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.message}
          </pre>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ ...box, background: colors.gold, color: '#1c1206', fontWeight: 700 }}
            >
              Reload game
            </button>
            <button onClick={this.backup} style={box}>
              Download save backup
            </button>
            <button onClick={this.copy} style={box}>
              Copy error details
            </button>
          </div>
        </div>
      </div>
    );
  }
}

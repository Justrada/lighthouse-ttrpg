import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Top-level guard: a render-time throw anywhere in the tree shows a recoverable
 * fallback instead of unmounting the whole app to a blank screen. Saved data
 * lives in localStorage, so a reload relights everything.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error('Uncaught render error:', error);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center bg-void px-6 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="font-display text-2xl text-glow-beam">Something went dark</h1>
            <p className="text-sm text-ink-muted">
              The beam flickered and something failed to render. Reloading usually relights it —
              your saved heroes and systems are safe in this browser.
            </p>
            <button
              type="button"
              onClick={() => window.location.assign(import.meta.env.BASE_URL || '/')}
              className="rounded-xl border border-beam/40 bg-beam/10 px-4 py-2 text-sm text-beam-soft transition hover:bg-beam/20 focus-visible:outline-none"
            >
              Return to the lighthouse
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'Une erreur inattendue est survenue.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Chess Lab ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0d1118] text-slate-100 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/40 bg-[#151c27] p-6 space-y-4 text-center shadow-2xl">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/15 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold">Oups, une erreur est survenue</h1>
            <p className="text-xs text-slate-400 break-words max-h-28 overflow-y-auto">
              {this.state.message}
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false, message: '' })}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm min-h-[44px]"
              >
                <span>Reprendre sans recharger</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl border border-slate-700 hover:border-sky-400 text-slate-200 font-medium text-xs min-h-[40px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recharger Chess Lab</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

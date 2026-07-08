"use client";
import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 p-6">
            <div className="text-center">
              <p className="text-sm font-semibold text-rose-800">组件加载失败</p>
              <p className="mt-1 text-xs text-rose-600">{this.state.error?.message ?? "未知错误"}</p>
              <button
                onClick={() => this.setState({ hasError: false, error: undefined })}
                className="mt-3 rounded-md bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-200"
              >
                重试
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}

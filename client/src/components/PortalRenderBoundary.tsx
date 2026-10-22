import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

type PortalKind = "application" | "customer" | "admin";

interface PortalRenderBoundaryProps {
  children: ReactNode;
  portal: PortalKind;
}

interface PortalRenderBoundaryState {
  error: Error | null;
}

/**
 * Keeps a render failure inside the affected workspace visible and recoverable.
 * The boundary is deliberately placed around each portal's main content so a
 * broken feature panel cannot take the header, navigation, or sibling portal
 * surfaces down with it.
 */
export default class PortalRenderBoundary extends Component<
  PortalRenderBoundaryProps,
  PortalRenderBoundaryState
> {
  state: PortalRenderBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PortalRenderBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Arbitrade render recovery] ${this.props.portal}`, error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const location = this.props.portal === "application"
      ? "application"
      : `${this.props.portal} workspace`;

    return (
      <section
        className={`portal-render-error portal-render-error--${this.props.portal}`}
        role="alert"
        aria-live="assertive"
        aria-labelledby="portal-render-error-title"
      >
        <span className="portal-render-error__icon" aria-hidden="true">
          <AlertTriangle size={22} />
        </span>
        <p className="portal-render-error__eyebrow">ARBITRADE · RECOVERY</p>
        <h2 id="portal-render-error-title">This {location} could not be displayed</h2>
        <p className="portal-render-error__description">
          A page component encountered a rendering error. The error is recorded in the browser console,
          and you can reload this workspace to try again.
        </p>
        <details className="portal-render-error__details">
          <summary>Technical details</summary>
          <pre>{error.stack || error.message}</pre>
        </details>
        <button
          type="button"
          className="portal-render-error__reload"
          onClick={() => window.location.reload()}
        >
          <RotateCcw size={15} aria-hidden="true" />
          Reload workspace
        </button>
      </section>
    );
  }
}

import * as React from "react";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type WiseBondButtonStatus = "idle" | "loading" | "success" | "error";
type WiseBondButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "icon";

type WiseBondButtonProps = React.ComponentProps<"button"> & {
  variant?: WiseBondButtonVariant;
  status?: WiseBondButtonStatus;
  loadingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  iconOnly?: boolean;
};

/** Shared semantic action control for portal workflows. Business success must be supplied by the caller. */
export function WiseBondButton({
  className,
  children,
  variant = "secondary",
  status = "idle",
  loadingLabel = "Working…",
  successLabel,
  errorLabel,
  iconOnly = false,
  disabled,
  ...props
}: WiseBondButtonProps) {
  const isLoading = status === "loading";
  const label = status === "loading" ? loadingLabel : status === "success" ? successLabel : status === "error" ? errorLabel : undefined;
  const content = label ?? children;
  const hasAccessibleName = Boolean(props["aria-label"] || props["aria-labelledby"] || (typeof content === "string" && content.trim()));

  return (
    <>
      <button
        {...props}
        type={props.type ?? "button"}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        aria-disabled={disabled || isLoading || undefined}
        data-wb-button="true"
        data-wb-variant={variant}
        data-wb-state={status}
        data-wb-icon-only={iconOnly || undefined}
        className={cn("wb-button", `wb-button--${variant}`, className)}
      >
        <span className="wb-button-feedback" aria-hidden="true">
          {isLoading ? <LoaderCircle className="wb-button-spinner" size={16} /> : status === "success" ? <Check size={16} /> : status === "error" ? <CircleAlert size={16} /> : null}
        </span>
        <span className="wb-button-label">{content}</span>
        {!hasAccessibleName && <span className="sr-only">Action</span>}
      </button>
      {label && <span className="wb-live-region" role="status" aria-live="polite">{label}</span>}
    </>
  );
}

export type { WiseBondButtonProps, WiseBondButtonStatus, WiseBondButtonVariant };

/**
 * Resolve a stable accessible name for the keyboard-focusable table scroll region.
 * Runtime data can cross JS boundaries despite the TypeScript prop type.
 */
export function resolveTableContainerLabel(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : "Scrollable table";
}

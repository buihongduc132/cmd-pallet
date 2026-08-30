/**
 * cmd-pallet — template interpolation
 */

export function interpolate(template: string, args: string | string[]): string {
  if (template == null) return "";
  const full = Array.isArray(args) ? args.join(" ") : String(args ?? "");
  const parts = full.trim() ? full.trim().split(/\s+/) : [];

  return String(template).replace(
    /\$\{@:(\d+)(?::(\d+))?\}|\$ARGUMENTS|\$@|\{\{args\}\}|\$([1-9])/g,
    (match, startRaw, lenRaw, num) => {
      if (match === "$ARGUMENTS" || match === "$@" || match === "{{args}}") {
        return full;
      }
      if (num) {
        const idx = parseInt(num, 10) - 1;
        return parts[idx] || "";
      }
      if (startRaw) {
        const start = Math.max(1, parseInt(startRaw, 10)) - 1;
        const slice = parts.slice(start);
        if (lenRaw) {
          return slice.slice(0, Math.max(0, parseInt(lenRaw, 10))).join(" ");
        }
        return slice.join(" ");
      }
      return match;
    }
  );
}

export function buildInvocation(name: string, args: string): string {
  const extra = String(args || "").trim();
  const slash = String(name || "").replace(/^\//, "");
  return extra ? `/${slash} ${extra}` : `/${slash}`;
}

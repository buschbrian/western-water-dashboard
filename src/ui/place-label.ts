/**
 * A published HUC-2 name inside a control that already says "Region".
 *
 * The roster keeps the complete official name because summaries and mixed
 * level menus need it. A one-level group or select supplies that context
 * itself, so repeating the suffix on every row adds no information.
 */
export function regionNameInContext(name: string): string {
  const suffix = " Region";
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

/**
 * Shell-quoting for the commands the UI puts in a copy button.
 *
 * The catalog ids and host ids these commands interpolate are publisher/registry
 * data, so they are quoted before they are shown as one shell word — a value
 * that carries a space, quote or shell metacharacter must not become an extra
 * argument or a second command.
 */

/** Quote one shell argument only when it needs it. Host ids never do. */
export function shellArg(value: string): string {
  if (/^[A-Za-z0-9._:@/+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

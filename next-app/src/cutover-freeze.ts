export function writeFrozen(method: string, frozen: boolean): boolean {
  return frozen && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

/** A monotonic sequence prevents an older async refresh from winning a race. */
export function createRefreshSequence() {
  let latest = 0
  return {
    begin(): number {
      latest += 1
      return latest
    },
    isCurrent(sequence: number): boolean {
      return sequence === latest
    },
  }
}

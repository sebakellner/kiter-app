// Folder paths arrive with the platform separator, so the suggested Pack name is
// the last path segment on both macOS and Windows.
export function suggestPackName(directory: string): string {
  const segments = directory
    .split(/[\\/]+/)
    .filter((segment) => segment.length > 0)
  return (segments.at(-1) ?? directory).trim()
}

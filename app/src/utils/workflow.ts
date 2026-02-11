export const formatDuration = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return null;
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

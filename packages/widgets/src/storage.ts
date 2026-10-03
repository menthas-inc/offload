// 036. What the Storage row says, decided once so the phones and the web
// cannot drift: "312 MB of 1 GB". Rounded down, so the figure never says
// more is kept than is.

const MB = 1024 * 1024;
const GB = 1024 * MB;

function size(bytes: number): string {
  if (bytes < GB) return `${Math.floor(bytes / MB)} MB`;
  const tenths = Math.floor((bytes / GB) * 10) / 10;
  return `${tenths} GB`;
}

export function storageFigure(usedBytes: number, limitBytes: number): string {
  return `${size(usedBytes)} of ${size(limitBytes)}`;
}

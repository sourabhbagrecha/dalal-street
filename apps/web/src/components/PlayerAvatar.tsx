export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

interface PlayerAvatarProps {
  name: string;
  className: string;
  /** e.g. "victim" — marks the avatar a table-moment callout is pointing at. */
  'data-role'?: string;
  /** "true" marks the chip as the viewer's own — a gold ring, stacked outside any victim ring. */
  'data-self'?: string;
}

export function PlayerAvatar({ name, className, 'data-role': dataRole, 'data-self': dataSelf }: PlayerAvatarProps) {
  return (
    <div className={className} data-role={dataRole} data-self={dataSelf} aria-hidden>
      {initialsFromName(name)}
    </div>
  );
}

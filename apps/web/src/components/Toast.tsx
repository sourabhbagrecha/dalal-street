import { useEffect } from 'react';
import { useGameStore } from '../store';

export function Toast() {
  const rejected = useGameStore((api) => api.getSnapshot().rejected);
  const clearRejected = useGameStore((api) => api.clearRejected);

  useEffect(() => {
    if (!rejected) return;
    const t = window.setTimeout(() => clearRejected(), 2800);
    return () => window.clearTimeout(t);
  }, [rejected, clearRejected]);

  if (!rejected) return null;

  return (
    <div className="toast toast--error" role="alert" data-testid="toast-rejected">
      {rejected}
    </div>
  );
}

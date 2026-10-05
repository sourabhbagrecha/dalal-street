import { useEffect, useMemo } from 'react';
import qrcode from 'qrcode-generator';
import { LobbyIcon } from './icons';

/** The invite link as an SVG path of dark modules on a 1-unit grid, plus the grid size. */
function qrPath(text: string): { d: string; size: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    }
  }
  return { d, size };
}

/**
 * The invite link as a QR code in a bottom sheet, for players in the same room to scan with their camera. Its own
 * module so the encoder only downloads when someone opens it (see InviteCard). Dark modules on a white field with a
 * four-module quiet zone: cameras need the contrast even though the lobby is dark.
 */
export default function QrSheet({ open, url, code, onClose }: { open: boolean; url: string; code: string; onClose(): void }) {
  const qr = useMemo(() => qrPath(url), [url]);
  const quiet = 4;
  const span = qr.size + quiet * 2;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div className="lb-sheet lb-sheet--qr" data-open={open} role="dialog" aria-modal="true" aria-label="Scan to join" aria-hidden={!open} inert={!open}>
      <div className="lb-sheet__scrim" onClick={onClose} />
      <div className="lb-sheet__panel">
        <div className="lb-sheet__head">
          <span className="lb-sheet__grip" aria-hidden />
          <b>Scan to join</b>
          <button type="button" className="lb-iconbtn" aria-label="Close QR code" onClick={onClose}>
            <LobbyIcon name="x" />
          </button>
        </div>
        <div className="lb-qr">
          <div className="lb-qr__frame">
            <i aria-hidden />
            <i aria-hidden />
            <i aria-hidden />
            <i aria-hidden />
            <svg
              className="lb-qr__code"
              data-testid="invite-qr"
              viewBox={`0 0 ${span} ${span}`}
              role="img"
              aria-label={`QR code for ${url}`}
              shapeRendering="crispEdges"
            >
              <rect width={span} height={span} fill="#fff" />
              <path transform={`translate(${quiet} ${quiet})`} d={qr.d} fill="#14110e" />
            </svg>
            <span className="lb-qr__scan" aria-hidden />
          </div>
          <div className="lb-qr__tear" aria-hidden />
          <div className="lb-qr__stub">
            <span className="lb-eyebrow">Room code</span>
            <b className="lb-qr__room">{code}</b>
            <p className="lb-qr__hint">Point your camera here to take a seat</p>
          </div>
        </div>
      </div>
    </div>
  );
}

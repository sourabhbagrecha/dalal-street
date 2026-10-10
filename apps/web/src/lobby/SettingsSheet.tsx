import { useEffect } from 'react';
import { THEME_CURRENCY } from '@monopoly-deal/shared';
import type { PropertyThemeId, RoomSettings, TurnSeconds } from '@monopoly-deal/shared';
import { CURRENCIES } from '../theme';
import { LobbyIcon } from './icons';

interface Option<T> {
  value: T;
  label: string;
  sub?: string;
}

/** The option lists are the only place labels are written: the sheet and the summary both read from them. */
const TURN_OPTIONS: readonly Option<TurnSeconds>[] = [
  { value: 10, label: '10s', sub: 'Rapid fire' },
  { value: 30, label: '30s', sub: 'Quick' },
  { value: 60, label: '60s', sub: 'Standard' },
  { value: null, label: 'No timer', sub: 'Take your time' },
];

const PROPERTY_OPTIONS: readonly Option<PropertyThemeId>[] = [
  { value: 'india', label: 'Indian', sub: 'Mumbai, Pune & more' },
  { value: 'classic', label: 'Classic', sub: 'Original names' },
  { value: 'usa', label: 'US', sub: 'New York & more' },
  { value: 'europe', label: 'Europe', sub: 'London, Paris & more' },
];

function labelFor<T>(options: readonly Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? '';
}

/** One line for the home page and the waiting room, e.g. "60s turns · Indian · ₹". */
export function settingsSummary(settings: RoomSettings): string {
  const turn = labelFor(TURN_OPTIONS, settings.turnSeconds);
  const turnText = settings.turnSeconds === null ? turn : `${turn} turns`;
  return `${turnText} · ${labelFor(PROPERTY_OPTIONS, settings.propertyTheme)} · ${CURRENCIES[settings.currency].symbol}`;
}

/**
 * Advanced settings for a table the host is about to deal, in the same bottom sheet as the chat and QR. With `onChange`
 * the options are live; without it they show the host's choice read-only. The sheet never keeps its own copy of the
 * value: the caller passes the room's settings and they update when the server broadcasts them.
 */
export function SettingsSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose(): void;
  value: RoomSettings;
  /** Absent = read-only: the options show the host's choice and cannot be changed. */
  onChange?: (next: RoomSettings) => void;
}) {
  const readOnly = !onChange;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div
      className="lb-sheet lb-sheet--settings"
      data-testid="settings-sheet"
      data-open={open}
      role="dialog"
      aria-modal="true"
      aria-label="Advanced settings"
      aria-hidden={!open}
      inert={!open}
    >
      <div className="lb-sheet__scrim" onClick={onClose} />
      <div className="lb-sheet__panel">
        <div className="lb-sheet__head">
          <span className="lb-sheet__grip" aria-hidden />
          <b>Advanced settings</b>
          <button type="button" className="lb-iconbtn" aria-label="Close settings" onClick={onClose}>
            <LobbyIcon name="x" />
          </button>
        </div>

        <div className="lb-settings">
          <OptionGroup
            name="Turn timer"
            prefix="turn"
            options={TURN_OPTIONS}
            selected={value.turnSeconds}
            readOnly={readOnly}
            note={readOnly ? undefined : 'Response clocks (Just Say No, payments) stay the same.'}
            onPick={(turnSeconds) => onChange?.({ ...value, turnSeconds })}
          />
          <OptionGroup
            name="Deck"
            prefix="properties"
            options={PROPERTY_OPTIONS}
            selected={value.propertyTheme}
            readOnly={readOnly}
            onPick={(propertyTheme) =>
              onChange?.({ ...value, propertyTheme, currency: THEME_CURRENCY[propertyTheme] })
            }
          />

          {readOnly && <p className="lb-settings__note">Only the host can change these.</p>}
        </div>
      </div>
    </div>
  );
}

function OptionGroup<T extends string | number | null>({
  name,
  prefix,
  options,
  selected,
  readOnly,
  note,
  onPick,
}: {
  name: string;
  /** Test-id prefix: `setting-<prefix>-<value>`. */
  prefix: string;
  options: readonly Option<T>[];
  selected: T;
  readOnly: boolean;
  /** Small line under the options. */
  note?: string;
  onPick(value: T): void;
}) {
  return (
    <section className="lb-settings__group">
      <span className="lb-eyebrow" aria-hidden>
        {name}
      </span>
      <div className="lb-settings__opts" role="group" aria-label={name} data-n={options.length}>
        {options.map((opt) => {
          const isSelected = opt.value === selected;
          return (
            <button
              key={String(opt.value)}
              type="button"
              className="lb-settings__opt"
              aria-pressed={isSelected}
              disabled={readOnly}
              data-testid={`setting-${prefix}-${opt.value ?? 'none'}`}
              onClick={() => onPick(opt.value)}
            >
              <span>{opt.label}</span>
              {opt.sub && <small>{opt.sub}</small>}
            </button>
          );
        })}
      </div>
      {note && <p className="lb-settings__note">{note}</p>}
    </section>
  );
}

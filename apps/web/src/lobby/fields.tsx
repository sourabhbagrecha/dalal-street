import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { theme } from '../theme';
import { initialsFromName } from '../components/PlayerAvatar';
import { ROOM_CODE_LENGTH, normalizeRoomCode } from './roomCode';

/** The player's name, with the coin they will sit behind. The coin is the colour the table gives the viewer. */
export function NameField({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange(name: string): void;
  onEnter?(): void;
}) {
  return (
    <label className="lb-name">
      <span className="lb-eyebrow">Your name</span>
      <span className="lb-name__row">
        <span
          className="lb-coin"
          aria-hidden
          style={{ '--seat': theme.selfColor, '--seat-ink': theme.selfTextColor } as CSSProperties}
        >
          {initialsFromName(value)}
        </span>
        <input
          type="text"
          className="lb-input"
          maxLength={24}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Enter') onEnter?.();
          }}
          placeholder="What's your name?"
          autoComplete="nickname"
          autoCapitalize="words"
          enterKeyHint="go"
          spellCheck={false}
          data-testid="display-name-input"
        />
      </span>
    </label>
  );
}

/**
 * A room code, one tile per character. The tiles are only a picture: a real (invisible) input lies over them, so the
 * keyboard, paste, autofill and screen readers all behave as they do for any text field. Pasting a whole invite link
 * works — `normalizeRoomCode` takes the code out of it.
 */
export function CodeInput({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange(code: string): void;
  onSubmit?(): void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="lb-code-in" data-focused={focused}>
      <div className="lb-code-in__tiles" aria-hidden>
        {Array.from({ length: ROOM_CODE_LENGTH }, (_, i) => (
          <span key={i} data-fill={i < value.length} data-on={focused && i === value.length}>
            {value[i] ?? ''}
          </span>
        ))}
      </div>
      <input
        type="text"
        className="lb-code-in__input"
        value={value}
        onChange={(e) => onChange(normalizeRoomCode(e.target.value))}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key === 'Enter') onSubmit?.();
        }}
        onFocus={(e) => {
          setFocused(true);
          const end = e.target.value.length;
          e.target.setSelectionRange(end, end);
        }}
        onBlur={() => setFocused(false)}
        aria-label="Room code"
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        data-testid="join-code-input"
      />
    </div>
  );
}

/** A room code as tiles to read, not type into. `inline-block` on purpose: block-level children would make `innerText` put each character on its own line. */
export function CodeTiles({ code, testId }: { code: string; testId: string }) {
  return (
    <b className="lb-code" data-testid={testId} role="img" aria-label={`Room code ${[...code].join(' ')}`}>
      {[...code].map((ch, i) => (
        <span key={i}>{ch}</span>
      ))}
    </b>
  );
}

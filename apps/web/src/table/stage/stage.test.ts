import { describe, expect, it } from 'vitest';
import { Stage } from './stage';

/** A stage with a root and a style sheet but no DOM: enough to watch which cards are held out of sight. */
function bare() {
  const stage = new Stage();
  const sheet = { textContent: '' };
  stage.root = {} as HTMLElement;
  (stage as unknown as { sheet: typeof sheet }).sheet = sheet;
  return { stage, hidden: () => sheet.textContent };
}

describe('Stage claims', () => {
  it('holds a claimed card out of sight until it lands', () => {
    const { stage, hidden } = bare();
    stage.claim(['a']);
    expect(hidden()).toContain('"a"');
    stage.show('a');
    expect(hidden()).not.toContain('"a"');
  });

  it('keeps a card visible that landed before its claim was registered', () => {
    // A parked card settles inside the commit its beat starts, so `show` can run ahead of `claim`.
    const { stage, hidden } = bare();
    stage.show('a');
    stage.claim(['a']);
    expect(hidden()).not.toContain('"a"');
    expect(stage.isClaimed('a')).toBe(false);
  });

  it('forgets a landing once no scene claims the card', () => {
    const { stage, hidden } = bare();
    stage.claim(['a']);
    stage.show('a');
    stage.claim([]);
    stage.claim(['a']);
    expect(hidden()).toContain('"a"');
  });
});

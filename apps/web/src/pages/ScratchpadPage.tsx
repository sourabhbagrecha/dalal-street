/**
 * Dev-only scratchpad for design and UI/UX experiments — not linked from the
 * app. Build throwaway explorations here rather than in real routes, and
 * clear the page back to this empty shell when an experiment is done.
 * html/body are `overflow: hidden` (the game shell), so the page scrolls
 * itself.
 */
export function ScratchpadPage() {
  return (
    <main style={{ height: '100dvh', overflowY: 'auto', padding: 16 }}>
      <h1>Scratchpad</h1>
      <p>Empty. Put design and UI/UX experiments here.</p>
    </main>
  );
}

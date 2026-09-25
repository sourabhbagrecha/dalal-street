import { useSearchParams } from 'react-router-dom';
import { useMockGame } from './scratchpad/mockGame';
import { Table } from './scratchpad/concepts/Table';
import '../styles/gl-kit.css';
import '../styles/gl-shell.css';

/**
 * Layout lab (mobile only): a ground-up take on the table running on a shared
 * mock game (scratchpad/mockGame.ts).
 */
export function ScratchpadPage() {
  const [params] = useSearchParams();
  // ?beat=1 makes the first thing that happens to you a Sly Deal you can Just Say No (2 = rent).
  const beat = Number(params.get('beat') ?? 0) || 0;
  const g = useMockGame(beat);

  return (
    <div className="gl">
      <div className="gl__stage">
        <div className="gl__phone" data-concept="table">
          <Table g={g} />
        </div>
      </div>
    </div>
  );
}

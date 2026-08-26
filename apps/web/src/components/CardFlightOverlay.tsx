import type { CSSProperties } from 'react';
import type { FlightCard } from '../hooks/useCardDrawFlights';
import { useMomentState } from '../moments/store';
import { PlayingCard } from './card/PlayingCard';

export function CardFlightOverlay({ flights }: { flights: FlightCard[] }) {
  const { flights: momentFlights } = useMomentState();
  if (flights.length === 0 && momentFlights.length === 0) return null;

  return (
    <div className="card-flight-layer" aria-hidden>
      {flights.map((f) => (
        <span
          key={f.id}
          className="card-flight"
          style={
            {
              '--from-x': `${f.fromX}px`,
              '--from-y': `${f.fromY}px`,
              '--to-x': `${f.toX}px`,
              '--to-y': `${f.toY}px`,
              animationDelay: `${f.delayMs}ms`,
            } as CSSProperties
          }
        />
      ))}
      {momentFlights.map((f) => {
        const vars = {
          '--from-x': `${f.fromX}px`,
          '--from-y': `${f.fromY}px`,
          '--to-x': `${f.toX}px`,
          '--to-y': `${f.toY}px`,
          animationDelay: `${f.delayMs}ms`,
        };
        if (!f.card) {
          // The generic back look draw flights already use — no card face to fly.
          return (
            <span
              key={f.id}
              className="card-flight"
              style={{ ...vars, animationDuration: `${f.durationMs}ms` } as CSSProperties}
            />
          );
        }
        return (
          <PlayingCard
            key={f.id}
            card={f.card}
            className="card-flight card-flight--face"
            style={
              {
                ...vars,
                '--card-w': `${f.width}px`,
                '--dur': `${f.durationMs}ms`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

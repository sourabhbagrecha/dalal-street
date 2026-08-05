import type { CSSProperties } from 'react';
import type { FlightCard } from '../hooks/useCardDrawFlights';

export function CardFlightOverlay({ flights }: { flights: FlightCard[] }) {
  if (flights.length === 0) return null;

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
    </div>
  );
}

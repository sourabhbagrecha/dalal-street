import type { Response } from 'express';
import type { SseEvent } from '@monopoly-deal/shared';

export interface SseClient {
  res: Response;
  playerToken: string;
  playerId: string;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

export function initSseResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

export function writeSseEvent(res: Response, event: SseEvent): void {
  res.write(`id: ${event.id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function writeSseComment(res: Response, comment: string): void {
  res.write(`: ${comment}\n\n`);
}

export function startHeartbeat(
  client: SseClient,
  intervalMs: number,
  onFailedWrite: () => void,
): void {
  stopHeartbeat(client);
  client.heartbeatTimer = setInterval(() => {
    try {
      writeSseComment(client.res, 'ping');
    } catch {
      onFailedWrite();
    }
  }, intervalMs);
}

export function stopHeartbeat(client: SseClient): void {
  if (client.heartbeatTimer) {
    clearInterval(client.heartbeatTimer);
    client.heartbeatTimer = undefined;
  }
}

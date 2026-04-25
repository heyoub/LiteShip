/**
 * Pure resumption utilities -- Effect-free.
 *
 * Extracted from resumption.ts for use by client directives.
 *
 * @module
 */

/**
 * Parse an event ID to extract sequence number and other components.
 *
 * Supports: numeric ("123"), prefixed ("evt-123"),
 * HLC-style ("1234567890-5-node1"), HLC simple ("1234567890-5").
 */
export const parseEventId = (
  eventId: string,
): { raw: string; sequence: number; timestamp?: number; nodeId?: string } => {
  const numericMatch = eventId.match(/^(\d+)$/);
  if (numericMatch) {
    return { raw: eventId, sequence: parseInt(numericMatch[1]!, 10) };
  }

  const prefixedMatch = eventId.match(/^[a-zA-Z]+-(\d+)$/);
  if (prefixedMatch) {
    return { raw: eventId, sequence: parseInt(prefixedMatch[1]!, 10) };
  }

  const hlcMatch = eventId.match(/^(\d+)-(\d+)-(.+)$/);
  if (hlcMatch) {
    return {
      raw: eventId,
      sequence: parseInt(hlcMatch[2]!, 10),
      timestamp: parseInt(hlcMatch[1]!, 10),
      nodeId: hlcMatch[3]!,
    };
  }

  const hlcSimpleMatch = eventId.match(/^(\d+)-(\d+)$/);
  if (hlcSimpleMatch) {
    return {
      raw: eventId,
      sequence: parseInt(hlcSimpleMatch[2]!, 10),
      timestamp: parseInt(hlcSimpleMatch[1]!, 10),
    };
  }

  const anyNumberMatch = eventId.match(/(\d+)$/);
  if (anyNumberMatch) {
    return { raw: eventId, sequence: parseInt(anyNumberMatch[1]!, 10) };
  }

  return { raw: eventId, sequence: 0 };
};

/**
 * Check if resumption is possible by comparing event IDs.
 */
export const canResume = (lastEventId: string, serverOldestId: string): boolean => {
  if (!serverOldestId) return true;
  if (!lastEventId) return false;

  const lastParsed = parseEventId(lastEventId);
  const serverParsed = parseEventId(serverOldestId);

  if (lastParsed.timestamp !== undefined && serverParsed.timestamp !== undefined) {
    if (lastParsed.timestamp !== serverParsed.timestamp) {
      return lastParsed.timestamp >= serverParsed.timestamp;
    }
    return lastParsed.sequence >= serverParsed.sequence;
  }

  if (lastParsed.sequence !== 0 || serverParsed.sequence !== 0) {
    return lastParsed.sequence >= serverParsed.sequence;
  }

  const lastNum = Number(lastEventId);
  const serverNum = Number(serverOldestId);
  if (!isNaN(lastNum) && !isNaN(serverNum)) {
    return lastNum >= serverNum;
  }

  return lastEventId >= serverOldestId;
};

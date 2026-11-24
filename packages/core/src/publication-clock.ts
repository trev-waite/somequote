export const PUBLICATION_TIME_ZONE = 'America/New_York';

export type PublicationDate = string & { readonly __brand: 'PublicationDate' };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_SECOND = 1000;

const wallClockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: PUBLICATION_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export function isPublicationDate(value: string): value is PublicationDate {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = new Date(Date.UTC(year, month - 1, day));
  return (
    utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
  );
}

export function parsePublicationDate(value: string): PublicationDate {
  if (!isPublicationDate(value))
    throw new Error(`Invalid publication date: ${JSON.stringify(value)}`);
  return value;
}

export function publicationDateAt(instant: Date): PublicationDate {
  return formatDay(wallClockAt(instant.getTime()));
}

export function publicationStartsAt(date: PublicationDate): Date {
  const { year, month, day } = calendarDay(date);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  const estimate = midnightAsUtc - utcOffsetAt(midnightAsUtc);
  return new Date(midnightAsUtc - utcOffsetAt(estimate));
}

export function nextPublicationAt(instant: Date): Date {
  return publicationStartsAt(addDays(publicationDateAt(instant), 1));
}

export function addDays(date: PublicationDate, days: number): PublicationDate {
  const { year, month, day } = calendarDay(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatDay({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

function calendarDay(date: PublicationDate): CalendarDay {
  const [year, month, day] = date.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Malformed publication date: ${date}`);
  }
  return { year, month, day };
}

function formatDay({ year, month, day }: CalendarDay): PublicationDate {
  return parsePublicationDate(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
}

function wallClockAt(epochMs: number) {
  const parts = new Map(
    wallClockFormat.formatToParts(epochMs).map((part) => [part.type, Number(part.value)]),
  );
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.get(type);
    if (value === undefined || Number.isNaN(value))
      throw new Error(`Missing ${type} in wall clock`);
    return value;
  };
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function utcOffsetAt(epochMs: number): number {
  const wall = wallClockAt(epochMs);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  return wallAsUtc - Math.floor(epochMs / MS_PER_SECOND) * MS_PER_SECOND;
}

type DayjsInput = string | number | Date | MermaidDayjs | undefined | null;
type DayjsUnit =
  | 'millisecond'
  | 'milliseconds'
  | 'ms'
  | 'second'
  | 'seconds'
  | 's'
  | 'minute'
  | 'minutes'
  | 'm'
  | 'hour'
  | 'hours'
  | 'h'
  | 'day'
  | 'days'
  | 'd'
  | 'week'
  | 'weeks'
  | 'w'
  | 'month'
  | 'months'
  | 'M'
  | 'year'
  | 'years'
  | 'y';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const UNIT_MS: Record<string, number> = {
  millisecond: 1,
  milliseconds: 1,
  ms: 1,
  second: 1000,
  seconds: 1000,
  s: 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  m: 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  h: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
};

function padNumber(value: number, size: number) {
  return String(value).padStart(size, '0');
}

function normalizeUnit(unit?: string): DayjsUnit {
  if (!unit) {
    return 'millisecond';
  }

  const normalized = unit.toLowerCase();
  if (normalized === 'date') {
    return 'day';
  }

  return normalized as DayjsUnit;
}

function parseByFormat(input: string, format: string, strict: boolean) {
  const trimmed = input.trim();
  const normalizedFormat = format.trim();

  if (normalizedFormat === 'YYYY-MM-DD') {
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return strict ? new Date(Number.NaN) : new Date(trimmed);
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const date = Number(match[3]);
    return new Date(year, month, date);
  }

  return new Date(trimmed);
}

function parseInput(input?: DayjsInput, format?: string, strict = false) {
  if (input instanceof MermaidDayjs) {
    return input.toDate();
  }

  if (input instanceof Date) {
    return new Date(input.getTime());
  }

  if (typeof input === 'number') {
    return new Date(input);
  }

  if (typeof input === 'string') {
    if (format) {
      return parseByFormat(input, format, strict);
    }

    return new Date(input);
  }

  if (input === null) {
    return new Date(Number.NaN);
  }

  return new Date();
}

class MermaidDayjs {
  private readonly internalDate: Date;

  constructor(input?: DayjsInput, format?: string, strict = false) {
    this.internalDate = parseInput(input, format, strict);
  }

  clone() {
    return new MermaidDayjs(this.internalDate);
  }

  isValid() {
    return !Number.isNaN(this.internalDate.getTime());
  }

  toDate() {
    return new Date(this.internalDate.getTime());
  }

  valueOf() {
    return this.internalDate.getTime();
  }

  format(pattern = 'YYYY-MM-DDTHH:mm:ss') {
    if (!this.isValid()) {
      return 'Invalid Date';
    }

    const year = this.internalDate.getFullYear();
    const month = this.internalDate.getMonth() + 1;
    const date = this.internalDate.getDate();
    const hours = this.internalDate.getHours();
    const minutes = this.internalDate.getMinutes();
    const seconds = this.internalDate.getSeconds();
    const milliseconds = this.internalDate.getMilliseconds();
    const weekday = this.internalDate.getDay();

    const replacements: Record<string, string> = {
      YYYY: padNumber(year, 4),
      YY: padNumber(year % 100, 2),
      MM: padNumber(month, 2),
      M: String(month),
      DD: padNumber(date, 2),
      D: String(date),
      HH: padNumber(hours, 2),
      H: String(hours),
      mm: padNumber(minutes, 2),
      m: String(minutes),
      ss: padNumber(seconds, 2),
      s: String(seconds),
      SSS: padNumber(milliseconds, 3),
      dddd: WEEKDAY_NAMES[weekday] ?? '',
    };

    return pattern.replace(
      /YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|SSS|dddd/g,
      (token) => replacements[token] ?? token
    );
  }

  add(value: number, unit?: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || !this.isValid()) {
      return this.clone();
    }

    const normalized = normalizeUnit(unit);
    const nextDate = this.toDate();

    switch (normalized) {
      case 'month':
      case 'months':
      case 'M':
        nextDate.setMonth(nextDate.getMonth() + amount);
        break;
      case 'year':
      case 'years':
      case 'y':
        nextDate.setFullYear(nextDate.getFullYear() + amount);
        break;
      default: {
        const factor = UNIT_MS[normalized] ?? 1;
        nextDate.setTime(nextDate.getTime() + amount * factor);
        break;
      }
    }

    return new MermaidDayjs(nextDate);
  }

  subtract(value: number, unit?: string) {
    return this.add(-value, unit);
  }

  startOf(unit?: string) {
    if (!this.isValid()) {
      return this.clone();
    }

    const normalized = normalizeUnit(unit);
    const nextDate = this.toDate();

    if (normalized === 'year' || normalized === 'years' || normalized === 'y') {
      nextDate.setMonth(0, 1);
      nextDate.setHours(0, 0, 0, 0);
      return new MermaidDayjs(nextDate);
    }

    if (normalized === 'month' || normalized === 'months' || normalized === 'M') {
      nextDate.setDate(1);
      nextDate.setHours(0, 0, 0, 0);
      return new MermaidDayjs(nextDate);
    }

    if (normalized === 'week' || normalized === 'weeks' || normalized === 'w') {
      const day = nextDate.getDay();
      nextDate.setDate(nextDate.getDate() - day);
      nextDate.setHours(0, 0, 0, 0);
      return new MermaidDayjs(nextDate);
    }

    if (normalized === 'day' || normalized === 'days' || normalized === 'd') {
      nextDate.setHours(0, 0, 0, 0);
      return new MermaidDayjs(nextDate);
    }

    if (normalized === 'hour' || normalized === 'hours' || normalized === 'h') {
      nextDate.setMinutes(0, 0, 0);
      return new MermaidDayjs(nextDate);
    }

    if (normalized === 'minute' || normalized === 'minutes' || normalized === 'm') {
      nextDate.setSeconds(0, 0);
      return new MermaidDayjs(nextDate);
    }

    if (normalized === 'second' || normalized === 'seconds' || normalized === 's') {
      nextDate.setMilliseconds(0);
      return new MermaidDayjs(nextDate);
    }

    return new MermaidDayjs(nextDate);
  }

  endOf(unit?: string) {
    const start = this.startOf(unit);
    const normalized = normalizeUnit(unit);

    if (normalized === 'year' || normalized === 'years' || normalized === 'y') {
      return start.add(1, 'year').subtract(1, 'millisecond');
    }
    if (normalized === 'month' || normalized === 'months' || normalized === 'M') {
      return start.add(1, 'month').subtract(1, 'millisecond');
    }
    if (normalized === 'week' || normalized === 'weeks' || normalized === 'w') {
      return start.add(1, 'week').subtract(1, 'millisecond');
    }
    if (normalized === 'day' || normalized === 'days' || normalized === 'd') {
      return start.add(1, 'day').subtract(1, 'millisecond');
    }
    if (normalized === 'hour' || normalized === 'hours' || normalized === 'h') {
      return start.add(1, 'hour').subtract(1, 'millisecond');
    }
    if (normalized === 'minute' || normalized === 'minutes' || normalized === 'm') {
      return start.add(1, 'minute').subtract(1, 'millisecond');
    }
    if (normalized === 'second' || normalized === 'seconds' || normalized === 's') {
      return start.add(1, 'second').subtract(1, 'millisecond');
    }

    return start;
  }

  diff(input: DayjsInput, unit?: string, floatResult = false) {
    const other = new MermaidDayjs(input);
    const diffMs = this.valueOf() - other.valueOf();
    const normalized = normalizeUnit(unit);

    let result: number;
    if (normalized === 'year' || normalized === 'years' || normalized === 'y') {
      result = diffMs / (365 * UNIT_MS.day);
    } else if (normalized === 'month' || normalized === 'months' || normalized === 'M') {
      result = diffMs / (30 * UNIT_MS.day);
    } else {
      const factor = UNIT_MS[normalized] ?? 1;
      result = diffMs / factor;
    }

    return floatResult ? result : result < 0 ? Math.ceil(result) : Math.floor(result);
  }
}

class MermaidDuration {
  private readonly milliseconds: number;

  constructor(input?: Record<string, number> | number, unit?: string) {
    if (typeof input === 'number') {
      const factor = UNIT_MS[normalizeUnit(unit)] ?? 1;
      this.milliseconds = input * factor;
      return;
    }

    if (!input || typeof input !== 'object') {
      this.milliseconds = 0;
      return;
    }

    this.milliseconds = Object.entries(input).reduce((sum, [key, value]) => {
      const factor = UNIT_MS[normalizeUnit(key)] ?? 0;
      return sum + Number(value || 0) * factor;
    }, 0);
  }

  asMilliseconds() {
    return this.milliseconds;
  }
}

type MermaidDayjsFactory = {
  (input?: DayjsInput, format?: string, strict?: boolean): MermaidDayjs;
  extend: (plugin: unknown) => MermaidDayjsFactory;
  duration: (input?: Record<string, number> | number, unit?: string) => MermaidDuration;
  unix: (seconds: number) => MermaidDayjs;
  isDayjs: (value: unknown) => boolean;
};

const mermaidDayjs = ((input?: DayjsInput, format?: string, strict?: boolean) =>
  new MermaidDayjs(input, format, strict)) as MermaidDayjsFactory;

mermaidDayjs.extend = () => mermaidDayjs;
mermaidDayjs.duration = (input?: Record<string, number> | number, unit?: string) =>
  new MermaidDuration(input, unit);
mermaidDayjs.unix = (seconds: number) => new MermaidDayjs(seconds * 1000);
mermaidDayjs.isDayjs = (value: unknown) => value instanceof MermaidDayjs;

export default mermaidDayjs;

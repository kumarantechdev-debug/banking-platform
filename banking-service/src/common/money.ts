const MONEY_PATTERN = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const MAX_MINOR_UNITS = 999_999_999_999_999n;

export function isValidMoney(value: unknown): value is string {
  return typeof value === 'string' && MONEY_PATTERN.test(value);
}

export function toMinorUnits(value: string): bigint {
  if (!isValidMoney(value)) {
    throw new Error('Invalid monetary value');
  }

  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function fromMinorUnits(value: bigint): string {
  if (value < 0n || value > MAX_MINOR_UNITS) {
    throw new RangeError('Monetary value exceeds DECIMAL(15,2)');
  }

  const whole = value / 100n;
  const fraction = (value % 100n).toString().padStart(2, '0');
  return `${whole}.${fraction}`;
}

export function normalizeMoney(value: string): string {
  return fromMinorUnits(toMinorUnits(value));
}

export function isWithinDecimalRange(value: bigint): boolean {
  return value >= 0n && value <= MAX_MINOR_UNITS;
}

import {
  fromMinorUnits,
  isValidMoney,
  normalizeMoney,
  toMinorUnits,
} from './money';

describe('money helpers', () => {
  it('uses exact minor-unit arithmetic and formats two decimal places', () => {
    expect(toMinorUnits('9999999999999.99')).toBe(999_999_999_999_999n);
    expect(fromMinorUnits(toMinorUnits('0.10') + toMinorUnits('0.20'))).toBe(
      '0.30',
    );
    expect(normalizeMoney('12')).toBe('12.00');
  });

  it('rejects values outside DECIMAL(15,2) precision', () => {
    expect(isValidMoney('10000000000000.00')).toBe(false);
    expect(isValidMoney('1.234')).toBe(false);
    expect(isValidMoney('-1.00')).toBe(false);
    expect(isValidMoney('1e2')).toBe(false);
  });
});

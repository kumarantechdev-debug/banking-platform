import { createCustomerRecord } from './customer-data';

describe('createCustomerRecord', () => {
  it('generates distinct IDs and both customer statuses', () => {
    const first = createCustomerRecord(0);
    const second = createCustomerRecord(1);

    expect(first.id).not.toBe(second.id);
    expect(first.status).not.toBe(second.status);
    expect(first.name).toContain(' ');
    expect(first.city).toBeTruthy();
    expect(first.state).toBeTruthy();
    expect(first.mobile).toMatch(/^\d{10}$/);
  });

  it('rejects invalid customer offsets', () => {
    expect(() => createCustomerRecord(-1)).toThrow(RangeError);
  });
});

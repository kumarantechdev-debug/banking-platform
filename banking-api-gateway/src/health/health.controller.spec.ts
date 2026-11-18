import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('returns the gateway health status', () => {
    expect(new HealthController().getHealth()).toEqual({
      status: 'success',
      service: 'banking-api-gateway',
    });
  });
});

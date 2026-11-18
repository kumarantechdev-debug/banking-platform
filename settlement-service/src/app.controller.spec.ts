jest.mock('@nestjs/common', () => ({
  Controller: () => (target: unknown) => target,
  Get: () => (target: unknown, key: string) => target,
  Injectable: () => (target: unknown) => target,
}));

import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(() => {
    appController = new AppController(new AppService());
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});

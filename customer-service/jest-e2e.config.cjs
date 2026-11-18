const config = require('./jest.config.cjs');

module.exports = {
  ...config,
  testRegex: '.*\\.e2e-spec\\.ts$',
};

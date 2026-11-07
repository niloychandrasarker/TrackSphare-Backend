const app = require('../dist/server.js').default;

module.exports = (req, res) => {
  return app(req, res);
};

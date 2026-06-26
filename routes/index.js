
const healthRouter = require('./health');
const authRouter = require('./auth');
const accountRouter = require('./account');
const orderRouter = require('./orders');
const deposits = require('./deposits');
const adminRouter = require('./admin');
const productRouter = require('./products');
const tracking = require('./tracking');
const pageRouter = require('./pages');

function registerRoutes(app) {
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', accountRouter);
  app.use('/api', orderRouter);
  app.use('/api/deposits', deposits.router);
  app.use('/api/admin', adminRouter);
  app.use('/api/products', productRouter);
  app.use('/api', tracking.router);
  app.use('/', deposits.cassoRouter);
  app.use('/', pageRouter);
}

module.exports = registerRoutes;

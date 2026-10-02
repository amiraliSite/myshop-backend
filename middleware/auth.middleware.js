const requireAdmin = (req, res, next) => {
  console.log('✅ requireAdmin called - bypassing auth');
  req.user = { id: 'test-admin', role: 'admin' };
  next();
};

const requireRepresentative = (req, res, next) => {
  console.log('✅ requireRepresentative called - bypassing auth');
  req.user = { id: 'test-rep', role: 'representative' };
  next();
};

module.exports = {
  requireAdmin,
  requireRepresentative,
};
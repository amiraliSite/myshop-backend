const jwt = require('jsonwebtoken');

const JWT_SECRET =
  process.env.JWT_SECRET ||
  'company-panel-secret-change-this-in-production';

function getTokenFromRequest(req) {
  const authorization =
    req.headers.authorization || '';

  if (
    authorization.startsWith('Bearer ')
  ) {
    return authorization
      .slice(7)
      .trim();
  }

  return (
    req.cookies?.authToken ||
    req.cookies?.token ||
    ''
  );
}

function verifyToken(req, res) {
  const token =
    getTokenFromRequest(req);

  if (!token) {
    res.status(401).json({
      success: false,
      error:
        'ابتدا وارد حساب کاربری شوید.',
    });

    return null;
  }

  try {
    return jwt.verify(
      token,
      JWT_SECRET,
    );
  } catch (error) {
    console.error(
      'خطا در بررسی توکن:',
      error.message,
    );

    res.status(401).json({
      success: false,
      error:
        'توکن نامعتبر یا منقضی شده است.',
    });

    return null;
  }
}

const requireAdmin = (
  req,
  res,
  next,
) => {
  const user = verifyToken(
    req,
    res,
  );

  if (!user) {
    return;
  }

  if (user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error:
        'فقط ادمین اجازه انجام این کار را دارد.',
    });
  }

  req.user = user;

  console.log(
    '✅ admin authenticated:',
    user.id,
  );

  return next();
};

const requireRepresentative = (
  req,
  res,
  next,
) => {
  const user = verifyToken(
    req,
    res,
  );

  if (!user) {
    return;
  }

  if (
    user.role !==
    'representative'
  ) {
    return res.status(403).json({
      success: false,
      error:
        'فقط نماینده اجازه انجام این کار را دارد.',
    });
  }

  req.user = user;

  console.log(
    '✅ representative authenticated:',
    user.id,
  );

  return next();
};

module.exports = {
  requireAdmin,
  requireRepresentative,
};
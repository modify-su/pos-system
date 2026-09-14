const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'pos_secret_key_2024';

function authenticate(req, res, next) {
  let token = null;

  // 1. Check HttpOnly session cookie
  if (req.cookies && req.cookies.pos_session) {
    token = req.cookies.pos_session;
  }

  // 2. Fallback to Bearer token in Authorization header
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized - กรุณาเข้าสู่ระบบ' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    // If cookie is expired, clear it
    if (req.cookies && req.cookies.pos_session) {
      res.clearCookie('pos_session', { path: '/' });
    }
    return res.status(401).json({ message: 'Invalid or expired session token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์เข้าถึงส่วนนี้' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };

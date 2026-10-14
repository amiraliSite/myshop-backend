const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');


const {
  readAdmins,
  writeAdmins,
  readRepresentatives,
} = require('../helpers/jsonStorage');


const {
  normalizeValue,
  createRandomId,
} = require('../helpers/values');


const router = express.Router();


const JWT_SECRET =
  process.env.JWT_SECRET ||
  'company-panel-secret-change-this-in-production';


const COOKIE_NAME = 'authToken';


const COOKIE_MAX_AGE =
  7 * 24 * 60 * 60 * 1000;


function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();


  return text || fallback;
}


function sameValue(firstValue, secondValue) {
  const first = normalizeValue(firstValue);
  const second = normalizeValue(secondValue);


  return Boolean(
    first &&
      second &&
      first === second,
  );
}


function createToken(user) {
  return jwt.sign(
    {
      id: String(user.id),
      username: user.username || '',
      representativeId:
        user.representativeId ||
        (user.role === 'representative'
          ? String(user.id)
          : ''),
      role: user.role,
    },
    JWT_SECRET,
    {
      expiresIn: '7d',
    },
  );
}


function setAuthCookie(res, token) {
  return res.cookie(
    COOKIE_NAME,
    token,
    {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE,
    },
  );
}


function clearAuthCookie(res) {
  return res.clearCookie(
    COOKIE_NAME,
    {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    },
  );
}


router.get('/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Auth API is running.',
  });
});


router.post(
  '/login',
  async (req, res) => {
    try {
      const username = normalizeValue(
        req.body?.username ||
          req.body?.name,
      );


      const password = String(
        req.body?.password || '',
      );


      const code = normalizeValue(
        req.body?.code,
      );


      if (!username) {
        return res.status(400).json({
          success: false,
          error:
            'نام کاربری یا نام نمایندگی الزامی است.',
        });
      }


      const admins = readAdmins();


      const admin = admins.find(
        (item) =>
          normalizeValue(
            item.username,
          ) === username,
      );


      if (
        admin &&
        password &&
        admin.passwordHash
      ) {
        const passwordIsCorrect =
          await bcrypt.compare(
            password,
            admin.passwordHash,
          );


        if (passwordIsCorrect) {
          const token = createToken({
            id: admin.id,
            username: admin.username,
            role: 'admin',
          });


          setAuthCookie(res, token);


          return res.status(200).json({
            success: true,
            message:
              'ورود ادمین با موفقیت انجام شد.',
            token,
            user: {
              id: admin.id,
              username: admin.username,
              name:
                admin.name ||
                'مدیر سیستم',
              role: 'admin',
            },
          });
        }
      }


      const representatives =
        readRepresentatives();


      const representative =
        representatives.find(
          (item) =>
            cleanText(item.name) ===
              username &&
            sameValue(item.code, code),
        );


      if (representative) {
        if (
          representative.status ===
          'inactive'
        ) {
          return res.status(403).json({
            success: false,
            error:
              'حساب این نماینده غیرفعال است.',
          });
        }


        const token = createToken({
          id: representative.id,
          representativeId:
            representative.id,
          role: 'representative',
        });


        setAuthCookie(res, token);


        return res.status(200).json({
          success: true,
          message:
            'ورود نماینده با موفقیت انجام شد.',
          token,
          user: {
            id: representative.id,
            representativeId:
              representative.id,
            name:
              representative.name || '',
            code:
              representative.code || '',
            city:
              representative.city || '',
            phone:
              representative.phone || '',
            role: 'representative',
          },
        });
      }


      return res.status(401).json({
        success: false,
        error:
          'نام کاربری، رمز عبور یا کد نمایندگی اشتباه است.',
      });
    } catch (error) {
      console.error(
        'خطا در ورود:',
        error,
      );


      return res.status(500).json({
        success: false,
        error: 'خطا در ورود.',
      });
    }
  },
);


router.post(
  '/admin/login',
  async (req, res) => {
    try {
      const username = normalizeValue(
        req.body?.username,
      );


      const password = String(
        req.body?.password || '',
      );


      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error:
            'نام کاربری و رمز عبور الزامی هستند.',
        });
      }


      const admins = readAdmins();


      const admin = admins.find(
        (item) =>
          normalizeValue(
            item.username,
          ) === username,
      );


      if (!admin) {
        return res.status(401).json({
          success: false,
          error:
            'نام کاربری یا رمز عبور اشتباه است.',
        });
      }


      if (!admin.passwordHash) {
        return res.status(500).json({
          success: false,
          error:
            'رمز عبور این حساب در سیستم ثبت نشده است.',
        });
      }


      const passwordIsCorrect =
        await bcrypt.compare(
          password,
          admin.passwordHash,
        );


      if (!passwordIsCorrect) {
        return res.status(401).json({
          success: false,
          error:
            'نام کاربری یا رمز عبور اشتباه است.',
        });
      }


      const token = createToken({
        id: admin.id,
        username: admin.username,
        role: 'admin',
      });


      setAuthCookie(res, token);


      return res.status(200).json({
        success: true,
        message:
          'ورود ادمین با موفقیت انجام شد.',
        token,
        user: {
          id: admin.id,
          username: admin.username,
          name:
            admin.name || 'مدیر سیستم',
          role: 'admin',
        },
      });
    } catch (error) {
      console.error(
        'خطا در ورود ادمین:',
        error,
      );


      return res.status(500).json({
        success: false,
        error: 'خطا در ورود ادمین.',
      });
    }
  },
);


router.post(
  '/representative/login',
  (req, res) => {
    try {
      const name = cleanText(
        req.body?.name,
      );


      const code = normalizeValue(
        req.body?.code,
      );


      if (!name || !code) {
        return res.status(400).json({
          success: false,
          error:
            'نام و کد نمایندگی الزامی هستند.',
        });
      }


      const representatives =
        readRepresentatives();


      const representative =
        representatives.find(
          (item) =>
            cleanText(item.name) === name &&
            sameValue(item.code, code),
        );


      if (!representative) {
        return res.status(401).json({
          success: false,
          error:
            'نماینده‌ای با این نام و کد نمایندگی پیدا نشد.',
        });
      }


      if (
        representative.status ===
        'inactive'
      ) {
        return res.status(403).json({
          success: false,
          error:
            'حساب این نماینده غیرفعال است.',
        });
      }


      const token = createToken({
        id: representative.id,
        representativeId:
          representative.id,
        role: 'representative',
      });


      setAuthCookie(res, token);


      return res.status(200).json({
        success: true,
        message:
          'ورود نماینده با موفقیت انجام شد.',
        token,
        user: {
          id: representative.id,
          representativeId:
            representative.id,
          name:
            representative.name || '',
          code:
            representative.code || '',
          city:
            representative.city || '',
          phone:
            representative.phone || '',
          role: 'representative',
        },
      });
    } catch (error) {
      console.error(
        'خطا در ورود نماینده:',
        error,
      );


      return res.status(500).json({
        success: false,
        error: 'خطا در ورود نماینده.',
      });
    }
  },
);


router.post('/logout', (req, res) => {
  clearAuthCookie(res);


  return res.status(200).json({
    success: true,
    message: 'با موفقیت خارج شدید.',
  });
});


module.exports = router;
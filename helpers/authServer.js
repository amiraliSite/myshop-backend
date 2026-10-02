// const express = require('express');
// const cors = require('cors');
// const bcrypt = require('bcryptjs');
// const jwt = require('jsonwebtoken');
// const fs = require('fs');
// const path = require('path');

// const app = express();

// const PORT = process.env.AUTH_PORT || 5001;

// const JWT_SECRET =
//   process.env.JWT_SECRET ||
//   'company-panel-secret-change-this-in-production';

// const DATA_DIR = path.join(__dirname, 'data');

// const ADMINS_FILE = path.join(DATA_DIR, 'admins.json');

// const REPRESENTATIVES_FILE = path.join(
//   DATA_DIR,
//   'representatives.json',
// );

// const SHIPMENTS_FILE = path.join(DATA_DIR, 'shipments.json');

// const REPRESENTATIVE_WAREHOUSES_FILE = path.join(
//   DATA_DIR,
//   'representativeWarehouses.json',
// );

// app.use(
//   cors({
//     origin: true,
//     credentials: true,
//   }),
// );

// app.use(express.json());

// app.use(express.urlencoded({ extended: true }));

// const toEnglishDigits = (value) => {
//   if (value === null || value === undefined) {
//     return '';
//   }

//   return String(value)
//     .replace(/[۰-۹]/g, (digit) => {
//       return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
//     })
//     .replace(/[٠-٩]/g, (digit) => {
//       return String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
//     });
// };

// const normalizeValue = (value) => {
//   return toEnglishDigits(value).trim();
// };

// const cleanText = (value, fallback = '') => {
//   const text = String(value ?? '').trim();

//   return text || fallback;
// };

// const sameValue = (firstValue, secondValue) => {
//   const first = normalizeValue(firstValue);
//   const second = normalizeValue(secondValue);

//   return Boolean(first && second && first === second);
// };

// const createRandomId = () => {
//   return `${Date.now()}-${Math.random()
//     .toString(36)
//     .slice(2, 10)}`;
// };

// const ensureDataDirectory = () => {
//   if (!fs.existsSync(DATA_DIR)) {
//     fs.mkdirSync(DATA_DIR, { recursive: true });
//   }
// };

// const ensureJsonFile = (filePath, fallback = []) => {
//   if (!fs.existsSync(filePath)) {
//     fs.writeFileSync(
//       filePath,
//       JSON.stringify(fallback, null, 2),
//       'utf8',
//     );
//   }
// };

// const readJsonFile = (filePath, fallback = []) => {
//   try {
//     ensureJsonFile(filePath, fallback);

//     const content = fs.readFileSync(filePath, 'utf8');

//     if (!content.trim()) {
//       return fallback;
//     }

//     const data = JSON.parse(content);

//     return Array.isArray(data) ? data : fallback;
//   } catch (error) {
//     console.error(`خطا در خواندن فایل ${filePath}:`, error);

//     return fallback;
//   }
// };

// const writeJsonFile = (filePath, data) => {
//   try {
//     fs.writeFileSync(
//       filePath,
//       JSON.stringify(data || [], null, 2),
//       'utf8',
//     );

//     return true;
//   } catch (error) {
//     console.error(`خطا در ذخیره فایل ${filePath}:`, error);

//     return false;
//   }
// };

// const readAdmins = () => {
//   return readJsonFile(ADMINS_FILE, []);
// };

// const writeAdmins = (admins) => {
//   return writeJsonFile(ADMINS_FILE, admins);
// };

// const readRepresentatives = () => {
//   return readJsonFile(REPRESENTATIVES_FILE, []);
// };

// const readShipments = () => {
//   return readJsonFile(SHIPMENTS_FILE, []);
// };

// const readRepresentativeWarehouses = () => {
//   return readJsonFile(REPRESENTATIVE_WAREHOUSES_FILE, []);
// };

// const createToken = (payload) => {
//   return jwt.sign(payload, JWT_SECRET, {
//     expiresIn: '7d',
//   });
// };

// async function createDefaultAdmin() {
//   try {
//     const admins = readAdmins();

//     const hasAdmin = admins.some((admin) => {
//       return normalizeValue(admin.username) === 'admin';
//     });

//     if (hasAdmin) {
//       return;
//     }

//     const passwordHash = await bcrypt.hash('admin123', 10);

//     const defaultAdmin = {
//       id: createRandomId(),
//       username: 'admin',
//       name: 'مدیر سیستم',
//       passwordHash,
//       role: 'admin',
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString(),
//     };

//     admins.push(defaultAdmin);

//     const saved = writeAdmins(admins);

//     if (saved) {
//       console.log(
//         '✅ ادمین پیش‌فرض ساخته شد | username: admin | password: admin123',
//       );
//     }
//   } catch (error) {
//     console.error('خطا در ساخت ادمین پیش‌فرض:', error);
//   }
// }

// const authenticateToken = (req, res, next) => {
//   const authorizationHeader = String(
//     req.headers.authorization || '',
//   );

//   const token = authorizationHeader.startsWith('Bearer ')
//     ? authorizationHeader.slice(7)
//     : '';

//   if (!token) {
//     return res.status(401).json({
//       success: false,
//       error: 'توکن ورود ارسال نشده است.',
//     });
//   }

//   try {
//     req.user = jwt.verify(token, JWT_SECRET);

//     return next();
//   } catch (error) {
//     return res.status(401).json({
//       success: false,
//       error: 'توکن ورود نامعتبر یا منقضی شده است.',
//     });
//   }
// };

// const requireAdmin = (req, res, next) => {
//   if (req.user?.role !== 'admin') {
//     return res.status(403).json({
//       success: false,
//       error: 'این بخش فقط برای ادمین قابل دسترسی است.',
//     });
//   }

//   return next();
// };

// const requireRepresentative = (req, res, next) => {
//   if (req.user?.role !== 'representative') {
//     return res.status(403).json({
//       success: false,
//       error: 'این بخش فقط برای نماینده قابل دسترسی است.',
//     });
//   }

//   return next();
// };

// app.get('/api/auth/health', (req, res) => {
//   return res.json({
//     success: true,
//     message: 'Auth server is running.',
//   });
// });

// app.post('/api/auth/admin/login', async (req, res) => {
//   try {
//     const username = normalizeValue(req.body.username);
//     const password = String(req.body.password || '');

//     if (!username || !password) {
//       return res.status(400).json({
//         success: false,
//         error: 'نام کاربری و رمز عبور الزامی هستند.',
//       });
//     }

//     const admins = readAdmins();

//     const admin = admins.find((item) => {
//       return normalizeValue(item.username) === username;
//     });

//     if (!admin) {
//       return res.status(401).json({
//         success: false,
//         error: 'نام کاربری یا رمز عبور اشتباه است.',
//       });
//     }

//     const passwordIsCorrect = await bcrypt.compare(
//       password,
//       admin.passwordHash,
//     );

//     if (!passwordIsCorrect) {
//       return res.status(401).json({
//         success: false,
//         error: 'نام کاربری یا رمز عبور اشتباه است.',
//       });
//     }

//     const token = createToken({
//       id: String(admin.id),
//       username: admin.username,
//       role: 'admin',
//     });

//     return res.json({
//       success: true,
//       message: 'ورود ادمین با موفقیت انجام شد.',
//       token,
//       user: {
//         id: admin.id,
//         username: admin.username,
//         name: admin.name || 'مدیر سیستم',
//         role: 'admin',
//       },
//     });
//   } catch (error) {
//     console.error('خطا در ورود ادمین:', error);

//     return res.status(500).json({
//       success: false,
//       error: 'خطا در ورود ادمین.',
//     });
//   }
// });

// app.post('/api/auth/representative/login', (req, res) => {
//   try {
//     const name = cleanText(req.body.name);
//     const code = normalizeValue(req.body.code);

//     if (!name || !code) {
//       return res.status(400).json({
//         success: false,
//         error: 'نام و کد نمایندگی الزامی هستند.',
//       });
//     }

//     const representatives = readRepresentatives();

//     const representative = representatives.find((item) => {
//       return (
//         cleanText(item.name) === name &&
//         sameValue(item.code, code)
//       );
//     });

//     if (!representative) {
//       return res.status(401).json({
//         success: false,
//         error:
//           'نماینده‌ای با این نام و کد نمایندگی پیدا نشد.',
//       });
//     }

//     if (representative.status === 'inactive') {
//       return res.status(403).json({
//         success: false,
//         error: 'حساب این نماینده غیرفعال است.',
//       });
//     }

//     const token = createToken({
//       id: String(representative.id),
//       representativeId: String(representative.id),
//       role: 'representative',
//     });

//     return res.json({
//       success: true,
//       message: 'ورود نماینده با موفقیت انجام شد.',
//       token,
//       user: {
//         id: representative.id,
//         representativeId: representative.id,
//         name: representative.name || '',
//         code: representative.code || '',
//         city: representative.city || '',
//         phone: representative.phone || '',
//         role: 'representative',
//       },
//     });
//   } catch (error) {
//     console.error('خطا در ورود نماینده:', error);

//     return res.status(500).json({
//       success: false,
//       error: 'خطا در ورود نماینده.',
//     });
//   }
// });

// app.get('/api/auth/me', authenticateToken, (req, res) => {
//   try {
//     if (req.user.role === 'admin') {
//       const admins = readAdmins();

//       const admin = admins.find((item) => {
//         return sameValue(item.id, req.user.id);
//       });

//       return res.json({
//         success: true,
//         user: {
//           id: admin?.id || req.user.id,
//           username: admin?.username || req.user.username || '',
//           name: admin?.name || 'مدیر سیستم',
//           role: 'admin',
//         },
//       });
//     }

//     const representativeId = String(
//       req.user.representativeId || req.user.id,
//     );

//     const representatives = readRepresentatives();

//     const representative = representatives.find((item) => {
//       return sameValue(item.id, representativeId);
//     });

//     if (!representative) {
//       return res.status(404).json({
//         success: false,
//         error: 'نماینده پیدا نشد.',
//       });
//     }

//     return res.json({
//       success: true,
//       user: {
//         id: representative.id,
//         representativeId: representative.id,
//         name: representative.name || '',
//         code: representative.code || '',
//         city: representative.city || '',
//         phone: representative.phone || '',
//         role: 'representative',
//       },
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       error: 'خطا در دریافت اطلاعات حساب.',
//     });
//   }
// });

// app.get(
//   '/api/auth/admin/dashboard',
//   authenticateToken,
//   requireAdmin,
//   (req, res) => {
//     const representatives = readRepresentatives();
//     const shipments = readShipments();

//     return res.json({
//       success: true,
//       data: {
//         totalRepresentatives: representatives.length,
//         totalShipments: shipments.length,
//       },
//     });
//   },
// );

// app.get(
//   '/api/auth/representative/dashboard',
//   authenticateToken,
//   requireRepresentative,
//   (req, res) => {
//     try {
//       const representativeId = String(
//         req.user.representativeId || req.user.id,
//       );

//       const representatives = readRepresentatives();

//       const representative = representatives.find((item) => {
//         return sameValue(item.id, representativeId);
//       });

//       if (!representative) {
//         return res.status(404).json({
//           success: false,
//           error: 'نماینده پیدا نشد.',
//         });
//       }

//       const shipments = readShipments()
//         .filter((shipment) => {
//           return sameValue(
//             shipment.representativeId,
//             representativeId,
//           );
//         })
//         .sort((first, second) => {
//           return (
//             new Date(second.createdAt).getTime() -
//             new Date(first.createdAt).getTime()
//           );
//         });

//       const representativeWarehouses =
//         readRepresentativeWarehouses();

//       const warehouse = representativeWarehouses.find((item) => {
//         return sameValue(
//           item.representativeId,
//           representativeId,
//         );
//       }) || {
//         representativeId,
//         items: [],
//         movements: [],
//       };

//       return res.json({
//         success: true,
//         data: {
//           representative,
//           shipments,
//           warehouse: {
//             items: Array.isArray(warehouse.items)
//               ? warehouse.items
//               : [],
//             movements: Array.isArray(warehouse.movements)
//               ? warehouse.movements
//               : [],
//           },
//         },
//       });
//     } catch (error) {
//       console.error('خطا در داشبورد نماینده:', error);

//       return res.status(500).json({
//         success: false,
//         error: 'خطا در دریافت داشبورد نماینده.',
//       });
//     }
//   },
// );

// ensureDataDirectory();

// [
//   ADMINS_FILE,
//   REPRESENTATIVES_FILE,
//   SHIPMENTS_FILE,
//   REPRESENTATIVE_WAREHOUSES_FILE,
// ].forEach((filePath) => {
//   ensureJsonFile(filePath, []);
// });

// createDefaultAdmin().then(() => {
//   app.listen(PORT, '0.0.0.0', () => {
//     console.log('\n🔐 ====================================');
//     console.log('✅ Auth server is running!');
//     console.log('🔐 ====================================');
//     console.log(`📍 Auth API: http://localhost:${PORT}/api/auth`);
//     console.log(`📍 Health: http://localhost:${PORT}/api/auth/health`);
//     console.log('🔐 ====================================\n');
//   });
// });
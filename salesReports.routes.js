// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const jwt = require('jsonwebtoken');

// const router = express.Router();

// const DATA_DIR = path.join(__dirname, 'data');

// const REPRESENTATIVES_FILE = path.join(
//   DATA_DIR,
//   'representatives.json',
// );

// const SALES_REPORTS_FILE = path.join(
//   DATA_DIR,
//   'salesReports.json',
// );

// const JWT_SECRET =
//   process.env.JWT_SECRET ||
//   'company-panel-secret-change-this-in-production';

// // ------------------------------------
// // File helpers
// // ------------------------------------

// const ensureDataFiles = () => {
//   if (!fs.existsSync(DATA_DIR)) {
//     fs.mkdirSync(DATA_DIR, { recursive: true });
//   }

//   if (!fs.existsSync(SALES_REPORTS_FILE)) {
//     fs.writeFileSync(
//       SALES_REPORTS_FILE,
//       JSON.stringify([], null, 2),
//       'utf8',
//     );
//   }
// };

// const readJsonFile = (filePath, fallback = []) => {
//   try {
//     if (!fs.existsSync(filePath)) {
//       return fallback;
//     }

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
//       JSON.stringify(data, null, 2),
//       'utf8',
//     );

//     return true;
//   } catch (error) {
//     console.error(`خطا در ذخیره فایل ${filePath}:`, error);

//     return false;
//   }
// };

// const readRepresentatives = () => {
//   return readJsonFile(REPRESENTATIVES_FILE, []);
// };

// const readSalesReports = () => {
//   return readJsonFile(SALES_REPORTS_FILE, []);
// };

// const writeSalesReports = (reports) => {
//   return writeJsonFile(SALES_REPORTS_FILE, reports);
// };

// // ------------------------------------
// // Value helpers
// // ------------------------------------

// const toEnglishDigits = (value) => {
//   return String(value ?? '')
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

// const sameValue = (firstValue, secondValue) => {
//   const first = normalizeValue(firstValue);
//   const second = normalizeValue(secondValue);

//   return Boolean(first && second && first === second);
// };

// const toNumber = (value) => {
//   const normalized = toEnglishDigits(value)
//     .replace(/[,٬،\s]/g, '')
//     .replace(/[^\d.-]/g, '');

//   const result = Number(normalized);

//   return Number.isFinite(result) ? result : 0;
// };

// const cleanText = (value, fallback = '') => {
//   const text = String(value ?? '').trim();

//   return text || fallback;
// };

// const createId = () => {
//   return `sale-report-${Date.now()}-${Math.random()
//     .toString(36)
//     .slice(2, 9)}`;
// };

// // ------------------------------------
// // Auth middlewares
// // ------------------------------------

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
//       error: 'لطفاً ابتدا وارد حساب کاربری شوید.',
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

// const requireRepresentative = (req, res, next) => {
//   if (req.user?.role !== 'representative') {
//     return res.status(403).json({
//       success: false,
//       error: 'این بخش فقط برای نماینده قابل دسترسی است.',
//     });
//   }

//   return next();
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

// ensureDataFiles();

// // ------------------------------------
// // POST /api/sales-reports
// //
// // ثبت اعلام فروش توسط نماینده
// // ------------------------------------

// router.post(
//   '/',
//   authenticateToken,
//   requireRepresentative,
//   (req, res) => {
//     try {
//       const representativeId = String(
//         req.user.representativeId || req.user.id || '',
//       ).trim();

//       const itemsCount = toNumber(req.body.itemsCount);
//       const totalItems = toNumber(req.body.totalItems);
//       const saleDate = cleanText(req.body.saleDate);

//       if (itemsCount < 1) {
//         return res.status(400).json({
//           success: false,
//           error: 'تعداد فاکتور فروش باید حداقل ۱ باشد.',
//         });
//       }

//       if (totalItems < 1) {
//         return res.status(400).json({
//           success: false,
//           error:
//             'تعداد کل کالاهای فروخته‌شده باید حداقل ۱ باشد.',
//         });
//       }

//       if (!/^\d{4}\/\d{2}\/\d{2}$/.test(saleDate)) {
//         return res.status(400).json({
//           success: false,
//           error:
//             'تاریخ فروش باید با فرمت 1405/07/04 ارسال شود.',
//         });
//       }

//       const representatives = readRepresentatives();

//       const representative = representatives.find((item) => {
//         return sameValue(item.id, representativeId);
//       });

//       if (!representative) {
//         return res.status(404).json({
//           success: false,
//           error: 'اطلاعات نماینده پیدا نشد.',
//         });
//       }

//       if (representative.status === 'inactive') {
//         return res.status(403).json({
//           success: false,
//           error: 'حساب این نماینده غیرفعال است.',
//         });
//       }

//       const now = new Date().toISOString();

//       const newReport = {
//         id: createId(),
//         representativeId: String(representative.id),
//         representativeCode: cleanText(representative.code),
//         representativeName: cleanText(
//           representative.name,
//           'نماینده',
//         ),
//         representativeCity: cleanText(representative.city),
//         itemsCount,
//         totalItems,
//         saleDate,
//         createdAt: now,
//         updatedAt: now,
//       };

//       const reports = readSalesReports();

//       reports.unshift(newReport);

//       const saved = writeSalesReports(reports);

//       if (!saved) {
//         return res.status(500).json({
//           success: false,
//           error: 'ذخیره اعلام فروش در سرور انجام نشد.',
//         });
//       }

//       return res.status(201).json({
//         success: true,
//         message: 'اعلام فروش با موفقیت ثبت شد.',
//         data: newReport,
//       });
//     } catch (error) {
//       console.error('خطا در ثبت اعلام فروش:', error);

//       return res.status(500).json({
//         success: false,
//         error:
//           error.message || 'خطا در ثبت اعلام فروش.',
//       });
//     }
//   },
// );

// // ------------------------------------
// // GET /api/sales-reports/my
// //
// // تاریخچه فروش نمایندهٔ واردشده
// // ------------------------------------

// router.get(
//   '/my',
//   authenticateToken,
//   requireRepresentative,
//   (req, res) => {
//     try {
//       const representativeId = String(
//         req.user.representativeId || req.user.id || '',
//       ).trim();

//       const reports = readSalesReports()
//         .filter((report) => {
//           return sameValue(
//             report.representativeId,
//             representativeId,
//           );
//         })
//         .sort((first, second) => {
//           return (
//             new Date(second.createdAt).getTime() -
//             new Date(first.createdAt).getTime()
//           );
//         });

//       return res.json({
//         success: true,
//         count: reports.length,
//         data: reports,
//       });
//     } catch (error) {
//       console.error('خطا در دریافت فروش‌های نماینده:', error);

//       return res.status(500).json({
//         success: false,
//         error: 'خطا در دریافت تاریخچه اعلام فروش.',
//       });
//     }
//   },
// );

// // ------------------------------------
// // GET /api/sales-reports/admin/all
// //
// // تمام اعلام فروش‌ها برای ادمین
// // ------------------------------------

// router.get(
//   '/admin/all',
//   authenticateToken,
//   requireAdmin,
//   (req, res) => {
//     try {
//       const reports = [...readSalesReports()].sort(
//         (first, second) => {
//           return (
//             new Date(second.createdAt).getTime() -
//             new Date(first.createdAt).getTime()
//           );
//         },
//       );

//       return res.json({
//         success: true,
//         count: reports.length,
//         data: reports,
//       });
//     } catch (error) {
//       console.error(
//         'خطا در دریافت اعلام فروش‌ها برای ادمین:',
//         error,
//       );

//       return res.status(500).json({
//         success: false,
//         error: 'خطا در دریافت اعلام فروش‌ها.',
//       });
//     }
//   },
// );

// module.exports = router;
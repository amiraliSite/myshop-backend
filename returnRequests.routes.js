// const express = require('express');
// const fs = require('fs');
// const path = require('path');
// const jwt = require('jsonwebtoken');

// const router = express.Router();

// const DATA_DIR = path.join(__dirname, 'data');

// const SALES_REPORTS_FILE = path.join(
//   DATA_DIR,
//   'salesReports.json',
// );

// const JWT_SECRET =
//   process.env.JWT_SECRET ||
//   'company-panel-secret-change-this-in-production';

// const readJsonFile = (filePath, fallback = []) => {
//   try {
//     if (!fs.existsSync(filePath)) {
//       return fallback;
//     }

//     const rawData = fs.readFileSync(filePath, 'utf8');

//     if (!rawData.trim()) {
//       return fallback;
//     }

//     const data = JSON.parse(rawData);

//     return Array.isArray(data) ? data : fallback;
//   } catch (error) {
//     console.error(
//       `خطا در خواندن فایل ${filePath}:`,
//       error,
//     );

//     return fallback;
//   }
// };

// const ensureSalesReportsFile = () => {
//   try {
//     if (!fs.existsSync(DATA_DIR)) {
//       fs.mkdirSync(DATA_DIR, { recursive: true });
//     }

//     if (!fs.existsSync(SALES_REPORTS_FILE)) {
//       fs.writeFileSync(
//         SALES_REPORTS_FILE,
//         JSON.stringify([], null, 2),
//         'utf8',
//       );
//     }
//   } catch (error) {
//     console.error('خطا در ایجاد فایل اعلام فروش:', error);
//   }
// };

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

// const requireAdmin = (req, res, next) => {
//   if (req.user?.role !== 'admin') {
//     return res.status(403).json({
//       success: false,
//       error: 'این بخش فقط برای ادمین قابل دسترسی است.',
//     });
//   }

//   return next();
// };

// ensureSalesReportsFile();

// /*
//   GET /api/admin/sales-reports

//   نمایش همه اعلام فروش‌های ثبت‌شده برای ادمین.
// */
// router.get(
//   '/',
//   authenticateToken,
//   requireAdmin,
//   (req, res) => {
//     try {
//       const salesReports = readJsonFile(
//         SALES_REPORTS_FILE,
//         [],
//       );

//       const sortedSalesReports = [...salesReports].sort(
//         (first, second) => {
//           return (
//             new Date(second.createdAt).getTime() -
//             new Date(first.createdAt).getTime()
//           );
//         },
//       );

//       return res.json({
//         success: true,
//         count: sortedSalesReports.length,
//         data: sortedSalesReports,
//       });
//     } catch (error) {
//       console.error(
//         'خطا در دریافت اعلام فروش نمایندگان:',
//         error,
//       );

//       return res.status(500).json({
//         success: false,
//         error:
//           error.message ||
//           'خطا در دریافت اعلام فروش نمایندگان.',
//       });
//     }
//   },
// );

// module.exports = router;
require('dotenv').config();


const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');


const {
  ensureDataFiles,
  readRepresentatives,
  readRepresentativeWarehouses,
  readSalesReports,
} = require('./helpers/jsonStorage');


const authRouter = require('./routes/auth.routes');
const productsRouter = require('./routes/products.routes');
const representativesRouter = require('./routes/representatives.routes');
const representativeFilesRouter = require('./routes/representativeFiles.routes');
const representativeWarehouseRouter = require('./routes/representativeWarehouse.routes');
const representativeDashboardRouter = require('./routes/representativeDashboard.routes');
const salesFromWarehouseRouter = require('./routes/salesFromWarehouse.routes');
const shipmentsRouter = require('./routes/shipments.routes');
const returnRequestsRouter = require('./routes/returnRequests.routes');
const adminReturnRequestsRouter = require('./routes/adminReturnRequests.routes');
const supportRequestsRouter = require('./routes/supportRequests');
const adminSupportRequestsRouter = require('./routes/adminSupportRequests.routes');
const notesRouter = require('./routes/notes.routes');


const app = express();


const PORT = Number(process.env.PORT) || 5000;


const UPLOADS_DIR = path.join(__dirname, 'uploads');


// اطمینان از وجود فایل‌های داده
ensureDataFiles();


// ساخت پوشهٔ آپلودها اگر وجود ندارد
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, {
    recursive: true,
  });
}


// پوشهٔ فایل‌های نمایندگان
const REPRESENTATIVES_FILES_DIR = path.join(
  __dirname,
  'data',
  'representatives',
);


if (!fs.existsSync(REPRESENTATIVES_FILES_DIR)) {
  fs.mkdirSync(REPRESENTATIVES_FILES_DIR, {
    recursive: true,
  });
}


// ========== Middleware Cache-Control ==========
// غیرفعال کردن کامل Cache برای همه درخواست‌ها
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});
// ===============================================


// میدل‌ورها
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);


app.use(
  express.json({
    limit: '10mb',
  }),
);


app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
  }),
);


app.use('/uploads', express.static(UPLOADS_DIR));


// Health check
app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    status: 'ok',
    message: 'Main backend is running.',
    timestamp: new Date().toISOString(),
  });
});


// روت‌های API
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/representatives', representativeFilesRouter);
app.use('/api/representatives', representativeWarehouseRouter);
app.use('/api/representatives', representativesRouter);
app.use('/api/representative', representativeDashboardRouter);
app.use('/api/sales-from-warehouse', salesFromWarehouseRouter);
app.use('/api/shipments', shipmentsRouter);
app.use('/api/return-requests', returnRequestsRouter);
app.use('/api/admin/return-requests', adminReturnRequestsRouter);
app.use('/api/support-requests', supportRequestsRouter);
app.use('/api/admin/support-requests', adminSupportRequestsRouter);
app.use('/api/notes', notesRouter);


// ========== DEBUG: دانلود فایل‌های JSON ==========
app.get('/api/debug/data-files', (req, res) => {
  try {
    const representatives = readRepresentatives();
    const warehouses = readRepresentativeWarehouses();
    const sales = readSalesReports();


    return res.json({
      success: true,
      data: {
        representativesCount: representatives.length,
        warehousesCount: warehouses.length,
        salesCount: sales.length,
        representatives,
        warehouses,
        sales,
      },
    });
  } catch (error) {
    console.error('خطا در خواندن فایل‌های JSON:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'خطا در خواندن داده‌ها.',
    });
  }
});
// ================================================


// 404 برای مسیرهای تعریف‌نشده
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'مسیر API پیدا نشد.',
    method: req.method,
    path: req.originalUrl,
  });
});


// هندلر خطاهای سراسری
app.use((error, _req, res, _next) => {
  console.error('❌ Server error:', error);


  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: 'حجم فایل نباید بیشتر از 10 مگابایت باشد.',
    });
  }


  if (error?.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: error.message || 'خطا در دریافت فایل ارسالی.',
    });
  }


  if (error?.message) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }


  return res.status(500).json({
    success: false,
    error: 'خطای داخلی سرور رخ داد.',
  });
});


// گرفتن IPهای محلی برای نمایش در لاگ
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];


  for (const interfaceList of Object.values(interfaces)) {
    if (!interfaceList) continue;


    for (const network of interfaceList) {
      const isIPv4 = network.family === 'IPv4';
      const isPrivateNetwork =
        network.address.startsWith('192.168.') ||
        network.address.startsWith('10.') ||
        network.address.startsWith('172.');


      if (isIPv4 && !network.internal && isPrivateNetwork) {
        ips.push(network.address);
      }
    }
  }


  return ips;
}


// شروع سرور
app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();


  console.log('\n🚀 ====================================');
  console.log('✅ Main backend is running!');
  console.log('🚀 ====================================');
  console.log(`📍 API: http://localhost:${PORT}/api`);
  console.log(`📍 Health: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Auth: http://localhost:${PORT}/api/auth`);
  console.log(`📦 Products: http://localhost:${PORT}/api/products`);
  console.log(`📤 Excel upload: POST http://localhost:${PORT}/api/products/upload`);
  console.log(`👥 Representatives: http://localhost:${PORT}/api/representatives`);
  console.log(`📁 Representative files: http://localhost:${PORT}/api/representatives/:id/files`);
  console.log(`🏪 Representative warehouse: http://localhost:${PORT}/api/representatives/:id/warehouse`);
  console.log(`👤 Representative dashboard: http://localhost:${PORT}/api/representative/dashboard`);
  console.log(`🔄 Warehouse summary sync: POST http://localhost:${PORT}/api/representatives/warehouse/sync-summaries`);
  console.log(`🚚 Shipments: http://localhost:${PORT}/api/shipments`);
  console.log(`↩️ Return requests: http://localhost:${PORT}/api/return-requests`);
  console.log(`👤 My return requests: http://localhost:${PORT}/api/return-requests/my`);
  console.log(`🛡️ Admin return requests: http://localhost:${PORT}/api/admin/return-requests`);
  console.log(`🆘 Support requests: http://localhost:${PORT}/api/support-requests`);
  console.log(`👤 My support requests: http://localhost:${PORT}/api/support-requests/mine`);
  console.log(`🛡️ Admin support requests: http://localhost:${PORT}/api/admin/support-requests`);
  console.log(`📝 Notes: http://localhost:${PORT}/api/notes`);
  console.log(`📁 Uploads: http://localhost:${PORT}/uploads`);
  console.log(`🔍 Debug data: http://localhost:${PORT}/api/debug/data-files`);


  if (ips.length > 0) {
    console.log('📱 Network addresses:');
    ips.forEach((ip) => {
      console.log(`   http://${ip}:${PORT}/api`);
    });
  }


  console.log('🚀 ====================================\n');
});
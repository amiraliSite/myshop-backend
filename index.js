require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  DATA_DIR,
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
const warrantiesRouter = require('./routes/warranties.routes');

const app = express();

const PORT = Number(process.env.PORT) || 5000;

const DEFAULT_LOCAL_DATA_DIR = path.join(
  __dirname,
  'data',
);

const STORAGE_DIR =
  DATA_DIR || DEFAULT_LOCAL_DATA_DIR;

const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(STORAGE_DIR, 'uploads');

const REPRESENTATIVES_FILES_DIR =
  path.join(
    STORAGE_DIR,
    'representatives',
  );

const WARRANTIES_UPLOADS_DIR =
  path.join(
    UPLOADS_DIR,
    'warranties',
  );

ensureDataFiles();

fs.mkdirSync(UPLOADS_DIR, {
  recursive: true,
});

fs.mkdirSync(
  REPRESENTATIVES_FILES_DIR,
  {
    recursive: true,
  },
);

fs.mkdirSync(
  WARRANTIES_UPLOADS_DIR,
  {
    recursive: true,
  },
);

console.log(
  '📁 مسیر داده‌ها:',
  STORAGE_DIR,
);

console.log(
  '📁 مسیر آپلودها:',
  UPLOADS_DIR,
);

const allowedOrigins = [
  'https://yadakamir.netlify.app',
  'https://www.yadakamir.netlify.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
]
  .filter(Boolean)
  .map((origin) =>
    origin.trim().replace(/\/+$/, ''),
  );

console.log(
  '🌐 Allowed CORS origins:',
  allowedOrigins,
);

const corsOptions = {
  origin(origin, callback) {
    const normalizedOrigin = origin
      ? origin.trim().replace(/\/+$/, '')
      : '';

    if (
      !normalizedOrigin ||
      allowedOrigins.includes(normalizedOrigin)
    ) {
      callback(null, true);
      return;
    }

    console.error(
      '❌ CORS origin rejected:',
      normalizedOrigin,
    );

    callback(
      new Error(
        'Origin توسط CORS مجاز نیست.',
      ),
    );
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ],

  allowedHeaders: [
    'Accept',
    'Content-Type',
    'Authorization',
    'Cache-Control',
    'Pragma',
    'X-Requested-With',
  ],

  exposedHeaders: [
    'Content-Length',
    'Content-Disposition',
  ],

  optionsSuccessStatus: 204,

  maxAge: 86400,
};

app.use(cors(corsOptions));

app.options(
  '*',
  cors(corsOptions),
);

app.use((req, res, next) => {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );

  res.setHeader(
    'Pragma',
    'no-cache',
  );

  res.setHeader(
    'Expires',
    '0',
  );

  res.setHeader(
    'Surrogate-Control',
    'no-store',
  );

  next();
});

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

app.use(cookieParser());

app.use(
  '/uploads',
  express.static(UPLOADS_DIR),
);

app.get('/api/health', (_req, res) => {
  return res.status(200).json({
    success: true,
    status: 'ok',
    message: 'Main backend is running.',
    dataDirectory: STORAGE_DIR,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRouter);

app.use(
  '/api/products',
  productsRouter,
);

app.use(
  '/api/representatives',
  representativeFilesRouter,
);

app.use(
  '/api/representatives',
  representativeWarehouseRouter,
);

app.use(
  '/api/representatives',
  representativesRouter,
);

app.use(
  '/api/representative',
  representativeDashboardRouter,
);

app.use(
  '/api/representatives',
  representativeDashboardRouter,
);

app.use(
  '/api/sales-from-warehouse',
  salesFromWarehouseRouter,
);

app.use(
  '/api/shipments',
  shipmentsRouter,
);

app.use(
  '/api/return-requests',
  returnRequestsRouter,
);

app.use(
  '/api/admin/return-requests',
  adminReturnRequestsRouter,
);

app.use(
  '/api/support-requests',
  supportRequestsRouter,
);

app.use(
  '/api/admin/support-requests',
  adminSupportRequestsRouter,
);

app.use(
  '/api/notes',
  notesRouter,
);

app.use(
  '/api/warranties',
  warrantiesRouter,
);

app.get('/api/debug/data-files', (_req, res) => {
  try {
    const representatives =
      readRepresentatives();

    const warehouses =
      readRepresentativeWarehouses();

    const sales =
      readSalesReports();

    return res.status(200).json({
      success: true,
      data: {
        dataDirectory: STORAGE_DIR,
        representativesCount:
          representatives.length,
        warehousesCount:
          warehouses.length,
        salesCount: sales.length,
        representatives,
        warehouses,
        sales,
      },
    });
  } catch (error) {
    console.error(
      'خطا در خواندن فایل‌های داده:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        'خطا در خواندن داده‌ها.',
    });
  }
});

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: 'مسیر API پیدا نشد.',
    method: req.method,
    path: req.originalUrl,
  });
});

app.use(
  (error, _req, res, _next) => {
    console.error(
      '❌ Server error:',
      error,
    );

    if (
      error?.code === 'LIMIT_FILE_SIZE'
    ) {
      return res.status(400).json({
        success: false,
        error:
          'حجم فایل نباید بیشتر از 10 مگابایت باشد.',
      });
    }

    if (
      error?.name === 'MulterError'
    ) {
      return res.status(400).json({
        success: false,
        error:
          error.message ||
          'خطا در دریافت فایل ارسالی.',
      });
    }

    if (
      error?.message ===
      'Origin توسط CORS مجاز نیست.'
    ) {
      return res.status(403).json({
        success: false,
        error: error.message,
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
      error:
        'خطای داخلی سرور رخ داد.',
    });
  },
);

function getLocalIPs() {
  const interfaces =
    os.networkInterfaces();

  const ips = [];

  for (const interfaceList of Object.values(
    interfaces,
  )) {
    if (!interfaceList) {
      continue;
    }

    for (const network of interfaceList) {
      const address =
        network.address;

      const isIPv4 =
        network.family === 'IPv4' ||
        network.family === 4;

      const isPrivateNetwork =
        address.startsWith('192.168.') ||
        address.startsWith('10.') ||
        address.startsWith('172.');

      if (
        isIPv4 &&
        !network.internal &&
        isPrivateNetwork
      ) {
        ips.push(address);
      }
    }
  }

  return ips;
}

app.listen(
  PORT,
  '0.0.0.0',
  () => {
    const ips = getLocalIPs();

    console.log('');
    console.log(
      '🚀 ====================================',
    );
    console.log(
      '✅ Main backend is running!',
    );
    console.log(
      '🚀 ====================================',
    );

    console.log(
      `📍 API: http://localhost:${PORT}/api`,
    );

    console.log(
      `📍 Health: http://localhost:${PORT}/api/health`,
    );

    console.log(
      `📦 Products: http://localhost:${PORT}/api/products`,
    );

    console.log(
      `📁 Data directory: ${STORAGE_DIR}`,
    );

    console.log(
      `📁 Uploads directory: ${UPLOADS_DIR}`,
    );

    console.log(
      `🔍 Debug data: http://localhost:${PORT}/api/debug/data-files`,
    );

    if (ips.length > 0) {
      console.log(
        '📱 Network addresses:',
      );

      ips.forEach((ip) => {
        console.log(
          `   http://${ip}:${PORT}/api`,
        );
      });
    }

    console.log(
      '🚀 ====================================',
    );
    console.log('');
  },
);
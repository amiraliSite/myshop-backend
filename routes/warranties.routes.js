const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const {
  readWarranties,
  writeWarranties,
  readRepresentatives,
  readRepresentativeWarehouses,
  writeRepresentativeWarehouses,
} = require('../helpers/jsonStorage');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const WARRANTIES_UPLOAD_DIR = path.join(
  UPLOADS_DIR,
  'warranties',
);

const PAYAMITO_PATTERN_URL =
  'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';

if (!fs.existsSync(WARRANTIES_UPLOAD_DIR)) {
  fs.mkdirSync(WARRANTIES_UPLOAD_DIR, {
    recursive: true,
  });
}

const normalizeText = (value) => {
  return String(value || '').trim();
};

const createId = (prefix = 'warranty') => {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
};

const createWarrantyTrackingCode = (warranties) => {
  const existingCodes = new Set(
    warranties
      .map((warranty) => {
        return String(
          warranty.trackingCode || '',
        ).trim();
      })
      .filter(Boolean),
  );

  let trackingCode = '';

  do {
    trackingCode = String(
      Math.floor(
        1000000000 + Math.random() * 9000000000,
      ),
    );
  } while (existingCodes.has(trackingCode));

  return trackingCode;
};

const getJwtSecret = () => {
  return (
    process.env.JWT_SECRET ||
    process.env.JWT_SECRET_KEY ||
    'change-this-jwt-secret'
  );
};

const getTokenFromRequest = (req) => {
  const authHeader = String(
    req.headers.authorization || '',
  );

  if (!authHeader.startsWith('Bearer ')) {
    return '';
  }

  return authHeader.slice(7).trim();
};

const authenticateToken = (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'توکن اعتبارسنجی ارسال نشده است.',
      });
    }

    req.user = jwt.verify(token, getJwtSecret());

    return next();
  } catch (error) {
    console.error('خطا در اعتبارسنجی توکن گارانتی:', error);

    return res.status(401).json({
      success: false,
      error: 'توکن نامعتبر یا منقضی شده است.',
    });
  }
};

const requireRepresentative = (req, res, next) => {
  const role = normalizeText(req.user?.role);

  if (
    role !== 'representative' &&
    role !== 'user'
  ) {
    return res.status(403).json({
      success: false,
      error: 'فقط نماینده به این بخش دسترسی دارد.',
    });
  }

  return next();
};

const requireAdmin = (req, res, next) => {
  const role = normalizeText(req.user?.role);

  if (role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'فقط ادمین به این بخش دسترسی دارد.',
    });
  }

  return next();
};

const getRepresentativeId = (user) => {
  return normalizeText(
    user?.representativeId ||
      user?.id ||
      '',
  );
};

const findRepresentative = (representativeId) => {
  const representatives = readRepresentatives();

  return (
    representatives.find((representative) => {
      return (
        String(representative.id) ===
        String(representativeId)
      );
    }) || null
  );
};

const findRepresentativeWarehouse = (
  representativeId,
  warehouses,
) => {
  return (
    warehouses.find((warehouse) => {
      return (
        String(warehouse.representativeId) ===
        String(representativeId)
      );
    }) || null
  );
};

const toEnglishDigits = (value) => {
  return String(value || '')
    .replace(/[۰-۹]/g, (digit) => {
      return String(
        '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit),
      );
    })
    .replace(/[٠-٩]/g, (digit) => {
      return String(
        '٠١٢٣٤٥٦٧٨٩'.indexOf(digit),
      );
    });
};

const normalizeIranMobile = (value) => {
  const phone = toEnglishDigits(value).replace(
    /[^\d]/g,
    '',
  );

  if (phone.startsWith('0098')) {
    return `0${phone.slice(4)}`;
  }

  if (phone.startsWith('98')) {
    return `0${phone.slice(2)}`;
  }

  if (
    phone.length === 10 &&
    phone.startsWith('9')
  ) {
    return `0${phone}`;
  }

  return phone;
};

const getWarrantySmsDate = (value) => {
  const inputDate = new Date(value || Date.now());

  const date = Number.isNaN(inputDate.getTime())
    ? new Date()
    : inputDate;

  return new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

const getSmsErrorMessage = (result) => {
  if (!result) {
    return 'پاسخی از سامانه پیامک دریافت نشد.';
  }

  if (typeof result === 'string') {
    return result;
  }

  return (
    result.message ||
    result.error ||
    result.Message ||
    result.Error ||
    JSON.stringify(result)
  );
};

const sendWarrantyApprovedSms = async ({
  customerName,
  customerPhone,
  productName,
  trackingCode,
  approvedAt,
}) => {
  const username = normalizeText(
    process.env.PAYAMITO_USERNAME,
  );

  const password = normalizeText(
    process.env.PAYAMITO_PASSWORD,
  );

  const bodyId = Number(
    process.env.PAYAMITO_WARRANTY_PATTERN_ID ||
      process.env.PAYAMITO_BODY_ID ||
      547695,
  );

  if (!username || !password || !bodyId) {
    console.log(
      '⏸️ پیامک گارانتی ارسال نشد: تنظیمات پیامیتو یا کد پترن کامل نیست.',
      { username: !!username, password: !!password, bodyId },
    );

    return {
      success: false,
      skipped: true,
      reason:
        'تنظیمات پیامیتو یا کد پترن گارانتی کامل نیست.',
    };
  }

  const to = normalizeIranMobile(customerPhone);

  if (!/^09\d{9}$/.test(to)) {
    console.log(
      '⏸️ پیامک گارانتی ارسال نشد: شماره مشتری نامعتبر است:',
      to,
    );

    return {
      success: false,
      skipped: true,
      reason: 'شماره موبایل مشتری معتبر نیست.',
    };
  }

  const text = [
    normalizeText(customerName) || 'مشتری گرامی',
    normalizeText(productName) || 'کالا',
    getWarrantySmsDate(approvedAt),
    normalizeText(trackingCode),
  ].join(';');

  try {
    const response = await fetch(
      PAYAMITO_PATTERN_URL,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json; charset=utf-8',
        },

        body: JSON.stringify({
          username,
          password,
          text,
          to,
          bodyId,
        }),
      },
    );

    let result = null;

    try {
      result = await response.json();
    } catch (_error) {
      result = await response.text();
    }

    if (!response.ok) {
      console.error(
        '❌ خطای HTTP در ارسال پیامک گارانتی:',
        result,
      );

      return {
        success: false,
        skipped: false,
        reason: getSmsErrorMessage(result),
        result,
      };
    }

    console.log(
      '✅ نتیجه ارسال پیامک گارانتی:',
      result,
    );

    return {
      success: true,
      skipped: false,
      result,
    };
  } catch (error) {
    console.error(
      '❌ خطا در اتصال به پیامیتو:',
      error,
    );

    return {
      success: false,
      skipped: false,
      reason:
        error.message ||
        'خطا در ارتباط با سامانه پیامک.',
      result: null,
    };
  }
};

// استفاده از memoryStorage برای اینکه عکس‌ها توی حافظه بمونن
// و بعد به‌صورت base64 توی دیتابیس ذخیره بشن (مشکل پاک شدن فایل‌ها روی Render حل میشه)
const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (_req, _file, callback) => {
    callback(null, true);
  },
});

// تابع کمکی برای تبدیل buffer به base64 data URL
const formatImageAsBase64 = (file) => {
  if (!file || !file.buffer) {
    return '';
  }

  const mimeType =
    file.mimetype || 'image/jpeg';

  const base64 = file.buffer.toString(
    'base64',
  );

  return `data:${mimeType};base64,${base64}`;
};

// تابع کمکی برای ذخیره عکس روی دیسک (به‌عنوان fallback)
const saveImageToDisk = (file) => {
  try {
    if (!file || !file.buffer) {
      return '';
    }

    const extension =
      path.extname(file.originalname).toLowerCase() ||
      '.jpg';

    const filename = `${createId('warranty-image')}${extension}`;
    const filePath = path.join(
      WARRANTIES_UPLOAD_DIR,
      filename,
    );

    fs.writeFileSync(filePath, file.buffer);

    return `/uploads/warranties/${filename}`;
  } catch (error) {
    console.error(
      'خطا در ذخیره عکس روی دیسک:',
      error,
    );

    return '';
  }
};

const removeUploadedFile = (file) => {
  // با memoryStorage دیگر فایلی روی دیسک نیست که حذف کنیم
  return;
};

router.get(
  '/form-data',
  authenticateToken,
  requireRepresentative,
  (req, res) => {
    try {
      const representativeId = getRepresentativeId(
        req.user,
      );

      if (!representativeId) {
        return res.status(400).json({
          success: false,
          error: 'شناسه نماینده پیدا نشد.',
        });
      }

      const representative = findRepresentative(
        representativeId,
      );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'اطلاعات نماینده پیدا نشد.',
        });
      }

      const warehouses =
        readRepresentativeWarehouses();

      const warehouse = findRepresentativeWarehouse(
        representativeId,
        warehouses,
      );

      const items = Array.isArray(warehouse?.items)
        ? warehouse.items
        : [];

      const products = items
        .filter((item) => {
          return Number(item.quantity) > 0;
        })
        .map((item) => {
          return {
            warehouseItemId: String(item.id || ''),
            productId: String(item.productId || ''),
            productName: item.productName || '',
            brand: item.brand || '',
            category: item.category || '',
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unitPrice) || 0,
          };
        });

      return res.json({
        success: true,
        data: {
          representative: {
            id: String(representative.id || ''),
            name: representative.name || '',
            code: representative.code || '',
            city: representative.city || '',
          },
          products,
        },
      });
    } catch (error) {
      console.error(
        'خطا در دریافت اطلاعات فرم گارانتی:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در دریافت اطلاعات فرم گارانتی.',
      });
    }
  },
);

router.post(
  '/',
  authenticateToken,
  requireRepresentative,
  upload.single('image'),
  (req, res) => {
    try {
      const representativeId = getRepresentativeId(
        req.user,
      );

      const customerName = normalizeText(
        req.body.customerName,
      );

      const customerPhone = normalizeIranMobile(
        req.body.customerPhone,
      );

      const productId = normalizeText(
        req.body.productId,
      );

      const quantity = Number(req.body.quantity);

      const issueDescription = normalizeText(
        req.body.issueDescription,
      );

      if (!representativeId) {
        removeUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: 'شناسه نماینده پیدا نشد.',
        });
      }

      if (!customerName) {
        removeUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: 'نام مشتری الزامی است.',
        });
      }

      if (!/^09\d{9}$/.test(customerPhone)) {
        removeUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: 'شماره موبایل مشتری معتبر نیست.',
        });
      }

      if (!productId) {
        removeUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: 'انتخاب محصول الزامی است.',
        });
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        removeUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: 'تعداد کالا معتبر نیست.',
        });
      }

      if (issueDescription.length < 10) {
        removeUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error:
            'شرح مشکل باید حداقل ۱۰ کاراکتر باشد.',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'تصویر کالا یا خرابی الزامی است.',
        });
      }

      const representative = findRepresentative(
        representativeId,
      );

      if (!representative) {
        removeUploadedFile(req.file);

        return res.status(404).json({
          success: false,
          error: 'اطلاعات نماینده پیدا نشد.',
        });
      }

      const warehouses =
        readRepresentativeWarehouses();

      const warehouse = findRepresentativeWarehouse(
        representativeId,
        warehouses,
      );

      const warehouseItems = Array.isArray(
        warehouse?.items,
      )
        ? warehouse.items
        : [];

      const warehouseItem = warehouseItems.find(
        (item) => {
          return (
            String(item.productId) === productId ||
            String(item.id) === productId
          );
        },
      );

      if (!warehouseItem) {
        removeUploadedFile(req.file);

        return res.status(404).json({
          success: false,
          error:
            'محصول انتخاب‌شده در انبار شما پیدا نشد.',
        });
      }

      const availableQuantity =
        Number(warehouseItem.quantity) || 0;

      if (quantity > availableQuantity) {
        removeUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          error: `تعداد درخواستی بیشتر از موجودی انبار است. موجودی فعلی: ${availableQuantity}`,
        });
      }

      const now = new Date().toISOString();

      const warranties = readWarranties();

      const trackingCode = createWarrantyTrackingCode(
        warranties,
      );

      const warranty = {
        id: createId(),
        trackingCode,

        representativeId: String(representative.id),
        representativeName: representative.name || '',
        representativeCode: representative.code || '',
        representativeCity: representative.city || '',

        customerName,
        customerPhone,

        productId: String(warehouseItem.productId || ''),
        warehouseItemId: String(warehouseItem.id || ''),
        productName: warehouseItem.productName || '',
        brand: warehouseItem.brand || '',
        category: warehouseItem.category || '',

        quantity,
        issueDescription,

        // ذخیره عکس به‌صورت base64 برای جلوگیری از پاک شدن روی Render
        image: req.file
          ? formatImageAsBase64(req.file) ||
            saveImageToDisk(req.file)
          : '',

        requestDate: now,
        status: 'pending',

        adminNote: '',
        decidedAt: null,
        decidedBy: '',
        stockDeductedAt: null,
        stockDeductedBy: '',

        smsStatus: 'not_sent',
        smsSentAt: null,
        smsError: '',
        smsResponse: null,

        createdAt: now,
        updatedAt: now,
      };

      warranties.unshift(warranty);

      const saved = writeWarranties(warranties);

      if (!saved) {
        removeUploadedFile(req.file);

        throw new Error(
          'ذخیره درخواست گارانتی ناموفق بود.',
        );
      }

      return res.status(201).json({
        success: true,
        message:
          'درخواست گارانتی با موفقیت ثبت شد.',
        data: warranty,
      });
    } catch (error) {
      console.error(
        'خطا در ثبت درخواست گارانتی:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در ثبت درخواست گارانتی.',
      });
    }
  },
);

router.get(
  '/my',
  authenticateToken,
  requireRepresentative,
  (req, res) => {
    try {
      const representativeId = getRepresentativeId(
        req.user,
      );

      const warranties = readWarranties()
        .filter((warranty) => {
          return (
            String(warranty.representativeId) ===
            String(representativeId)
          );
        })
        .sort((first, second) => {
          return (
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime()
          );
        });

      return res.json({
        success: true,
        count: warranties.length,
        data: warranties,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت درخواست‌های گارانتی نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در دریافت درخواست‌های گارانتی.',
      });
    }
  },
);

router.get(
  '/admin/all',
  authenticateToken,
  requireAdmin,
  (_req, res) => {
    try {
      const warranties = readWarranties().sort(
        (first, second) => {
          return (
            new Date(second.createdAt).getTime() -
            new Date(first.createdAt).getTime()
          );
        },
      );

      return res.json({
        success: true,
        count: warranties.length,
        data: warranties,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت درخواست‌های گارانتی ادمین:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در دریافت درخواست‌های گارانتی.',
      });
    }
  },
);

router.patch(
  '/admin/:id/decision',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const warrantyId = normalizeText(req.params.id);

      const decision = normalizeText(
        req.body.status,
      );

      const adminNote = normalizeText(
        req.body.adminNote,
      );

      if (
        decision !== 'approved' &&
        decision !== 'rejected'
      ) {
        return res.status(400).json({
          success: false,
          error:
            'وضعیت تصمیم باید approved یا rejected باشد.',
        });
      }

      const warranties = readWarranties();

      const warrantyIndex = warranties.findIndex(
        (warranty) => {
          return String(warranty.id) === warrantyId;
        },
      );

      if (warrantyIndex === -1) {
        return res.status(404).json({
          success: false,
          error: 'درخواست گارانتی پیدا نشد.',
        });
      }

      const currentWarranty = warranties[warrantyIndex];

      if (currentWarranty.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error:
            'این درخواست قبلاً بررسی شده است و امکان تصمیم‌گیری مجدد ندارد.',
        });
      }

      const now = new Date().toISOString();

      const adminName = normalizeText(
        req.user?.name ||
          req.user?.username ||
          'ادمین',
      );

      let updatedWarehouseItem = null;

      if (decision === 'approved') {
        const warehouses =
          readRepresentativeWarehouses();

        const warehouse =
          findRepresentativeWarehouse(
            currentWarranty.representativeId,
            warehouses,
          );

        if (!warehouse) {
          return res.status(404).json({
            success: false,
            error:
              'انبار نماینده برای این درخواست پیدا نشد.',
          });
        }

        if (!Array.isArray(warehouse.items)) {
          return res.status(400).json({
            success: false,
            error:
              'اطلاعات کالای انبار نماینده نامعتبر است.',
          });
        }

        const itemIndex = warehouse.items.findIndex(
          (item) => {
            return (
              String(item.id) ===
                String(
                  currentWarranty.warehouseItemId,
                ) ||
              String(item.productId) ===
                String(currentWarranty.productId)
            );
          },
        );

        if (itemIndex === -1) {
          return res.status(404).json({
            success: false,
            error:
              'کالای مربوط به درخواست در انبار نماینده پیدا نشد.',
          });
        }

        const warehouseItem = warehouse.items[itemIndex];

        const currentQuantity =
          Number(warehouseItem.quantity) || 0;

        const requestedQuantity =
          Number(currentWarranty.quantity) || 0;

        if (
          requestedQuantity < 1 ||
          currentQuantity < requestedQuantity
        ) {
          return res.status(400).json({
            success: false,
            error: `موجودی فعلی انبار برای تأیید کافی نیست. موجودی فعلی: ${currentQuantity} عدد`,
          });
        }

        const nextQuantity =
          currentQuantity - requestedQuantity;

        warehouse.items[itemIndex] = {
          ...warehouseItem,
          quantity: nextQuantity,
          totalPrice:
            (Number(warehouseItem.unitPrice) || 0) *
            nextQuantity,
          status:
            nextQuantity <= 0
              ? 'out'
              : nextQuantity <=
                  (Number(
                    warehouseItem.minimumStock,
                  ) || 0)
                ? 'low'
                : 'normal',
          lastUpdated: now,
        };

        updatedWarehouseItem =
          warehouse.items[itemIndex];

        if (!Array.isArray(warehouse.movements)) {
          warehouse.movements = [];
        }

        warehouse.movements.unshift({
          id: createId('warranty-movement'),
          representativeId: String(
            currentWarranty.representativeId,
          ),
          productId: String(
            warehouseItem.productId || '',
          ),
          productName: warehouseItem.productName || '',
          brand: warehouseItem.brand || '',
          category: warehouseItem.category || '',
          type: 'out',
          quantity: requestedQuantity,
          unitPrice:
            Number(warehouseItem.unitPrice) || 0,
          reason: 'تأیید درخواست گارانتی',
          description: `کسر موجودی به دلیل تأیید درخواست گارانتی با کد پیگیری ${currentWarranty.trackingCode || currentWarranty.id}`,
          createdAt: now,
        });

        warehouse.updatedAt = now;

        const warehouseSaved =
          writeRepresentativeWarehouses(
            warehouses,
          );

        if (!warehouseSaved) {
          throw new Error(
            'به‌روزرسانی موجودی انبار ناموفق بود.',
          );
        }
      }

      let updatedWarranty = {
        ...currentWarranty,
        status: decision,
        adminNote,
        decidedAt: now,
        decidedBy: adminName,

        stockDeductedAt:
          decision === 'approved' ? now : null,

        stockDeductedBy:
          decision === 'approved' ? adminName : '',

        smsStatus:
          decision === 'approved'
            ? 'sending'
            : 'not_sent',

        smsSentAt: null,
        smsError: '',
        smsResponse: null,

        updatedAt: now,
      };

      warranties[warrantyIndex] = updatedWarranty;

      const warrantySaved = writeWarranties(
        warranties,
      );

      if (!warrantySaved) {
        throw new Error(
          'ذخیره تصمیم ادمین ناموفق بود.',
        );
      }

      if (decision === 'approved') {
        const smsResult =
          await sendWarrantyApprovedSms({
            customerName:
              updatedWarranty.customerName,
            customerPhone:
              updatedWarranty.customerPhone,
            productName:
              updatedWarranty.productName,
            trackingCode:
              updatedWarranty.trackingCode ||
              updatedWarranty.id,
            approvedAt: now,
          });

        updatedWarranty = {
          ...updatedWarranty,

          smsStatus: smsResult.success
            ? 'sent'
            : smsResult.skipped
              ? 'skipped'
              : 'failed',

          smsSentAt: smsResult.success
            ? new Date().toISOString()
            : null,

          smsError: smsResult.success
            ? ''
            : smsResult.reason ||
              'ارسال پیامک ناموفق بود.',

          smsResponse: smsResult.result || null,

          updatedAt: new Date().toISOString(),
        };

        warranties[warrantyIndex] = updatedWarranty;

        const smsSaved = writeWarranties(warranties);

        if (!smsSaved) {
          console.error(
            'خطا در ذخیره وضعیت پیامک گارانتی.',
          );
        }
      }

      return res.json({
        success: true,

        message:
          decision === 'approved'
            ? updatedWarranty.smsStatus === 'sent'
              ? 'درخواست گارانتی تأیید شد، موجودی انبار کاهش یافت و پیامک برای مشتری ارسال شد.'
              : 'درخواست گارانتی تأیید شد و موجودی انبار کاهش یافت. ارسال پیامک ناموفق بود یا انجام نشد.'
            : 'درخواست گارانتی رد شد و موجودی انبار تغییری نکرد.',

        data: {
          warranty: updatedWarranty,
          warehouseItem: updatedWarehouseItem,
        },
      });
    } catch (error) {
      console.error(
        'خطا در تصمیم‌گیری درخواست گارانتی:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در بررسی درخواست گارانتی.',
      });
    }
  },
);

module.exports = router;
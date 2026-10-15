const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');


const { sendSms } = require('../helpers/sms');


const router = express.Router();


const DATA_DIR = path.join(__dirname, '..', 'data');
const SHIPMENTS_FILE = path.join(DATA_DIR, 'shipments.json');
const REPRESENTATIVES_FILE = path.join(
  DATA_DIR,
  'representatives.json',
);


const JWT_SECRET =
  process.env.JWT_SECRET ||
  'company-panel-secret-change-this-in-production';


const STATUSES = [
  'registered',
  'confirmed',
  'preparing',
  'loading',
  'shipping',
  'delivered',
];


const STATUS_LABELS = {
  registered: 'ثبت شده',
  confirmed: 'تأیید شده',
  preparing: 'در حال آماده‌سازی',
  loading: 'بارگیری',
  shipping: 'در حال ارسال',
  delivered: 'تحویل شده',
};


const MAX_ITEMS = 5000;


// شمارهٔ تست: اگر phone نماینده نبود، به این شماره پیامک می‌رود
const TEST_PHONE_NUMBER =
  process.env.TEST_PHONE_NUMBER ||
  '09926225828';


function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }


  const content = fs.readFileSync(filePath, 'utf8');


  if (!content.trim()) {
    return [];
  }


  const data = JSON.parse(content);


  if (!Array.isArray(data)) {
    throw new Error(
      `محتوای ${filePath} باید آرایه باشد.`,
    );
  }


  return data;
}


function writeJsonArray(filePath, data) {
  let tempPath = '';


  try {
    fs.mkdirSync(path.dirname(filePath), {
      recursive: true,
    });


    tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;


    fs.writeFileSync(
      tempPath,
      JSON.stringify(data, null, 2),
      'utf8',
    );


    fs.renameSync(tempPath, filePath);


    return true;
  } catch (error) {
    console.error(
      `خطا در ذخیره فایل ${filePath}:`,
      error,
    );


    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        console.error(
          'خطا در حذف فایل موقت:',
          cleanupError,
        );
      }
    }


    return false;
  }
}


function normalizeDigits(value) {
  return String(value ?? '')
    .trim()
    .replace(/[۰-۹]/g, (digit) =>
      String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)),
    )
    .replace(/[٠-٩]/g, (digit) =>
      String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)),
    );
}


function cleanText(value) {
  return String(value ?? '').trim();
}


function sameValue(first, second) {
  const a = normalizeDigits(first);
  const b = normalizeDigits(second);


  return Boolean(a && b && a === b);
}


function parseNonNegativeNumber(value) {
  const raw = normalizeDigits(value)
    .replace(/[,٬،\s]/g, '');


  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) {
    return null;
  }


  const parsed = Number(raw);


  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
}


function normalizeJalaliDate(value) {
  const digits = normalizeDigits(value).replace(/\D/g, '');


  if (digits.length !== 8) {
    return '';
  }


  return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
}


function isValidJalaliDate(value) {
  const match = String(value).match(
    /^(1[34]\d{2})\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])$/,
  );


  if (!match) {
    return false;
  }


  const month = Number(match[2]);
  const day = Number(match[3]);


  if (month >= 7 && month <= 11 && day > 30) {
    return false;
  }


  if (month === 12 && day > 30) {
    return false;
  }


  return true;
}


function getTodayJalali() {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());


  const values = {};


  for (const part of parts) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day'
    ) {
      values[part.type] = part.value;
    }
  }


  const year = String(values.year || '');
  const month = String(values.month || '').padStart(2, '0');
  const day = String(values.day || '').padStart(2, '0');


  return `${year}/${month}/${day}`;
}


function createRandomId() {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}


function readShipments() {
  return readJsonArray(SHIPMENTS_FILE);
}


function writeShipments(shipments) {
  return writeJsonArray(SHIPMENTS_FILE, shipments);
}


function readRepresentatives() {
  return readJsonArray(REPRESENTATIVES_FILE);
}


function requireRole(role) {
  return (req, res, next) => {
    const authorization = String(
      req.headers.authorization || '',
    );


    const match = authorization.match(/^Bearer\s+(.+)$/i);


    if (!match) {
      return res.status(401).json({
        success: false,
        error: 'ابتدا وارد حساب کاربری شوید.',
      });
    }


    try {
      const payload = jwt.verify(match[1], JWT_SECRET);


      if (!payload || typeof payload !== 'object') {
        return res.status(401).json({
          success: false,
          error: 'نشست نامعتبر است.',
        });
      }


      if (payload.role !== role) {
        return res.status(403).json({
          success: false,
          error:
            role === 'admin'
              ? 'این بخش فقط برای ادمین است.'
              : 'این بخش فقط برای نماینده است.',
        });
      }


      if (role === 'representative') {
        const representativeId = normalizeDigits(
          payload.representativeId,
        );


        if (!representativeId) {
          return res.status(401).json({
            success: false,
            error: 'شناسهٔ نماینده در نشست پیدا نشد.',
          });
        }


        req.representativeId = representativeId;
      }


      req.authUser = payload;


      return next();
    } catch {
      return res.status(401).json({
        success: false,
        error:
          'نشست شما منقضی یا نامعتبر است؛ دوباره وارد شوید.',
      });
    }
  };
}


function statusEvent(status, note = '') {
  return {
    status,
    label: STATUS_LABELS[status],
    changedAt: new Date().toISOString(),
    changedBy: 'admin',
    note,
  };
}


function normalizeItem(rawItem, index) {
  const productName = cleanText(
    rawItem?.productName ?? rawItem?.name,
  );


  const brand = cleanText(rawItem?.brand);
  const category = cleanText(rawItem?.category);


  const quantity = parseNonNegativeNumber(rawItem?.quantity);


  const unitPrice = parseNonNegativeNumber(
    rawItem?.unitPrice ?? 0,
  );


  const rowIndex = Number.isSafeInteger(Number(rawItem?.rowIndex))
    ? Number(rawItem.rowIndex)
    : index + 2;


  if (!productName) {
    throw new Error(
      `نام کالا در ردیف ${rowIndex} خالی است.`,
    );
  }


  if (
    quantity === null ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    throw new Error(
      `تعداد کالای «${productName}» در ردیف ${rowIndex} معتبر نیست.`,
    );
  }


  if (
    unitPrice === null ||
    !Number.isSafeInteger(unitPrice)
  ) {
    throw new Error(
      `قیمت کالای «${productName}» در ردیف ${rowIndex} معتبر نیست.`,
    );
  }


  const totalPrice = quantity * unitPrice;


  if (!Number.isSafeInteger(totalPrice)) {
    throw new Error(
      `ارزش کالای «${productName}» بیش از حد مجاز است.`,
    );
  }


  return {
    id: createRandomId(),
    productName,
    brand,
    category,
    quantity,
    unitPrice,
    totalPrice,
    rowIndex,
  };
}


function fillShipmentRepresentative(
  shipment,
  representatives,
) {
  const representative = representatives.find((item) =>
    sameValue(item.id, shipment.representativeId),
  );


  if (!representative) {
    return shipment;
  }


  return {
    ...shipment,
    representativeName:
      cleanText(representative.name) ||
      cleanText(shipment.representativeName),
    representativeCode:
      cleanText(representative.code) ||
      cleanText(shipment.representativeCode),
    representativeCity:
      cleanText(representative.city) ||
      cleanText(shipment.representativeCity),
  };
}


/*
 * GET /api/shipments/my
 * دریافت بارهای نمایندهٔ واردشده.
 */
router.get('/my', requireRole('representative'), (req, res) => {
  try {
    const representatives = readRepresentatives();


    const representative = representatives.find((item) =>
      sameValue(item.id, req.representativeId),
    );


    if (!representative) {
      return res.status(404).json({
        success: false,
        error: 'نماینده پیدا نشد.',
      });
    }


    if (representative.status === 'inactive') {
      return res.status(403).json({
        success: false,
        error: 'حساب نماینده غیرفعال است.',
      });
    }


    const myShipments = readShipments()
      .filter((shipment) =>
        sameValue(shipment.representativeId, representative.id),
      )
      .map((shipment) =>
        fillShipmentRepresentative(shipment, representatives),
      )
      .sort(
        (first, second) =>
          new Date(second.createdAt || 0).getTime() -
          new Date(first.createdAt || 0).getTime(),
      );


    return res.status(200).json({
      success: true,
      count: myShipments.length,
      data: myShipments,
    });
  } catch (error) {
    console.error('خطا در دریافت بارهای نماینده:', error);


    return res.status(500).json({
      success: false,
      error: 'دریافت بارهای نماینده ناموفق بود.',
    });
  }
});


/*
 * GET /api/shipments
 * دریافت تمام بارها فقط برای ادمین.
 */
router.get('/', requireRole('admin'), (_req, res) => {
  try {
    const representatives = readRepresentatives();


    const shipments = readShipments()
      .map((shipment) =>
        fillShipmentRepresentative(shipment, representatives),
      )
      .sort(
        (first, second) =>
          new Date(second.createdAt || 0).getTime() -
          new Date(first.createdAt || 0).getTime(),
      );


    return res.status(200).json({
      success: true,
      count: shipments.length,
      data: shipments,
    });
  } catch (error) {
    console.error('خطا در دریافت بارها:', error);


    return res.status(500).json({
      success: false,
      error: 'خطا در دریافت بارها.',
    });
  }
});


/*
 * POST /api/shipments
 * ثبت بار توسط ادمین.
 */
router.post('/', requireRole('admin'), (req, res) => {
  try {
    const warehouse =
      cleanText(req.body?.warehouse) ||
      'انبار مرکزی';


    const representativeId = normalizeDigits(
      req.body?.representativeId,
    );


    const excelFileName = cleanText(req.body?.excelFileName);


    if (!representativeId) {
      return res.status(400).json({
        success: false,
        error: 'نماینده را انتخاب کنید.',
      });
    }


    // اگه فایل اکسل وجود نداشت، یه نام پیش‌فرض می‌ذاریم
    // تا ثبت بار بدون اکسل هم ممکن باشه
    const finalExcelFileName =
      excelFileName ||
      `manual-${Date.now()}.xlsx`;


    if (
      !Array.isArray(req.body?.items) ||
      req.body.items.length === 0
    ) {
      // اگه آیتم‌ها وجود نداشت، یه آیتم پیش‌فرض می‌سازیم
      // تا کاربر بتونه بدون اکسل هم بار ثبت کنه
      req.body.items = [
        {
          productName: 'بار دستی',
          brand: '',
          category: '',
          quantity: 1,
          unitPrice: 0,
          rowIndex: 1,
        },
      ];
    }


    if (req.body.items.length > MAX_ITEMS) {
      return res.status(400).json({
        success: false,
        error: 'فایل باید بین ۱ تا ۵۰۰۰ ردیف کالا داشته باشد.',
      });
    }


    const representatives = readRepresentatives();


    const representative = representatives.find((item) =>
      sameValue(item.id, representativeId),
    );


    if (!representative) {
      return res.status(400).json({
        success: false,
        error: `نماینده با شناسه «${representativeId}» پیدا نشد.`,
      });
    }


    if (representative.status === 'inactive') {
      return res.status(400).json({
        success: false,
        error:
          'این نماینده غیرفعال است و نمی‌توان برای او بار ثبت کرد.',
      });
    }


    const receiver = cleanText(representative.name);


    if (!receiver) {
      return res.status(400).json({
        success: false,
        error:
          'نام نماینده کامل نیست؛ ابتدا اطلاعات نماینده را اصلاح کنید.',
      });
    }


    let items;


    try {
      items = req.body.items.map(normalizeItem);
    } catch (validationError) {
      return res.status(400).json({
        success: false,
        error: validationError.message,
      });
    }


    const totalItems = items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );


    const totalValue = items.reduce(
      (sum, item) => sum + item.totalPrice,
      0,
    );


    if (
      !Number.isSafeInteger(totalItems) ||
      !Number.isSafeInteger(totalValue)
    ) {
      return res.status(400).json({
        success: false,
        error: 'جمع تعداد یا مبلغ از محدودهٔ مجاز خارج است.',
      });
    }


    const shipmentDate = getTodayJalali();


    if (!isValidJalaliDate(shipmentDate)) {
      return res.status(500).json({
        success: false,
        error: 'تاریخ خودکار سرور معتبر نیست.',
      });
    }


    const shipments = readShipments();
    const id = createRandomId();
    const now = new Date().toISOString();


    const newShipment = {
      id,
      shipmentNumber: `SHP-${id}`,
      representativeId: cleanText(representative.id),
      representativeName: receiver,
      representativeCode: cleanText(representative.code),
      representativeCity: cleanText(representative.city),
      receiver,
      warehouse,
      shipmentDate,
      excelFileName: finalExcelFileName,
      items,
      itemsCount: items.length,
      totalItems,
      totalValue,
      status: 'registered',
      statusHistory: [
        statusEvent('registered', 'بار با فایل اکسل ثبت شد.'),
      ],
      sms: {
        lastStatus: null,
        lastSentAt: null,
        lastError: null,
      },
      createdAt: now,
      updatedAt: now,
    };


    if (!writeShipments([newShipment, ...shipments])) {
      return res.status(500).json({
        success: false,
        error: 'ثبت بار در فایل ذخیره‌سازی ناموفق بود.',
      });
    }


    return res.status(201).json({
      success: true,
      message: 'بار با موفقیت ثبت شد.',
      data: newShipment,
    });
  } catch (error) {
    console.error('خطا در ثبت بار:', error);


    return res.status(500).json({
      success: false,
      error: 'خطا در ثبت بار.',
    });
  }
});


/*
 * PATCH /api/shipments/:id/status
 * فقط ادمین.
 * تغییر وضعیت + ارسال SMS با الگوی {0}، {1}، {2}
 */
router.patch('/:id/status', requireRole('admin'), async (req, res) => {
  try {
    const nextStatus = cleanText(req.body?.status);


    if (!STATUSES.includes(nextStatus)) {
      return res.status(400).json({
        success: false,
        error: 'وضعیت انتخاب‌شده معتبر نیست.',
      });
    }


    const shipments = readShipments();


    const index = shipments.findIndex((shipment) =>
      sameValue(shipment.id, req.params.id),
    );


    if (index < 0) {
      return res.status(404).json({
        success: false,
        error: `بار با شناسه «${req.params.id}» پیدا نشد.`,
      });
    }


    const current = shipments[index];


    if (current.status === nextStatus) {
      // اگه وضعیت همون باشه، ارور نده - به‌جاش یه پیام موفقیت بده
      return res.status(200).json({
        success: true,
        message: `بار در حال حاضر در وضعیت «${STATUS_LABELS[nextStatus] || nextStatus}» است.`,
        data: current,
        sms: { sent: false, message: 'پیامک ارسال نشد (وضعیت تغییر نکرد).' },
      });
    }


    const updated = {
      ...current,
      status: nextStatus,
      statusHistory: [
        ...(Array.isArray(current.statusHistory)
          ? current.statusHistory
          : []),
        statusEvent(
          nextStatus,
          'وضعیت توسط ادمین تغییر کرد.',
        ),
      ],
      updatedAt: new Date().toISOString(),
    };


    const nextShipments = [...shipments];
    nextShipments[index] = updated;


    if (!writeShipments(nextShipments)) {
      return res.status(500).json({
        success: false,
        error: 'تغییر وضعیت در فایل ذخیره نشد.',
      });
    }


    // ---------- ارسال SMS با الگو ----------
    const statusLabel = STATUS_LABELS[nextStatus] || nextStatus;


    // خواندن نام و شماره نماینده از representatives.json
    const representatives = readRepresentatives();


    const representative = representatives.find((item) =>
      sameValue(item.id, updated.representativeId),
    );


    const representativeName =
      cleanText(representative?.name) || 'مشتری';


    const representativePhone =
      normalizeDigits(representative?.phone) || TEST_PHONE_NUMBER;


    // 🔻🔻 تغییر اینجا انجام شده — شمارهٔ طولانی بار کوتاه شده 🔻🔻
    // فقط ۸ کاراکتر آخر آی‌دی بره (مثل ABC12345) — کوتاه + قابل رهگیری.
    const fullRef =
      cleanText(updated.shipmentNumber) ||
      cleanText(updated.id) ||
      '';


    const shortRef = fullRef
      ? fullRef.slice(-8).toUpperCase()
      : '—';
    // 🔺🔺 پایان تغییر 🔺🔺


    // ارسال به‌صورت آرایه برای الگوی {0}، {1}، {2}
    // {0} = نام نماینده
    // {1} = شناسهٔ کوتاه بار (به جای شمارهٔ طولانی قبلی)
    // {2} = وضعیت بار
    const smsResult = await sendSms(representativePhone, [
      representativeName,
      shortRef,
      statusLabel,
    ]);


    const smsInfo = {
      sent: !!smsResult?.success,
      message: smsResult?.success
        ? 'پیامک با موفقیت ارسال شد.'
        : smsResult?.error || 'ارسال پیامک ناموفق بود.',
    };
    // ----------------------------------------------------


    return res.status(200).json({
      success: true,
      message: `وضعیت بار به «${statusLabel}» تغییر کرد.`,
      data: updated,
      sms: smsInfo,
    });
  } catch (error) {
    console.error('خطا در تغییر وضعیت بار:', error);


    return res.status(500).json({
      success: false,
      error: 'خطا در تغییر وضعیت بار.',
    });
  }
});


/*
 * DELETE /api/shipments/:id
 * فقط ادمین؛ بار در هر وضعیتی قابل حذف است.
 */
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const shipments = readShipments();


    const index = shipments.findIndex((shipment) =>
      sameValue(shipment.id, req.params.id),
    );


    if (index < 0) {
      return res.status(404).json({
        success: false,
        error: `بار با شناسه «${req.params.id}» پیدا نشد.`,
      });
    }


    const shipment = shipments[index];


    const remaining = shipments.filter(
      (_, itemIndex) => itemIndex !== index,
    );


    if (!writeShipments(remaining)) {
      return res.status(500).json({
        success: false,
        error: 'حذف بار ناموفق بود.',
      });
    }


    return res.status(200).json({
      success: true,
      message: `بار «${
        shipment.shipmentNumber || shipment.id
      }» حذف شد.`,
    });
  } catch (error) {
    console.error('خطا در حذف بار:', error);


    return res.status(500).json({
      success: false,
      error: 'خطا در حذف بار.',
    });
  }
});


module.exports = router;
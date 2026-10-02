const express = require('express');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');


const router = express.Router();


const DATA_DIR = path.join(__dirname, '..', 'data');


const REPRESENTATIVES_FILE = path.join(
  DATA_DIR,
  'representatives.json',
);


const REPRESENTATIVE_WAREHOUSES_FILE = path.join(
  DATA_DIR,
  'representativeWarehouses.json',
);


const SALES_REPORTS_FILE = path.join(
  DATA_DIR,
  'salesReports.json',
);


const JWT_SECRET =
  process.env.JWT_SECRET ||
  'company-panel-secret-change-this-in-production';


/*
  محدودیت اعلام فروش (شمسی):

  - نماینده فقط در روزهای 10، 20 و 30 هر ماه شمسی می‌تواند اعلام فروش ثبت کند.
  - در روز مجاز، هر تعداد ثبت مجاز است (بدون محدودیت تعداد در همان روز).
*/

const ALLOWED_SALE_DAYS = [10, 20, 30];


// =========================
// File helpers
// =========================

const ensureDataFiles = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true,
    });
  }


  const files = [
    REPRESENTATIVES_FILE,
    REPRESENTATIVE_WAREHOUSES_FILE,
    SALES_REPORTS_FILE,
  ];


  files.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        JSON.stringify([], null, 2),
        'utf8',
      );
    }
  });
};


const readJsonFile = (filePath, fallback = []) => {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }


    const rawData = fs.readFileSync(filePath, 'utf8');


    if (!rawData.trim()) {
      return fallback;
    }


    const data = JSON.parse(rawData);


    return Array.isArray(data) ? data : fallback;
  } catch (error) {
    console.error(
      `خطا در خواندن فایل ${filePath}:`,
      error,
    );


    return fallback;
  }
};


const writeJsonFile = (filePath, data) => {
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify(data || [], null, 2),
      'utf8',
    );


    return true;
  } catch (error) {
    console.error(
      `خطا در ذخیره فایل ${filePath}:`,
      error,
    );


    return false;
  }
};


const readRepresentatives = () => {
  return readJsonFile(REPRESENTATIVES_FILE, []);
};


const writeRepresentatives = (representatives) => {
  return writeJsonFile(
    REPRESENTATIVES_FILE,
    representatives,
  );
};


const readRepresentativeWarehouses = () => {
  return readJsonFile(
    REPRESENTATIVE_WAREHOUSES_FILE,
    [],
  );
};


const writeRepresentativeWarehouses = (warehouses) => {
  return writeJsonFile(
    REPRESENTATIVE_WAREHOUSES_FILE,
    warehouses,
  );
};


const readSalesReports = () => {
  return readJsonFile(SALES_REPORTS_FILE, []);
};


const writeSalesReports = (reports) => {
  return writeJsonFile(SALES_REPORTS_FILE, reports);
};


// =========================
// Value helpers
// =========================

const toEnglishDigits = (value) => {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => {
      return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit));
    })
    .replace(/[٠-٩]/g, (digit) => {
      return String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
    });
};


const normalizeValue = (value) => {
  return toEnglishDigits(value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};


const sameValue = (firstValue, secondValue) => {
  const first = normalizeValue(firstValue);
  const second = normalizeValue(secondValue);


  return Boolean(first && second && first === second);
};


const toNumber = (value) => {
  const normalized = toEnglishDigits(value)
    .replace(/[,٬،\s]/g, '')
    .replace(/[^\d.-]/g, '');


  const result = Number(normalized);


  return Number.isFinite(result) ? result : 0;
};


const getPositiveNumber = (value) => {
  const result = toNumber(value);


  return result > 0 ? result : 0;
};


const cleanText = (value, fallback = '') => {
  const result = String(value ?? '').trim();


  return result || fallback;
};


const createRandomId = () => {
  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
};


const getWarehouseItemStatus = (
  quantity,
  minimumStock,
) => {
  const safeQuantity = toNumber(quantity);
  const safeMinimumStock = toNumber(minimumStock);


  if (safeQuantity <= 0) {
    return 'out';
  }


  if (safeQuantity <= safeMinimumStock) {
    return 'low';
  }


  return 'normal';
};


const getCreatedAtTime = (value) => {
  const date = new Date(value);
  const time = date.getTime();


  return Number.isNaN(time) ? 0 : time;
};


const formatPersianDateTime = (value) => {
  if (!value) {
    return '—';
  }


  const date = new Date(value);


  if (Number.isNaN(date.getTime())) {
    return '—';
  }


  return new Intl.DateTimeFormat(
    'fa-IR-u-ca-persian',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(date);
};


// =========================
// Period helpers
// فقط روزهای 10، 20، 30 شمسی
// =========================

const getJalaliDate = (value = new Date()) => {
  const date = new Date(value);


  const parts = new Intl.DateTimeFormat(
    'fa-IR-u-ca-persian',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  ).formatToParts(date);


  const values = {};


  for (const part of parts) {
    if (
      part.type === 'year' ||
      part.type === 'month' ||
      part.type === 'day'
    ) {
      values[part.type] = toEnglishDigits(part.value);
    }
  }


  return {
    year: Number(values.year || 0),
    month: Number(values.month || 0),
    day: Number(values.day || 0),
  };
};


const formatJalaliDate = (jalaliDate) => {
  const year = String(jalaliDate?.year || 0)
    .padStart(4, '0');
  const month = String(jalaliDate?.month || 0)
    .padStart(2, '0');
  const day = String(jalaliDate?.day || 0)
    .padStart(2, '0');


  return `${year}/${month}/${day}`;
};


/*
  تاریخ واقعیِ میلادیِ روز مجاز بعدی را پیدا می‌کند.

  نکته مهم:
  این تابع هیچ تبدیل تقریبی انجام نمی‌دهد.
  از امروز، روزبه‌روز جلو می‌رود و تاریخ هر روز را با
  تقویم رسمی شمسی Intl بررسی می‌کند.

  بنابراین برای مهر، آبان، اسفند و سال کبیسه هم درست است.
*/
const getNextAllowedSaleDate = (startDate = new Date()) => {
  const candidate = new Date(startDate);

  candidate.setHours(0, 0, 0, 0);


  /*
    حداکثر 40 روز کافی است، اما 70 روز گذاشته شده تا
    تغییر ماه، پایان سال و شرایط خاص هم بدون مشکل پوشش داده شود.
  */
  for (let offsetDays = 0; offsetDays <= 70; offsetDays += 1) {
    const jalali = getJalaliDate(candidate);


    if (ALLOWED_SALE_DAYS.includes(jalali.day)) {
      return {
        date: new Date(candidate),
        jalali,
        jalaliFormatted: formatJalaliDate(jalali),
        offsetDays,
      };
    }


    candidate.setDate(candidate.getDate() + 1);
  }


  throw new Error(
    'تاریخ مجاز بعدی برای ثبت فروش پیدا نشد.',
  );
};


/*
  بررسی می‌کند که آیا امروز واقعاً یکی از روزهای
  10، 20 یا 30 در تقویم شمسی است یا نه.
*/
const isTodayAllowedDay = () => {
  const jalali = getJalaliDate();

  return ALLOWED_SALE_DAYS.includes(jalali.day);
};


/*
  وضعیت مجاز بودن نماینده برای ثبت اعلام فروش:

  - فقط روزهای 10، 20 و 30 شمسی مجاز است.
  - در روز مجاز، هر تعداد ثبت فروش مجاز است.
  - nextAllowedAt با تاریخ واقعی محاسبه می‌شود؛
    نه با روز/ماه میلادی و نه با فرض 30 روزه بودن ماه شمسی.
*/
const getRepresentativeSalesPeriodStatus = (
  representativeId,
) => {
  const now = new Date();
  const jalali = getJalaliDate(now);
  const allowed = ALLOWED_SALE_DAYS.includes(jalali.day);

  /*
    در روز مجاز، تاریخ بعدی را امروز نگه می‌داریم.
    در روز غیرمجاز، اولین روز واقعیِ 10/20/30 شمسی بعدی
    محاسبه می‌شود.
  */
  const nextAllowedSale = getNextAllowedSaleDate(now);

  return {
    representativeId: String(representativeId || ''),
    allowed,
    registeredReport: null,


    allowedDays: ALLOWED_SALE_DAYS,


    todayJalali: formatJalaliDate(jalali),
    todayJalaliYear: jalali.year,
    todayJalaliMonth: jalali.month,
    todayJalaliDay: jalali.day,


    periodStart: now.toISOString(),
    periodEnd: now.toISOString(),


    /*
      در روز مجاز null است، چون فروش همین الان مجاز است.
    */
    nextAllowedAt: allowed
      ? null
      : nextAllowedSale.date.toISOString(),


    periodStartFa: formatPersianDateTime(now),
    periodEndFa: formatPersianDateTime(now),


    /*
      نمونه خروجی درست:
      1405/07/10
      نه یک تاریخ تقریبی میلادی.
    */
    nextAllowedAtFa: allowed
      ? null
      : nextAllowedSale.jalaliFormatted,


    nextAllowedJalali: allowed
      ? null
      : {
          year: nextAllowedSale.jalali.year,
          month: nextAllowedSale.jalali.month,
          day: nextAllowedSale.jalali.day,
          formatted: nextAllowedSale.jalaliFormatted,
        },


    daysUntilNextAllowed: allowed
      ? 0
      : nextAllowedSale.offsetDays,


    periodStartDay: jalali.day,
    periodEndDay: jalali.day,


    periodKey: `${jalali.year}-${String(
      jalali.month,
    ).padStart(2, '0')}-${String(jalali.day).padStart(
      2,
      '0',
    )}`,
  };
};


const normalizeReportItem = (item) => {
  const quantity = getPositiveNumber(item?.quantity);


  const unitPrice = toNumber(item?.unitPrice);


  const savedTotalPrice = toNumber(
    item?.totalPrice ?? item?.totalAmount,
  );


  return {
    productId: String(
      item?.productId || item?.id || '',
    ),


    productName: cleanText(
      item?.productName ||
        item?.name ||
        item?.title,
      'کالای بدون نام',
    ),


    quantity,


    unitPrice,


    totalPrice:
      savedTotalPrice > 0
        ? savedTotalPrice
        : quantity * unitPrice,
  };
};


const normalizeSalesReport = (report) => {
  const rawItems = Array.isArray(report?.items)
    ? report.items
    : [];


  const items = rawItems
    .map((item) => {
      return normalizeReportItem(item);
    })
    .filter((item) => {
      return Boolean(
        item.productId || item.productName,
      );
    });


  const calculatedTotalItems = items.reduce(
    (total, item) => {
      return total + item.quantity;
    },
    0,
  );


  const calculatedTotalAmount = items.reduce(
    (total, item) => {
      return total + item.totalPrice;
    },
    0,
  );


  return {
    ...report,


    id: String(report?.id || ''),


    representativeId: String(
      report?.representativeId || '',
    ),


    representativeCode: cleanText(
      report?.representativeCode,
    ),


    representativeName: cleanText(
      report?.representativeName,
      'نماینده',
    ),


    representativeCity: cleanText(
      report?.representativeCity,
    ),


    itemsCount:
      toNumber(report?.itemsCount) > 0
        ? toNumber(report?.itemsCount)
        : items.length,


    totalItems:
      toNumber(report?.totalItems) > 0
        ? toNumber(report?.totalItems)
        : calculatedTotalItems,


    totalAmount:
      toNumber(report?.totalAmount) > 0
        ? toNumber(report?.totalAmount)
        : calculatedTotalAmount,


    items,


    createdAt: report?.createdAt || '',


    updatedAt: report?.updatedAt || '',
  };
};


// =========================
// Authentication helpers
// =========================

const authenticateToken = (req, res, next) => {
  const authorizationHeader = String(
    req.headers.authorization || '',
  );


  const token = authorizationHeader.startsWith('Bearer ')
    ? authorizationHeader.slice(7).trim()
    : '';


  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'لطفاً ابتدا وارد حساب کاربری شوید.',
    });
  }


  try {
    req.user = jwt.verify(token, JWT_SECRET);


    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'توکن ورود نامعتبر یا منقضی شده است.',
    });
  }
};


const requireRepresentative = (req, res, next) => {
  if (req.user?.role !== 'representative') {
    return res.status(403).json({
      success: false,
      error:
        'این بخش فقط برای نماینده قابل دسترسی است.',
    });
  }


  return next();
};


const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error:
        'این بخش فقط برای ادمین قابل دسترسی است.',
    });
  }


  return next();
};


// =========================
// Warehouse summary helper
// =========================

const updateRepresentativeWarehouseSummary = (
  representativeId,
  warehouse,
) => {
  const representatives = readRepresentatives();


  const representativeIndex = representatives.findIndex(
    (representative) => {
      return sameValue(
        representative.id,
        representativeId,
      );
    },
  );


  if (representativeIndex === -1) {
    return false;
  }


  const items = Array.isArray(warehouse.items)
    ? warehouse.items
    : [];


  const storeItemsCount = items.reduce(
    (total, item) => {
      return total + toNumber(item.quantity);
    },
    0,
  );


  const storeItemsTotalValue = items.reduce(
    (total, item) => {
      return total + toNumber(item.totalPrice);
    },
    0,
  );


  representatives[representativeIndex] = {
    ...representatives[representativeIndex],


    storeItemsCount,


    storeItemsTotalValue,


    updatedAt: new Date().toISOString(),
  };


  return writeRepresentatives(representatives);
};


ensureDataFiles();


// =====================================================
// GET /api/sales-from-warehouse/sale-schedule
//
// وضعیت دقیق فروش با تاریخ شمسی واقعی.
// =====================================================

router.get(
  '/sale-schedule',
  authenticateToken,
  requireRepresentative,
  (req, res) => {
    try {
      const representativeId = String(
        req.user.representativeId ||
          req.user.id ||
          '',
      ).trim();


      const salesPeriod =
        getRepresentativeSalesPeriodStatus(
          representativeId,
        );


      return res.json({
        success: true,
        data: salesPeriod,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت وضعیت زمان مجاز فروش:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در بررسی زمان مجاز فروش.',
      });
    }
  },
);


// =====================================================
// GET /api/sales-from-warehouse/products
// =====================================================

router.get(
  '/products',
  authenticateToken,
  requireRepresentative,
  (req, res) => {
    try {
      const representativeId = String(
        req.user.representativeId ||
          req.user.id ||
          '',
      ).trim();


      const warehouses =
        readRepresentativeWarehouses();


      const warehouse = warehouses.find((item) => {
        return sameValue(
          item.representativeId,
          representativeId,
        );
      });


      const items = Array.isArray(warehouse?.items)
        ? warehouse.items
        : [];


      const availableItems = items
        .filter((item) => {
          return toNumber(item.quantity) > 0;
        })
        .map((item) => {
          return {
            id: String(item.id || item.productId || ''),


            productId: String(
              item.productId || item.id || '',
            ),


            productName: cleanText(
              item.productName,
              'کالای بدون نام',
            ),


            quantity: toNumber(item.quantity),


            unitPrice: toNumber(item.unitPrice),


            totalPrice: toNumber(item.totalPrice),


            minimumStock: toNumber(
              item.minimumStock,
            ),


            status: item.status || 'normal',


            lastUpdated: item.lastUpdated || '',
          };
        });


      const salesPeriod =
        getRepresentativeSalesPeriodStatus(
          representativeId,
        );


      return res.json({
        success: true,


        count: availableItems.length,


        data: availableItems,


        salesPeriod,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت کالاهای قابل فروش:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در دریافت کالاهای قابل فروش.',
      });
    }
  },
);


// =====================================================
// POST /api/sales-from-warehouse
//
// هر نماینده فقط در روزهای 10، 20 و 30 شمسی مجاز است.
// در روز مجاز، هر تعداد ثبت مجاز است.
// =====================================================

router.post(
  '/',
  authenticateToken,
  requireRepresentative,
  (req, res) => {
    try {
      const representativeId = String(
        req.user.representativeId ||
          req.user.id ||
          '',
      ).trim();


      const salesPeriod =
        getRepresentativeSalesPeriodStatus(
          representativeId,
        );


      if (!salesPeriod.allowed) {
        return res.status(403).json({
          success: false,


          error:
            `امکان ثبت اعلام فروش فقط در روزهای 10، 20 و 30 ` +
            `هر ماه شمسی وجود دارد. ` +
            `امروز ${salesPeriod.todayJalali} است. ` +
            `نوبت بعدی فروش: ${salesPeriod.nextAllowedAtFa}.`,


          salesPeriod,
        });
      }


      const confirmedSale = Boolean(
        req.body?.confirmedSale,
      );


      const saleItems = Array.isArray(req.body?.items)
        ? req.body.items
        : [];


      if (!confirmedSale) {
        return res.status(400).json({
          success: false,
          error:
            'برای ثبت فروش باید تیک تأیید فروش را فعال کنید.',
        });
      }


      if (saleItems.length === 0) {
        return res.status(400).json({
          success: false,
          error:
            'حداقل یک کالا با تعداد فروش بیشتر از صفر انتخاب کنید.',
        });
      }


      const representatives = readRepresentatives();


      const representative = representatives.find(
        (item) => {
          return sameValue(
            item.id,
            representativeId,
          );
        },
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
          error: 'حساب این نماینده غیرفعال است.',
        });
      }


      const warehouses =
        readRepresentativeWarehouses();


      const warehouseIndex = warehouses.findIndex(
        (warehouse) => {
          return sameValue(
            warehouse.representativeId,
            representativeId,
          );
        },
      );


      if (warehouseIndex === -1) {
        return res.status(400).json({
          success: false,
          error: 'انبار اختصاصی نماینده پیدا نشد.',
        });
      }


      const warehouse = warehouses[warehouseIndex];


      warehouse.items = Array.isArray(warehouse.items)
        ? warehouse.items
        : [];


      warehouse.movements = Array.isArray(
        warehouse.movements,
      )
        ? warehouse.movements
        : [];


      const mergedSubmittedItems = new Map();


      saleItems.forEach((submittedItem) => {
        const productId = normalizeValue(
          submittedItem?.productId,
        );


        const quantity = getPositiveNumber(
          submittedItem?.quantity,
        );


        if (!productId || !quantity) {
          return;
        }


        const oldQuantity =
          mergedSubmittedItems.get(productId) || 0;


        mergedSubmittedItems.set(
          productId,
          oldQuantity + quantity,
        );
      });


      if (mergedSubmittedItems.size === 0) {
        return res.status(400).json({
          success: false,
          error:
            'حداقل یک کالای معتبر با تعداد فروش بیشتر از صفر وارد کنید.',
        });
      }


      const validatedItems = [];


      for (const [
        productId,
        saleQuantity,
      ] of mergedSubmittedItems) {
        const warehouseItemIndex =
          warehouse.items.findIndex((item) => {
            return sameValue(
              item.productId || item.id,
              productId,
            );
          });


        if (warehouseItemIndex === -1) {
          return res.status(400).json({
            success: false,
            error:
              'یکی از کالاهای انتخاب‌شده در انبار نماینده وجود ندارد.',
          });
        }


        const warehouseItem =
          warehouse.items[warehouseItemIndex];


        const availableQuantity = toNumber(
          warehouseItem.quantity,
        );


        if (saleQuantity > availableQuantity) {
          return res.status(400).json({
            success: false,
            error: `تعداد فروش کالای «${cleanText(
              warehouseItem.productName,
              'بدون نام',
            )}» بیشتر از موجودی انبار است.`,
          });
        }


        const unitPrice = toNumber(
          warehouseItem.unitPrice,
        );


        validatedItems.push({
          warehouseItemIndex,


          productId: String(
            warehouseItem.productId ||
              warehouseItem.id ||
              '',
          ),


          productName: cleanText(
            warehouseItem.productName,
            'کالای بدون نام',
          ),


          quantity: saleQuantity,


          unitPrice,


          totalPrice: saleQuantity * unitPrice,
        });
      }


      const now = new Date().toISOString();


      validatedItems.forEach((saleItem) => {
        const currentItem =
          warehouse.items[saleItem.warehouseItemIndex];


        const nextQuantity =
          toNumber(currentItem.quantity) -
          saleItem.quantity;


        warehouse.items[
          saleItem.warehouseItemIndex
        ] = {
          ...currentItem,


          quantity: nextQuantity,


          totalPrice:
            nextQuantity *
            toNumber(currentItem.unitPrice),


          status: getWarehouseItemStatus(
            nextQuantity,
            currentItem.minimumStock,
          ),


          lastUpdated: now,
        };


        warehouse.movements.unshift({
          id: createRandomId(),


          representativeId: String(
            representative.id,
          ),


          productId: saleItem.productId,


          productName: saleItem.productName,


          type: 'out',


          quantity: saleItem.quantity,


          unitPrice: saleItem.unitPrice,


          reason: 'فروش ثبت‌شده توسط نماینده',


          description:
            'کاهش موجودی به دلیل ثبت اعلام فروش نماینده',


          createdAt: now,
        });
      });


      warehouse.updatedAt = now;


      warehouses[warehouseIndex] = warehouse;


      const warehouseSaved =
        writeRepresentativeWarehouses(warehouses);


      if (!warehouseSaved) {
        return res.status(500).json({
          success: false,
          error:
            'خطا در به‌روزرسانی انبار نماینده.',
        });
      }


      const summaryUpdated =
        updateRepresentativeWarehouseSummary(
          representativeId,
          warehouse,
        );


      if (!summaryUpdated) {
        return res.status(500).json({
          success: false,
          error:
            'خطا در به‌روزرسانی مبلغ و تعداد اقلام انبار نماینده.',
        });
      }


      const totalItems = validatedItems.reduce(
        (total, item) => {
          return total + item.quantity;
        },
        0,
      );


      const totalAmount = validatedItems.reduce(
        (total, item) => {
          return total + item.totalPrice;
        },
        0,
      );


      const salesReports = readSalesReports();


      const newSalesReport = normalizeSalesReport({
        id: createRandomId(),


        representativeId: String(representative.id),


        representativeCode: cleanText(
          representative.code,
        ),


        representativeName: cleanText(
          representative.name,
          'نماینده',
        ),


        representativeCity: cleanText(
          representative.city,
        ),


        itemsCount: validatedItems.length,


        totalItems,


        totalAmount,


        saleDate: new Date().toLocaleDateString(
          'fa-IR-u-ca-persian',
        ),


        /*
          تاریخ شمسی عددی دقیق، برای گزارش و جست‌وجوی بعدی.
        */
        saleDateJalali: salesPeriod.todayJalali,


        confirmedSale: true,


        items: validatedItems.map((item) => {
          return {
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          };
        }),


        createdAt: now,


        updatedAt: now,
      });


      salesReports.unshift(newSalesReport);


      const reportSaved = writeSalesReports(
        salesReports,
      );


      if (!reportSaved) {
        return res.status(500).json({
          success: false,
          error: 'خطا در ذخیره اعلام فروش.',
        });
      }


      const updatedSalesPeriod =
        getRepresentativeSalesPeriodStatus(
          representativeId,
        );


      return res.status(201).json({
        success: true,


        message:
          'فروش با موفقیت ثبت شد و موجودی انبار به‌روزرسانی شد.',


        data: newSalesReport,


        warehouse: warehouse.items,


        salesPeriod: updatedSalesPeriod,
      });
    } catch (error) {
      console.error(
        'خطا در ثبت فروش از انبار:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در ثبت فروش از انبار.',
      });
    }
  },
);


// =====================================================
// GET /api/sales-from-warehouse/my
//
// تاریخچه فروش نماینده و وضعیت بازه فعلی.
// =====================================================

router.get(
  '/my',
  authenticateToken,
  requireRepresentative,
  (req, res) => {
    try {
      const representativeId = String(
        req.user.representativeId ||
          req.user.id ||
          '',
      ).trim();


      const reports = readSalesReports()
        .filter((report) => {
          return sameValue(
            report.representativeId,
            representativeId,
          );
        })
        .map((report) => {
          return normalizeSalesReport(report);
        })
        .sort((first, second) => {
          return (
            getCreatedAtTime(second.createdAt) -
            getCreatedAtTime(first.createdAt)
          );
        });


      const salesPeriod =
        getRepresentativeSalesPeriodStatus(
          representativeId,
        );


      return res.json({
        success: true,


        count: reports.length,


        data: reports,


        salesPeriod,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت تاریخچه فروش نماینده:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در دریافت تاریخچه فروش نماینده.',
      });
    }
  },
);


// =====================================================
// GET /api/sales-from-warehouse/admin/all
//
// همه اعلام فروش‌ها برای ادمین.
// =====================================================

router.get(
  '/admin/all',
  authenticateToken,
  requireAdmin,
  (req, res) => {
    try {
      const reports = readSalesReports()
        .map((report) => {
          return normalizeSalesReport(report);
        })
        .sort((first, second) => {
          return (
            getCreatedAtTime(second.createdAt) -
            getCreatedAtTime(first.createdAt)
          );
        });


      return res.json({
        success: true,
        count: reports.length,
        data: reports,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت گزارش فروش‌ها برای ادمین:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در دریافت گزارش فروش‌ها.',
      });
    }
  },
);


module.exports = router;
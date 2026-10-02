const express = require('express');
const jwt = require('jsonwebtoken');


const {
  readReturnRequests,
  writeReturnRequests,
  readRepresentatives,
} = require('../helpers/jsonStorage');


const {
  normalizeValue,
  toEnglishDigits,
  createRandomId,
} = require('../helpers/values');


const router = express.Router();


const JWT_SECRET =
  process.env.JWT_SECRET ||
  'company-panel-secret-change-this-in-production';


const RETURN_STATUSES = [
  'registered',
  'reviewing',
  'approved',
  'rejected',
  'received',
];


const RETURN_STATUS_LABELS = {
  registered: 'ثبت شده',
  reviewing: 'در حال بررسی',
  approved: 'تأیید شده',
  rejected: 'رد شده',
  received: 'دریافت شده',
};


function cleanText(value) {
  return String(value ?? '').trim();
}


function normalizeDigits(value) {
  return toEnglishDigits(value).trim();
}


function sameValue(first, second) {
  const a = normalizeValue(first);
  const b = normalizeValue(second);


  return Boolean(a && b && a === b);
}


function toPositiveInteger(value) {
  const normalized = normalizeDigits(value)
    .replace(/[^\d]/g, '');


  if (!/^[1-9]\d*$/.test(normalized)) {
    return null;
  }


  const number = Number(normalized);


  return Number.isSafeInteger(number) ? number : null;
}


function toPositiveNumber(value) {
  const normalized = normalizeDigits(value)
    .replace(/[^\d.]/g, '');


  if (!normalized) {
    return null;
  }


  const number = Number(normalized);


  return Number.isFinite(number) && number > 0
    ? number
    : null;
}


function getRepresentativeById(representativeId) {
  return readRepresentatives().find(
    (representative) =>
      sameValue(
        representative.id,
        representativeId,
      ),
  );
}


function sortByNewest(first, second) {
  return (
    new Date(
      second.createdAt ||
        second.updatedAt ||
        0,
    ).getTime() -
    new Date(
      first.createdAt ||
        first.updatedAt ||
        0,
    ).getTime()
  );
}


function createStatusEvent(
  status,
  note = '',
  changedBy = 'representative',
) {
  return {
    status,
    label: RETURN_STATUS_LABELS[status],
    note,
    changedBy,
    changedAt: new Date().toISOString(),
  };
}


function requireRepresentative(req, res, next) {
  const authorization = String(
    req.headers.authorization || '',
  );


  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );


  if (!match) {
    return res.status(401).json({
      success: false,
      error: 'ابتدا وارد حساب کاربری شوید.',
    });
  }


  try {
    const payload = jwt.verify(
      match[1],
      JWT_SECRET,
    );


    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      return res.status(401).json({
        success: false,
        error: 'نشست کاربری نامعتبر است.',
      });
    }


    if (payload.role !== 'representative') {
      return res.status(403).json({
        success: false,
        error:
          'این بخش فقط برای نماینده مجاز است.',
      });
    }


    const representativeId = normalizeDigits(
      payload.representativeId,
    );


    if (!representativeId) {
      return res.status(401).json({
        success: false,
        error:
          'شناسهٔ نماینده در نشست پیدا نشد.',
      });
    }


    req.authUser = payload;
    req.representativeId = representativeId;


    return next();
  } catch {
    return res.status(401).json({
      success: false,
      error:
        'نشست شما منقضی یا نامعتبر است؛ دوباره وارد شوید.',
    });
  }
}


function requireAdmin(req, res, next) {
  const authorization = String(
    req.headers.authorization || '',
  );


  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );


  if (!match) {
    return res.status(401).json({
      success: false,
      error: 'ابتدا وارد حساب کاربری شوید.',
    });
  }


  try {
    const payload = jwt.verify(
      match[1],
      JWT_SECRET,
    );


    if (
      !payload ||
      typeof payload !== 'object'
    ) {
      return res.status(401).json({
        success: false,
        error: 'نشست کاربری نامعتبر است.',
      });
    }


    if (payload.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error:
          'این بخش فقط برای ادمین مجاز است.',
      });
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
}


/*
 * تبدیل درخواست قدیمی تک‌کالا یا درخواست جدید چندکالا
 * به آرایهٔ استاندارد items.
 */
function getRequestItems(request) {
  if (
    Array.isArray(request?.items) &&
    request.items.length > 0
  ) {
    return request.items;
  }


  return [
    {
      id: request?.itemId || createRandomId(),
      productId: cleanText(request?.productId),
      productName: cleanText(
        request?.productName ??
          request?.name ??
          request?.title,
      ),
      brand: cleanText(request?.brand),
      category: cleanText(request?.category),
      quantity: toPositiveInteger(request?.quantity) || 0,
      unitPrice:
        toPositiveNumber(
          request?.unitPrice ?? request?.price,
        ) || 0,
      totalPrice:
        toPositiveNumber(request?.totalPrice) ||
        (
          (toPositiveInteger(request?.quantity) || 0) *
          (
            toPositiveNumber(
              request?.unitPrice ?? request?.price,
            ) || 0
          )
        ),
    },
  ].filter((item) => item.productName);
}


/*
 * آماده‌سازی و اعتبارسنجی کالاهای ورودی.
 *
 * اگر items ارسال شود، چندکالا ثبت می‌شود.
 * اگر items ارسال نشود، ساختار قدیمی تک‌کالا همچنان پذیرفته می‌شود.
 */
function prepareReturnItems(body) {
  const rawItems =
    Array.isArray(body?.items) && body.items.length > 0
      ? body.items
      : [
          {
            productId: body?.productId,
            productName:
              body?.productName ??
              body?.name ??
              body?.title,
            brand: body?.brand,
            category: body?.category,
            quantity: body?.quantity,
            unitPrice:
              body?.unitPrice ?? body?.price,
            totalPrice: body?.totalPrice,
          },
        ];


  if (rawItems.length > 100) {
    return {
      success: false,
      error:
        'تعداد کالاهای هر درخواست مرجوعی نباید بیشتر از ۱۰۰ قلم باشد.',
    };
  }


  const mergedItems = new Map();


  for (let index = 0; index < rawItems.length; index += 1) {
    const rawItem = rawItems[index] || {};


    const productId = cleanText(rawItem.productId);
    let productName = cleanText(
      rawItem.productName ??
        rawItem.name ??
        rawItem.title,
    );


    const brand = cleanText(rawItem.brand);
    const category = cleanText(rawItem.category);


    const quantity = toPositiveInteger(
      rawItem.quantity,
    );


    const unitPrice = toPositiveNumber(
      rawItem.unitPrice ?? rawItem.price,
    );


    // fallback برای نام کالا اگر خالی بود
    if (!productName) {
      productName = productId
        ? `کالای ${productId}`
        : `کالای ردیف ${index + 1}`;
    }


    if (!quantity) {
      return {
        success: false,
        error:
          `تعداد مرجوعی ردیف ${index + 1} باید عدد صحیح و بیشتر از صفر باشد.`,
      };
    }


    if (!unitPrice) {
      return {
        success: false,
        error:
          `قیمت واحد ردیف ${index + 1} باید عدد معتبر و بیشتر از صفر باشد.`,
      };
    }


    const totalPrice =
      toPositiveNumber(rawItem.totalPrice) ||
      (quantity * unitPrice);


    /*
     * اگر یک کالا دوباره اضافه شده باشد،
     * تعداد آن را با همان کالا جمع می‌کنیم.
     *
     * اگر productId نباشد، نام و برند معیار تشخیص هستند.
     */
    const mergeKey = productId
      ? `id:${normalizeValue(productId)}`
      : `name:${normalizeValue(productName)}|brand:${normalizeValue(brand)}`;


    const previous = mergedItems.get(mergeKey);


    if (previous) {
      const nextQuantity =
        previous.quantity + quantity;


      previous.quantity = nextQuantity;
      previous.totalPrice =
        nextQuantity * previous.unitPrice;


      if (!previous.brand && brand) {
        previous.brand = brand;
      }


      if (!previous.category && category) {
        previous.category = category;
      }


      continue;
    }


    mergedItems.set(mergeKey, {
      id: createRandomId(),
      productId,
      productName, // حالا همیشه مقدار دارد
      brand,
      category,
      quantity,
      unitPrice,
      totalPrice,
    });
  }


  const items = [...mergedItems.values()];


  if (items.length === 0) {
    return {
      success: false,
      error:
        'حداقل یک کالا برای ثبت درخواست مرجوعی لازم است.',
    };
  }


  const totalQuantity = items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );


  const totalPrice = items.reduce(
    (sum, item) => sum + item.totalPrice,
    0,
  );


  return {
    success: true,
    items,
    totalQuantity,
    totalPrice,
  };
}


/*
 * GET /api/return-requests/my
 * درخواست‌های مرجوعی نمایندهٔ واردشده
 */
router.get(
  '/my',
  requireRepresentative,
  (req, res) => {
    try {
      const representative =
        getRepresentativeById(
          req.representativeId,
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


      const requests = readReturnRequests()
        .filter((request) =>
          sameValue(
            request.representativeId,
            representative.id,
          ),
        )
        .sort(sortByNewest);


      return res.status(200).json({
        success: true,
        count: requests.length,
        data: requests,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت مرجوعی‌های نماینده:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          'دریافت درخواست‌های مرجوعی ناموفق بود.',
      });
    }
  },
);


/*
 * POST /api/return-requests/my
 * ثبت درخواست مرجوعی توسط نمایندهٔ واردشده.
 *
 * درخواست جدید:
 * {
 *   items: [
 *     {
 *       productId,
 *       productName,
 *       brand,
 *       category,
 *       quantity,
 *       unitPrice
 *     }
 *   ],
 *   returnDate,
 *   reason,
 *   confirmedReturn
 * }
 */
router.post(
  '/my',
  requireRepresentative,
  (req, res) => {
    try {
      const representative =
        getRepresentativeById(
          req.representativeId,
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


      const preparedItems = prepareReturnItems(
        req.body,
      );


      if (!preparedItems.success) {
        return res.status(400).json({
          success: false,
          error: preparedItems.error,
        });
      }


      const returnDate = cleanText(
        req.body?.returnDate,
      );


      const reason = cleanText(req.body?.reason);


      const confirmedReturn = Boolean(
        req.body?.confirmedReturn,
      );


      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'دلیل مرجوعی را وارد کنید.',
        });
      }


      if (reason.length > 2000) {
        return res.status(400).json({
          success: false,
          error:
            'دلیل مرجوعی نباید بیشتر از ۲۰۰۰ نویسه باشد.',
        });
      }


      const now = new Date().toISOString();


      /*
       * چهار فیلد تک‌کالا نیز از کالای اول ذخیره می‌شوند
       * تا صفحه‌ها و داده‌های قدیمی از کار نیفتند.
       */
      const firstItem = preparedItems.items[0];


      const newRequest = {
        id: createRandomId(),


        representativeId: representative.id,


        representativeName: cleanText(
          representative.name,
        ),


        representativeCode: cleanText(
          representative.code,
        ),


        representativeCity: cleanText(
          representative.city,
        ),


        /*
         * ساختار جدید چندکالایی
         */
        items: preparedItems.items,
        itemsCount: preparedItems.items.length,
        totalQuantity:
          preparedItems.totalQuantity,
        totalPrice: preparedItems.totalPrice,


        /*
         * سازگاری با کدها و درخواست‌های قدیمی
         */
        productId: firstItem.productId,
        productName: firstItem.productName,
        brand: firstItem.brand,
        category: firstItem.category,
        quantity: firstItem.quantity,
        unitPrice: firstItem.unitPrice,


        returnDate,
        reason,
        confirmedReturn,


        status: 'registered',


        statusHistory: [
          createStatusEvent(
            'registered',
            preparedItems.items.length > 1
              ? `درخواست مرجوعی شامل ${preparedItems.items.length} کالا توسط نماینده ثبت شد.`
              : 'درخواست مرجوعی توسط نماینده ثبت شد.',
            'representative',
          ),
        ],


        createdAt: now,
        updatedAt: now,
      };


      const requests = readReturnRequests();


      if (
        !writeReturnRequests([
          newRequest,
          ...requests,
        ])
      ) {
        return res.status(500).json({
          success: false,
          error:
            'ذخیرهٔ درخواست مرجوعی ناموفق بود.',
        });
      }


      return res.status(201).json({
        success: true,
        message:
          preparedItems.items.length > 1
            ? `درخواست مرجوعی شامل ${preparedItems.items.length} کالا با موفقیت ثبت شد.`
            : 'درخواست مرجوعی با موفقیت ثبت شد.',
        data: newRequest,
      });
    } catch (error) {
      console.error(
        'خطا در ثبت درخواست مرجوعی:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          'خطا در ثبت درخواست مرجوعی.',
      });
    }
  },
);


/*
 * GET /api/return-requests
 * لیست کامل درخواست‌های مرجوعی فقط برای ادمین.
 */
router.get(
  '/',
  requireAdmin,
  (_req, res) => {
    try {
      const requests = readReturnRequests()
        .sort(sortByNewest);


      return res.status(200).json({
        success: true,
        count: requests.length,
        data: requests,
      });
    } catch (error) {
      console.error(
        'خطا در دریافت مرجوعی‌ها:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          'دریافت درخواست‌های مرجوعی ناموفق بود.',
      });
    }
  },
);


/*
 * PATCH /api/return-requests/:id/status
 *
 * این مسیر قدیمی باقی مانده تا بخش‌هایی که هنوز از آن استفاده می‌کنند
 * از کار نیفتند. مسیر اصلی ادمین:
 * /api/admin/return-requests/:id/status
 */
router.patch(
  '/:id/status',
  requireAdmin,
  (req, res) => {
    try {
      const status = cleanText(
        req.body?.status,
      );


      const note = cleanText(
        req.body?.note ??
          req.body?.adminNote,
      );


      if (!RETURN_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          error:
            'وضعیت مرجوعی انتخاب‌شده معتبر نیست.',
        });
      }


      const requests = readReturnRequests();


      const index = requests.findIndex(
        (request) =>
          sameValue(
            request.id,
            req.params.id,
          ),
      );


      if (index < 0) {
        return res.status(404).json({
          success: false,
          error:
            'درخواست مرجوعی پیدا نشد.',
        });
      }


      const current = requests[index];


      if (current.status === status) {
        return res.status(409).json({
          success: false,
          error:
            'درخواست مرجوعی هم‌اکنون در همین وضعیت است.',
        });
      }


      const updated = {
        ...current,
        status,
        adminNote:
          note || current.adminNote || '',
        statusHistory: [
          ...(Array.isArray(
            current.statusHistory,
          )
            ? current.statusHistory
            : []),
          createStatusEvent(
            status,
            note ||
              'وضعیت مرجوعی توسط ادمین تغییر کرد.',
            'admin',
          ),
        ],
        updatedAt: new Date().toISOString(),
      };


      const nextRequests = [...requests];
      nextRequests[index] = updated;


      if (!writeReturnRequests(nextRequests)) {
        return res.status(500).json({
          success: false,
          error:
            'تغییر وضعیت مرجوعی ذخیره نشد.',
        });
      }


      return res.status(200).json({
        success: true,
        message: `وضعیت مرجوعی به «${RETURN_STATUS_LABELS[status]}» تغییر کرد.`,
        data: updated,
      });
    } catch (error) {
      console.error(
        'خطا در تغییر وضعیت مرجوعی:',
        error,
      );


      return res.status(500).json({
        success: false,
        error:
          'خطا در تغییر وضعیت مرجوعی.',
      });
    }
  },
);


module.exports = router;
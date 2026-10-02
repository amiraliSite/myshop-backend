const express = require('express');

const {
  requireAdmin,
} = require('../middleware/auth.middleware');

const {
  readReturnRequests,
  writeReturnRequests,
  readRepresentatives,
  readProducts,
  readRepresentativeWarehouses,
  writeRepresentativeWarehouses,
  writeRepresentatives,
} = require('../helpers/jsonStorage');

const {
  normalizeValue,
  toEnglishDigits,
  createRandomId,
} = require('../helpers/values');

const router = express.Router();

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

  return Number.isSafeInteger(number)
    ? number
    : null;
}

function toNumber(value, fallback = 0) {
  const normalized = normalizeDigits(value)
    .replace(/[^\d.-]/g, '');

  if (!normalized) {
    return fallback;
  }

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getWarehouseStatus(
  quantity,
  minimumStock,
) {
  const safeQuantity = toNumber(quantity);
  const safeMinimumStock = toNumber(
    minimumStock,
  );

  if (safeQuantity <= 0) {
    return 'out';
  }

  if (safeQuantity <= safeMinimumStock) {
    return 'low';
  }

  return 'normal';
}

/*
 * ساختار جدید: request.items
 * ساختار قدیمی: productId + productName + quantity
 *
 * هر دو را به آرایه استاندارد تبدیل می‌کنیم.
 */
function getRequestItems(request) {
  if (
    Array.isArray(request?.items) &&
    request.items.length > 0
  ) {
    return request.items
      .map((item) => {
        const quantity = toPositiveInteger(
          item?.quantity,
        );

        const unitPrice =
          toNumber(
            item?.unitPrice ?? item?.price,
          ) || 0;

        return {
          id: cleanText(item?.id) || createRandomId(),
          productId: cleanText(item?.productId),
          productName: cleanText(
            item?.productName ??
              item?.name ??
              item?.title,
          ),
          brand: cleanText(item?.brand),
          category: cleanText(item?.category),
          quantity: quantity || 0,
          unitPrice,
          totalPrice:
            toNumber(item?.totalPrice) ||
            ((quantity || 0) * unitPrice),
        };
      })
      .filter(
        (item) =>
          item.productName &&
          item.quantity > 0,
      );
  }

  const quantity = toPositiveInteger(
    request?.quantity,
  );

  const unitPrice =
    toNumber(
      request?.unitPrice ?? request?.price,
    ) || 0;

  return [
    {
      id: createRandomId(),
      productId: cleanText(request?.productId),
      productName: cleanText(
        request?.productName ??
          request?.title ??
          request?.name,
      ),
      brand: cleanText(request?.brand),
      category: cleanText(request?.category),
      quantity: quantity || 0,
      unitPrice,
      totalPrice:
        toNumber(request?.totalPrice) ||
        ((quantity || 0) * unitPrice),
    },
  ].filter(
    (item) =>
      item.productName &&
      item.quantity > 0,
  );
}

/*
 * یکسان‌سازی و جمع کردن کالاهای تکراری در یک درخواست.
 */
function mergeItems(items) {
  const result = new Map();

  for (const item of items) {
    const key = item.productId
      ? `id:${normalizeValue(item.productId)}`
      : `name:${normalizeValue(item.productName)}|brand:${normalizeValue(item.brand)}`;

    const previous = result.get(key);

    if (previous) {
      previous.quantity += item.quantity;
      previous.totalPrice =
        previous.quantity * previous.unitPrice;
      continue;
    }

    result.set(key, {
      ...item,
    });
  }

  return [...result.values()];
}

/*
 * محاسبه خلاصه انبار یک نماینده.
 */
function calculateWarehouseSummary(warehouse) {
  const items = Array.isArray(warehouse?.items)
    ? warehouse.items
    : [];

  const storeItemsCount = items.reduce(
    (sum, item) =>
      sum + Math.max(0, toNumber(item.quantity)),
    0,
  );

  const storeItemsTotalValue = items.reduce(
    (sum, item) => {
      const quantity = Math.max(
        0,
        toNumber(item.quantity),
      );

      const unitPrice = Math.max(
        0,
        toNumber(item.unitPrice),
      );

      return sum + (quantity * unitPrice);
    },
    0,
  );

  return {
    storeItemsCount,
    storeItemsTotalValue,
  };
}

/*
 * به‌روزرسانی خلاصه انبار نماینده در representatives.json.
 */
function updateRepresentativeWarehouseSummary(
  representativeId,
  warehouse,
) {
  const representatives = readRepresentatives();

  const representativeIndex =
    representatives.findIndex((representative) =>
      sameValue(
        representative.id,
        representativeId,
      ),
    );

  if (representativeIndex < 0) {
    return false;
  }

  const summary = calculateWarehouseSummary(
    warehouse,
  );

  representatives[representativeIndex] = {
    ...representatives[representativeIndex],
    storeItemsCount: summary.storeItemsCount,
    storeItemsTotalValue:
      summary.storeItemsTotalValue,
    updatedAt: new Date().toISOString(),
  };

  return writeRepresentatives(representatives);
}

/*
 * پیدا کردن کالا در انبار نماینده.
 *
 * اول productId بررسی می‌شود.
 * اگر شناسه موجود نبود یا هم‌خوانی نداشت،
 * نام کالا و برند معیار دوم هستند.
 */
function findWarehouseItemIndex(
  warehouseItems,
  returnItem,
) {
  if (returnItem.productId) {
    const indexByProductId =
      warehouseItems.findIndex((warehouseItem) =>
        sameValue(
          warehouseItem.productId,
          returnItem.productId,
        ),
      );

    if (indexByProductId >= 0) {
      return indexByProductId;
    }
  }

  return warehouseItems.findIndex(
    (warehouseItem) =>
      sameValue(
        warehouseItem.productName,
        returnItem.productName,
      ) &&
      (
        !cleanText(returnItem.brand) ||
        sameValue(
          warehouseItem.brand,
          returnItem.brand,
        )
      ),
  );
}

/*
 * آماده‌سازی تغییرات چندکالایی انبار:
 *
 * هیچ اطلاعاتی را ذخیره نمی‌کند؛ فقط بررسی می‌کند که
 * همه کالاها در انبار باشند و موجودی‌شان کافی باشد.
 */
function prepareWarehouseDeduction(
  representativeId,
  requestItems,
) {
  const warehouses = readRepresentativeWarehouses();

  const warehouseIndex = warehouses.findIndex(
    (warehouse) =>
      sameValue(
        warehouse.representativeId,
        representativeId,
      ),
  );

  if (warehouseIndex < 0) {
    return {
      success: false,
      error:
        'انبار این نماینده پیدا نشد؛ تأیید مرجوعی ممکن نیست.',
    };
  }

  const warehouse = {
    ...warehouses[warehouseIndex],
    items: Array.isArray(
      warehouses[warehouseIndex].items,
    )
      ? warehouses[warehouseIndex].items.map(
          (item) => ({ ...item }),
        )
      : [],
    movements: Array.isArray(
      warehouses[warehouseIndex].movements,
    )
      ? [...warehouses[warehouseIndex].movements]
      : [],
  };

  const mergedItems = mergeItems(requestItems);

  if (mergedItems.length === 0) {
    return {
      success: false,
      error:
        'هیچ کالای معتبری در درخواست مرجوعی پیدا نشد.',
    };
  }

  const preparedDeductions = [];

  for (const returnItem of mergedItems) {
    const itemIndex = findWarehouseItemIndex(
      warehouse.items,
      returnItem,
    );

    if (itemIndex < 0) {
      return {
        success: false,
        error:
          `کالای «${returnItem.productName}» در انبار نماینده پیدا نشد.`,
      };
    }

    const warehouseItem = warehouse.items[itemIndex];

    const currentQuantity = toNumber(
      warehouseItem.quantity,
    );

    if (currentQuantity <= 0) {
      return {
        success: false,
        error:
          `موجودی کالای «${returnItem.productName}» در انبار نماینده صفر است.`,
      };
    }

    if (returnItem.quantity > currentQuantity) {
      return {
        success: false,
        error:
          `موجودی کالای «${returnItem.productName}» کافی نیست. موجودی فعلی: ${currentQuantity}، تعداد مرجوعی: ${returnItem.quantity}`,
      };
    }

    preparedDeductions.push({
      itemIndex,
      returnItem,
      currentQuantity,
      nextQuantity:
        currentQuantity - returnItem.quantity,
    });
  }

  return {
    success: true,
    warehouses,
    warehouseIndex,
    warehouse,
    deductions: preparedDeductions,
  };
}

/*
 * کم کردن همه کالاهای یک درخواست مرجوعی از انبار نماینده.
 *
 * ابتدا کل موارد بررسی می‌شوند؛ اگر همه معتبر باشند،
 * سپس همه با هم ذخیره می‌شوند.
 */
function deductAllReturnItemsFromWarehouse(
  representativeId,
  requestItems,
  returnRequestId,
) {
  const prepared = prepareWarehouseDeduction(
    representativeId,
    requestItems,
  );

  if (!prepared.success) {
    return prepared;
  }

  const now = new Date().toISOString();
  const updatedWarehouse = prepared.warehouse;

  for (const deduction of prepared.deductions) {
    const oldItem =
      updatedWarehouse.items[deduction.itemIndex];

    const nextItem = {
      ...oldItem,
      quantity: deduction.nextQuantity,
      totalPrice:
        deduction.nextQuantity *
        toNumber(oldItem.unitPrice),
      status: getWarehouseStatus(
        deduction.nextQuantity,
        oldItem.minimumStock,
      ),
      lastUpdated: now,
    };

    updatedWarehouse.items[
      deduction.itemIndex
    ] = nextItem;

    updatedWarehouse.movements.unshift({
      id: createRandomId(),
      representativeId: String(
        representativeId,
      ).trim(),
      productId:
        cleanText(nextItem.productId) ||
        cleanText(deduction.returnItem.productId),
      productName:
        cleanText(nextItem.productName) ||
        cleanText(
          deduction.returnItem.productName,
        ),
      brand:
        cleanText(nextItem.brand) ||
        cleanText(deduction.returnItem.brand),
      category:
        cleanText(nextItem.category) ||
        cleanText(
          deduction.returnItem.category,
        ),
      type: 'out',
      quantity: deduction.returnItem.quantity,
      unitPrice: toNumber(nextItem.unitPrice),
      reason: 'تأیید درخواست مرجوعی',
      description:
        `کسر موجودی بابت تأیید درخواست مرجوعی ${returnRequestId}`,
      returnRequestId,
      createdAt: now,
    });
  }

  updatedWarehouse.updatedAt = now;

  prepared.warehouses[prepared.warehouseIndex] =
    updatedWarehouse;

  if (
    !writeRepresentativeWarehouses(
      prepared.warehouses,
    )
  ) {
    return {
      success: false,
      error:
        'ذخیرهٔ تغییرات انبار نماینده ناموفق بود.',
    };
  }

  const summarySaved =
    updateRepresentativeWarehouseSummary(
      representativeId,
      updatedWarehouse,
    );

  if (!summarySaved) {
    return {
      success: false,
      error:
        'موجودی کم شد، اما ذخیرهٔ خلاصهٔ انبار نماینده ناموفق بود.',
    };
  }

  return {
    success: true,
    message:
      'موجودی همهٔ کالاهای مرجوعی از انبار نماینده کم شد.',
    warehouse: updatedWarehouse,
    deductions: prepared.deductions.map(
      (deduction) => ({
        productId:
          deduction.returnItem.productId,
        productName:
          deduction.returnItem.productName,
        quantity: deduction.returnItem.quantity,
        newQuantity: deduction.nextQuantity,
      }),
    ),
  };
}

function getPersianReturnDate(createdAt) {
  return new Intl.DateTimeFormat(
    'fa-IR-u-ca-persian',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    },
  )
    .format(new Date(createdAt || Date.now()))
    .replace(/[\u200e\u200f]/g, '')
    .replace(/-/g, '/');
}

/*
 * GET /api/admin/return-requests
 * دریافت درخواست‌های مرجوعی برای پنل ادمین.
 */
router.get('/', requireAdmin, (_req, res) => {
  try {
    const requests = readReturnRequests();
    const representatives = readRepresentatives();
    const products = readProducts();

    const enrichedRequests = requests.map(
      (request) => {
        const representative = representatives.find(
          (rep) =>
            sameValue(
              rep.id,
              request.representativeId,
            ),
        );

        const requestItems = getRequestItems(request)
          .map((item) => {
            const product = products.find((p) => {
              if (item.productId) {
                return sameValue(
                  p.id,
                  item.productId,
                );
              }

              return sameValue(
                p.name ?? p.title,
                item.productName,
              );
            });

            const unitPrice =
              toNumber(item.unitPrice) ||
              toNumber(product?.price) ||
              toNumber(product?.unitPrice);

            const quantity = toPositiveInteger(
              item.quantity,
            ) || 0;

            return {
              ...item,
              productId:
                item.productId ||
                cleanText(product?.id),
              productName:
                item.productName ||
                cleanText(
                  product?.name ?? product?.title,
                ) ||
                'کالای بدون نام',
              brand:
                item.brand ||
                cleanText(product?.brand),
              category:
                item.category ||
                cleanText(product?.category),
              quantity,
              unitPrice,
              totalPrice:
                toNumber(item.totalPrice) ||
                (quantity * unitPrice),
            };
          })
          .filter((item) => item.productName);

        const totalQuantity = requestItems.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );

        const totalPrice = requestItems.reduce(
          (sum, item) => sum + item.totalPrice,
          0,
        );

        const firstItem = requestItems[0] || {
          productId: '',
          productName: 'کالای بدون نام',
          brand: '',
          category: '',
          quantity: 0,
          unitPrice: 0,
          totalPrice: 0,
        };

        return {
          ...request,

          items: requestItems,
          itemsCount: requestItems.length,
          totalQuantity,
          totalPrice,

          representativeName:
            request.representativeName ||
            representative?.name ||
            'نماینده حذف‌شده',

          representativeCode:
            request.representativeCode ||
            representative?.code ||
            '',

          representativeCity:
            request.representativeCity ||
            representative?.city ||
            '',

          /*
           * فیلدهای سازگار با فرانت فعلی
           */
          productId:
            request.productId ||
            firstItem.productId,

          productName:
            request.productName ||
            firstItem.productName,

          title:
            request.items?.length > 1
              ? `${firstItem.productName} و ${requestItems.length - 1} کالای دیگر`
              : (
                  request.productName ||
                  firstItem.productName ||
                  'کالای بدون نام'
                ),

          brand:
            request.brand ||
            firstItem.brand ||
            '',

          category:
            request.category ||
            firstItem.category ||
            '',

          productCategory:
            request.category ||
            firstItem.category ||
            '',

          productBrand:
            request.brand ||
            firstItem.brand ||
            '',

          quantity:
            request.items?.length > 1
              ? totalQuantity
              : (
                  toPositiveInteger(
                    request.quantity,
                  ) || firstItem.quantity
                ),

          unitPrice:
            request.items?.length > 1
              ? firstItem.unitPrice
              : (
                  toNumber(request.unitPrice) ||
                  firstItem.unitPrice
                ),

          price:
            request.items?.length > 1
              ? firstItem.unitPrice
              : (
                  toNumber(request.unitPrice) ||
                  firstItem.unitPrice
                ),

          returnDate:
            request.returnDate ||
            getPersianReturnDate(
              request.createdAt,
            ),
        };
      },
    );

    return res.status(200).json({
      success: true,
      data: enrichedRequests,
    });
  } catch (error) {
    console.error(
      'خطا در دریافت درخواست‌های مرجوعی ادمین:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        'خطای داخلی سرور در دریافت درخواست‌های مرجوعی.',
    });
  }
});

/*
 * PATCH /api/admin/return-requests/:id/status
 *
 * اگر وضعیت approved باشد:
 * - همهٔ کالاهای request.items بررسی می‌شوند.
 * - در صورت کافی بودن همه موجودی‌ها، همهٔ کالاها کم می‌شوند.
 * - سپس وضعیت درخواست تأیید می‌شود.
 */
router.patch(
  '/:id/status',
  requireAdmin,
  (req, res) => {
    try {
      const { id } = req.params;

      const status = cleanText(req.body?.status);

      const adminNote = cleanText(
        req.body?.adminNote ??
          req.body?.note,
      );

      const allowedStatuses = [
        'approved',
        'rejected',
        'reviewing',
        'received',
      ];

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error:
            'وضعیت نامعتبر است. وضعیت باید یکی از موارد approved، rejected، reviewing یا received باشد.',
        });
      }

      const requests = readReturnRequests();

      const requestIndex = requests.findIndex(
        (request) =>
          sameValue(request.id, id),
      );

      if (requestIndex < 0) {
        return res.status(404).json({
          success: false,
          error: 'درخواست مرجوعی یافت نشد.',
        });
      }

      const current = requests[requestIndex];

      if (current.status === status) {
        return res.status(409).json({
          success: false,
          error:
            'درخواست مرجوعی هم‌اکنون در همین وضعیت است.',
        });
      }

      let stockResult = null;

      /*
       * کاهش موجودی فقط یک بار، هنگام اولین تغییر به approved.
       */
      if (
        status === 'approved' &&
        current.status !== 'approved'
      ) {
        const requestItems = getRequestItems(current);

        if (requestItems.length === 0) {
          return res.status(400).json({
            success: false,
            error:
              'کالای معتبری در این درخواست مرجوعی وجود ندارد.',
          });
        }

        stockResult =
          deductAllReturnItemsFromWarehouse(
            current.representativeId,
            requestItems,
            current.id,
          );

        if (!stockResult.success) {
          return res.status(400).json({
            success: false,
            error:
              stockResult.error ||
              'کاهش موجودی انبار نماینده ناموفق بود.',
          });
        }
      }

      const now = new Date().toISOString();

      const updatedRequest = {
        ...current,

        status,

        adminNote:
          adminNote ||
          current.adminNote ||
          '',

        decidedAt:
          status === 'approved' ||
          status === 'rejected'
            ? now
            : current.decidedAt,

        decidedBy:
          status === 'approved' ||
          status === 'rejected'
            ? req.user?.id ||
              req.authUser?.id ||
              'admin'
            : current.decidedBy,

        statusHistory: [
          ...(Array.isArray(
            current.statusHistory,
          )
            ? current.statusHistory
            : []),

          {
            status,
            label:
              status === 'approved'
                ? 'تأیید شده'
                : status === 'rejected'
                ? 'رد شده'
                : status === 'reviewing'
                ? 'در حال بررسی'
                : 'دریافت شده',
            note:
              adminNote ||
              (
                status === 'approved' &&
                stockResult
                  ? 'درخواست مرجوعی تأیید شد و موجودی کالاهای آن از انبار نماینده کم شد.'
                  : 'وضعیت مرجوعی توسط ادمین تغییر کرد.'
              ),
            changedBy: 'admin',
            changedAt: now,
          },
        ],

        updatedAt: now,
      };

      requests[requestIndex] = updatedRequest;

      if (!writeReturnRequests(requests)) {
        return res.status(500).json({
          success: false,
          error:
            'ذخیره‌سازی وضعیت مرجوعی ناموفق بود.',
        });
      }

      const statusLabel =
        status === 'approved'
          ? 'تأیید شده'
          : status === 'rejected'
          ? 'رد شده'
          : status === 'reviewing'
          ? 'در حال بررسی'
          : 'دریافت شده';

      return res.status(200).json({
        success: true,
        message:
          status === 'approved'
            ? 'درخواست مرجوعی تأیید شد و موجودی همهٔ کالاهای آن از انبار نماینده کم شد.'
            : `وضعیت درخواست مرجوعی به «${statusLabel}» تغییر کرد.`,
        data: {
          ...updatedRequest,
          stockDeductions:
            stockResult?.deductions || [],
        },
      });
    } catch (error) {
      console.error(
        'خطا در به‌روزرسانی وضعیت درخواست مرجوعی ادمین:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          'خطای داخلی سرور در به‌روزرسانی وضعیت درخواست مرجوعی.',
      });
    }
  },
);

module.exports = router;
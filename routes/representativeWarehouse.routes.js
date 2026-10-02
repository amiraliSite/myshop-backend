const express = require('express');

const {
  readRepresentatives,
  writeRepresentatives,
  readProducts,
  readRepresentativeWarehouses,
  writeRepresentativeWarehouses,
} = require('../helpers/jsonStorage');

const {
  normalizeValue,
  toEnglishDigits,
  createRandomId,
} = require('../helpers/values');

const router = express.Router();

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();

  return text || fallback;
}

function toNumber(value, fallback = 0) {
  const normalizedValue = toEnglishDigits(value)
    .replace(/[,٬،\s]/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();

  if (!normalizedValue) {
    return fallback;
  }

  const numberValue = Number(normalizedValue);

  return Number.isFinite(numberValue)
    ? numberValue
    : fallback;
}

function toPositiveNumber(value, fallback = 0) {
  const numberValue = toNumber(value, fallback);

  return numberValue > 0
    ? numberValue
    : fallback;
}

function sameValue(firstValue, secondValue) {
  const first = normalizeValue(firstValue);
  const second = normalizeValue(secondValue);

  return Boolean(
    first &&
      second &&
      first === second,
  );
}

function getWarehouseStatus(
  quantity,
  minimumStock,
) {
  const safeQuantity = toNumber(quantity);
  const safeMinimumStock = toNumber(minimumStock);

  if (safeQuantity <= 0) {
    return 'out';
  }

  if (safeQuantity <= safeMinimumStock) {
    return 'low';
  }

  return 'normal';
}

function createEmptyWarehouse(representativeId) {
  return {
    representativeId: String(
      representativeId,
    ).trim(),
    items: [],
    movements: [],
    updatedAt: new Date().toISOString(),
  };
}

function findRepresentative(
  representatives,
  representativeId,
) {
  return representatives.find((representative) => {
    return sameValue(
      representative.id,
      representativeId,
    );
  });
}

/*
  محاسبهٔ خلاصهٔ واقعی انبار.

  تعداد کل = جمع quantity همه کالاها
  ارزش کل = جمع totalPrice همه کالاها؛
  و اگر totalPrice نبود، quantity × unitPrice.
*/
function calculateWarehouseSummary(warehouse) {
  const items = Array.isArray(warehouse?.items)
    ? warehouse.items
    : [];

  const storeItemsCount = items.reduce(
    (total, item) => {
      return total + Math.max(
        0,
        toNumber(item.quantity),
      );
    },
    0,
  );

  const storeItemsTotalValue = items.reduce(
    (total, item) => {
      const savedTotalPrice = toNumber(
        item.totalPrice,
      );

      const calculatedTotalPrice =
        savedTotalPrice > 0
          ? savedTotalPrice
          : toNumber(item.quantity) *
            toNumber(item.unitPrice);

      return total + Math.max(
        0,
        calculatedTotalPrice,
      );
    },
    0,
  );

  return {
    storeItemsCount,
    storeItemsTotalValue,
  };
}

/*
  ذخیرهٔ خلاصهٔ انبار برای یک نماینده در representatives.json.
*/
function updateRepresentativeWarehouseSummary(
  representativeId,
  warehouse,
) {
  const representatives = readRepresentatives();

  const representativeIndex =
    representatives.findIndex((representative) => {
      return sameValue(
        representative.id,
        representativeId,
      );
    });

  if (representativeIndex < 0) {
    console.warn(
      'نماینده برای بروزرسانی خلاصه انبار پیدا نشد:',
      representativeId,
    );

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

  const saved = writeRepresentatives(
    representatives,
  );

  if (!saved) {
    console.error(
      'ذخیره خلاصه انبار نماینده ناموفق بود:',
      representativeId,
    );
  }

  return saved;
}

/*
  همگام‌سازی خلاصهٔ انبار همه نمایندگان.

  این تابع برای داده‌های قبلی هم استفاده می‌شود.
*/
function synchronizeAllWarehouseSummaries() {
  const representatives = readRepresentatives();

  const warehouses =
    readRepresentativeWarehouses();

  const now = new Date().toISOString();

  const updatedRepresentatives = representatives.map(
    (representative) => {
      const warehouse = warehouses.find(
        (warehouseItem) => {
          return sameValue(
            warehouseItem.representativeId,
            representative.id,
          );
        },
      );

      const summary = calculateWarehouseSummary(
        warehouse,
      );

      return {
        ...representative,
        storeItemsCount: summary.storeItemsCount,
        storeItemsTotalValue:
          summary.storeItemsTotalValue,
        updatedAt: now,
      };
    },
  );

  const saved = writeRepresentatives(
    updatedRepresentatives,
  );

  return {
    saved,
    representatives: updatedRepresentatives,
  };
}

/*
  POST /api/representatives/warehouse/sync-summaries

  بروزرسانی خلاصهٔ موجودی همه نمایندگان از روی
  representativeWarehouses.json.

  این route باید قبل از /:id/warehouse باشد.
*/
router.post(
  '/warehouse/sync-summaries',
  (_req, res) => {
    try {
      const result =
        synchronizeAllWarehouseSummaries();

      if (!result.saved) {
        return res.status(500).json({
          success: false,
          error:
            'ذخیره خلاصه موجودی نمایندگان ناموفق بود.',
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'خلاصه موجودی همه نمایندگان با موفقیت بروزرسانی شد.',
        count: result.representatives.length,
        data: result.representatives,
      });
    } catch (error) {
      console.error(
        'خطا در همگام‌سازی خلاصه موجودی نمایندگان:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در همگام‌سازی خلاصه موجودی نمایندگان.',
      });
    }
  },
);

/*
  GET /api/representatives/:id/warehouse

  دریافت موجودی و گردش انبار نماینده.
*/
router.get('/:id/warehouse', (req, res) => {
  try {
    const representativeId = normalizeValue(
      req.params.id,
    );

    const representatives = readRepresentatives();

    const representative = findRepresentative(
      representatives,
      representativeId,
    );

    if (!representative) {
      return res.status(404).json({
        success: false,
        error: 'نماینده موردنظر پیدا نشد.',
      });
    }

    const warehouses =
      readRepresentativeWarehouses();

    let warehouseIndex = warehouses.findIndex(
      (warehouse) => {
        return sameValue(
          warehouse.representativeId,
          representativeId,
        );
      },
    );

    if (warehouseIndex < 0) {
      const newWarehouse = createEmptyWarehouse(
        representative.id,
      );

      warehouses.push(newWarehouse);

      if (!writeRepresentativeWarehouses(warehouses)) {
        return res.status(500).json({
          success: false,
          error: 'ساخت انبار نماینده ناموفق بود.',
        });
      }

      warehouseIndex = warehouses.length - 1;
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

    updateRepresentativeWarehouseSummary(
      representative.id,
      warehouse,
    );

    const movements = [...warehouse.movements].sort(
      (first, second) => {
        return (
          new Date(
            second.createdAt || 0,
          ).getTime() -
          new Date(
            first.createdAt || 0,
          ).getTime()
        );
      },
    );

    return res.status(200).json({
      success: true,
      data: {
        representativeId: String(
          representative.id,
        ).trim(),
        items: warehouse.items,
        movements,
        updatedAt:
          warehouse.updatedAt ||
          new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error(
      'خطا در دریافت انبار نماینده:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        'خطا در بارگذاری انبار نماینده.',
    });
  }
});

/*
  POST /api/representatives/:id/warehouse/import

  ثبت ردیف‌های اکسل فقط در انبار همین نماینده.
  این مسیر هیچ تغییری در products.json نمی‌دهد.

  Body:
  {
    "fileName": "warehouse.xlsx",
    "items": [
      {
        "name": "نام کالا",
        "brand": "برند",
        "category": "دسته‌بندی",
        "quantity": 3,
        "unitPrice": 100000,
        "rowIndex": 2
      }
    ]
  }
*/
router.post('/:id/warehouse/import', (req, res) => {
  try {
    const representativeId = normalizeValue(
      req.params.id,
    );

    const representatives = readRepresentatives();

    const representative = findRepresentative(
      representatives,
      representativeId,
    );

    if (!representative) {
      return res.status(404).json({
        success: false,
        error: 'نماینده موردنظر پیدا نشد.',
      });
    }

    const inputItems = req.body?.items;

    if (
      !Array.isArray(inputItems) ||
      inputItems.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'هیچ ردیفی برای ثبت ارسال نشده است.',
      });
    }

    if (inputItems.length > 5000) {
      return res.status(400).json({
        success: false,
        error:
          'تعداد ردیف‌ها نباید بیشتر از ۵۰۰۰ باشد.',
      });
    }

    const preparedItems = [];

    for (const row of inputItems) {
      const name = cleanText(row?.name);
      const brand = cleanText(row?.brand);
      const category = cleanText(row?.category);
      const quantity = toNumber(row?.quantity);
      const unitPrice = toNumber(row?.unitPrice);

      if (
        !name ||
        !Number.isSafeInteger(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            `ردیف ${row?.rowIndex ?? '?'} نام، تعداد یا قیمت نامعتبر دارد.`,
        });
      }

      preparedItems.push({
        name,
        brand,
        category,
        quantity,
        unitPrice,
        rowIndex: row?.rowIndex ?? null,
      });
    }

    const warehouses =
      readRepresentativeWarehouses();

    let warehouseIndex = warehouses.findIndex(
      (warehouse) =>
        sameValue(
          warehouse.representativeId,
          representative.id,
        ),
    );

    if (warehouseIndex < 0) {
      warehouses.push(
        createEmptyWarehouse(representative.id),
      );
      warehouseIndex = warehouses.length - 1;
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

    const now = new Date().toISOString();
    const fileName = cleanText(req.body?.fileName);
    let createdCount = 0;
    let updatedCount = 0;

    for (const row of preparedItems) {
      const itemIndex = warehouse.items.findIndex(
        (item) =>
          sameValue(item.productName, row.name) &&
          sameValue(item.brand, row.brand),
      );

      let item;

      if (itemIndex < 0) {
        item = {
          id: createRandomId(),
          productId: createRandomId(),
          productName: row.name,
          brand: row.brand,
          category: row.category,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          totalPrice:
            row.quantity * row.unitPrice,
          minimumStock: 0,
          status: getWarehouseStatus(
            row.quantity,
            0,
          ),
          lastUpdated: now,
        };

        warehouse.items.push(item);
        createdCount += 1;
      } else {
        const previous =
          warehouse.items[itemIndex];

        const nextQuantity =
          toNumber(previous.quantity) +
          row.quantity;

        item = {
          ...previous,
          brand: row.brand,
          category:
            row.category ||
            cleanText(previous.category),
          quantity: nextQuantity,
          unitPrice: row.unitPrice,
          totalPrice:
            nextQuantity * row.unitPrice,
          status: getWarehouseStatus(
            nextQuantity,
            previous.minimumStock,
          ),
          lastUpdated: now,
        };

        warehouse.items[itemIndex] = item;
        updatedCount += 1;
      }

      warehouse.movements.unshift({
        id: createRandomId(),
        representativeId: String(
          representative.id,
        ).trim(),
        productId: item.productId,
        productName: item.productName,
        brand: item.brand,
        category: item.category,
        type: 'in',
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        reason: 'ارسال بار از اکسل',
        description:
          `ردیف ${row.rowIndex ?? '-'} از فایل ${fileName || 'اکسل'}`,
        createdAt: now,
      });
    }

    warehouse.updatedAt = now;
    warehouses[warehouseIndex] = warehouse;

    if (!writeRepresentativeWarehouses(warehouses)) {
      return res.status(500).json({
        success: false,
        error:
          'ذخیرهٔ اطلاعات انبار نماینده ناموفق بود.',
      });
    }

    const summarySaved =
      updateRepresentativeWarehouseSummary(
        representative.id,
        warehouse,
      );

    if (!summarySaved) {
      return res.status(500).json({
        success: false,
        error:
          'کالاها ثبت شدند، اما ذخیرهٔ خلاصهٔ نماینده ناموفق بود.',
      });
    }

    return res.status(201).json({
      success: true,
      message:
        'کالاها فقط در انبار همین نماینده ثبت شدند.',
      data: {
        createdCount,
        updatedCount,
        importedCount: preparedItems.length,
        summary: calculateWarehouseSummary(
          warehouse,
        ),
      },
    });
  } catch (error) {
    console.error(
      'خطا در ورود اکسل به انبار نماینده:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        'خطا در ثبت اکسل انبار نماینده.',
    });
  }
});

/*
  POST /api/representatives/:id/warehouse/movements

  مسیر قدیمی ورود یا خروج کالا باقی مانده است
  تا بخش‌های دیگر برنامه از کار نیفتند.
*/
router.post(
  '/:id/warehouse/movements',
  (req, res) => {
    try {
      const representativeId = normalizeValue(
        req.params.id,
      );

      const representatives = readRepresentatives();

      const representative = findRepresentative(
        representatives,
        representativeId,
      );

      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'نماینده موردنظر پیدا نشد.',
        });
      }

      const type =
        req.body.type === 'out'
          ? 'out'
          : 'in';

      const productId = normalizeValue(
        req.body.productId,
      );

      const quantity = toPositiveNumber(
        req.body.quantity,
      );

      const requestedUnitPrice = toNumber(
        req.body.unitPrice,
      );

      const minimumStock = Math.max(
        0,
        toNumber(req.body.minimumStock, 5),
      );

      const reason = cleanText(
        req.body.reason,
        type === 'in'
          ? 'ورود کالا'
          : 'خروج کالا',
      );

      const description = cleanText(
        req.body.description,
      );

      if (!productId) {
        return res.status(400).json({
          success: false,
          error: 'انتخاب محصول الزامی است.',
        });
      }

      if (quantity <= 0) {
        return res.status(400).json({
          success: false,
          error:
            'تعداد کالا باید بیشتر از صفر باشد.',
        });
      }

      const products = readProducts();

      const product = products.find((item) => {
        return sameValue(item.id, productId);
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'محصول موردنظر پیدا نشد.',
        });
      }

      const warehouses =
        readRepresentativeWarehouses();

      let warehouseIndex = warehouses.findIndex(
        (warehouse) => {
          return sameValue(
            warehouse.representativeId,
            representativeId,
          );
        },
      );

      if (warehouseIndex < 0) {
        warehouses.push(
          createEmptyWarehouse(representative.id),
        );

        warehouseIndex = warehouses.length - 1;
      }

      const warehouse = warehouses[warehouseIndex];

      warehouse.items = Array.isArray(
        warehouse.items,
      )
        ? warehouse.items
        : [];

      warehouse.movements = Array.isArray(
        warehouse.movements,
      )
        ? warehouse.movements
        : [];

      let itemIndex = warehouse.items.findIndex(
        (item) => {
          return sameValue(
            item.productId,
            productId,
          );
        },
      );

      const now = new Date().toISOString();

      if (type === 'in') {
        const unitPrice =
          requestedUnitPrice > 0
            ? requestedUnitPrice
            : toNumber(product.price);

        if (itemIndex < 0) {
          const newItem = {
            id: createRandomId(),
            productId: String(product.id).trim(),
            productName: cleanText(product.name),
            category: cleanText(product.category),
            quantity,
            unitPrice,
            totalPrice: quantity * unitPrice,
            minimumStock,
            status: getWarehouseStatus(
              quantity,
              minimumStock,
            ),
            lastUpdated: now,
          };

          warehouse.items.push(newItem);
          itemIndex = warehouse.items.length - 1;
        } else {
          const oldItem = warehouse.items[itemIndex];

          const nextQuantity =
            toNumber(oldItem.quantity) + quantity;

          const unitPrice =
            requestedUnitPrice > 0
              ? requestedUnitPrice
              : toNumber(
                  oldItem.unitPrice,
                  toNumber(product.price),
                );

          warehouse.items[itemIndex] = {
            ...oldItem,
            productId: String(product.id).trim(),
            productName: cleanText(product.name),
            category: cleanText(product.category),
            quantity: nextQuantity,
            unitPrice,
            totalPrice: nextQuantity * unitPrice,
            minimumStock,
            status: getWarehouseStatus(
              nextQuantity,
              minimumStock,
            ),
            lastUpdated: now,
          };
        }
      } else {
        if (itemIndex < 0) {
          return res.status(400).json({
            success: false,
            error:
              'این محصول در انبار نماینده موجود نیست.',
          });
        }

        const oldItem = warehouse.items[itemIndex];

        const currentQuantity = toNumber(
          oldItem.quantity,
        );

        if (quantity > currentQuantity) {
          return res.status(400).json({
            success: false,
            error:
              `موجودی کافی نیست. موجودی فعلی: ${currentQuantity}`,
          });
        }

        const nextQuantity =
          currentQuantity - quantity;

        warehouse.items[itemIndex] = {
          ...oldItem,
          quantity: nextQuantity,
          totalPrice:
            nextQuantity *
            toNumber(oldItem.unitPrice),
          status: getWarehouseStatus(
            nextQuantity,
            oldItem.minimumStock,
          ),
          lastUpdated: now,
        };
      }

      const savedItem = warehouse.items[itemIndex];

      const movement = {
        id: createRandomId(),
        representativeId: String(
          representative.id,
        ).trim(),
        productId: String(product.id).trim(),
        productName: cleanText(product.name),
        category: cleanText(product.category),
        type,
        quantity,
        unitPrice: toNumber(
          savedItem?.unitPrice,
        ),
        reason,
        description,
        createdAt: now,
      };

      warehouse.movements.unshift(movement);
      warehouse.updatedAt = now;

      warehouses[warehouseIndex] = warehouse;

      const warehouseSaved =
        writeRepresentativeWarehouses(warehouses);

      if (!warehouseSaved) {
        return res.status(500).json({
          success: false,
          error:
            'ذخیره تغییرات انبار نماینده ناموفق بود.',
        });
      }

      const summarySaved =
        updateRepresentativeWarehouseSummary(
          representative.id,
          warehouse,
        );

      if (!summarySaved) {
        return res.status(500).json({
          success: false,
          error:
            'کالا ثبت شد، اما بروزرسانی خلاصه نماینده ناموفق بود.',
        });
      }

      return res.status(201).json({
        success: true,
        message:
          type === 'in'
            ? 'ورود کالا به انبار نماینده ثبت شد.'
            : 'خروج کالا از انبار نماینده ثبت شد.',
        data: {
          item: savedItem,
          movement,
          summary: calculateWarehouseSummary(
            warehouse,
          ),
        },
      });
    } catch (error) {
      console.error(
        'خطا در ثبت گردش انبار نماینده:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          'خطا در ثبت گردش انبار نماینده.',
      });
    }
  },
);

module.exports = router;
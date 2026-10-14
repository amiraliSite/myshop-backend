const express = require('express');


const {
  requireAdmin,
} = require('../middleware/auth.middleware');


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
  return String(value ?? '').trim() || fallback;
}


function toNumber(value, fallback = 0) {
  const text = String(toEnglishDigits(value) ?? '')
    .replace(/[,٬،\s]/g, '')
    .replace(/[^\d.-]/g, '')
    .trim();


  if (!text) return fallback;


  const number = Number(text);
  return Number.isFinite(number) ? number : fallback;
}


function sameValue(first, second) {
  const a = normalizeValue(first);
  const b = normalizeValue(second);
  return Boolean(a && b && a === b);
}


function getWarehouseStatus(quantity, minimumStock) {
  if (toNumber(quantity) <= 0) return 'out';
  if (toNumber(quantity) <= toNumber(minimumStock)) return 'low';
  return 'normal';
}


function createEmptyWarehouse(representativeId) {
  return {
    representativeId: String(representativeId).trim(),
    items: [],
    movements: [],
    importedFiles: [],
    updatedAt: new Date().toISOString(),
  };
}


function ensureWarehouseShape(warehouse) {
  const result = warehouse || {};
  result.items = Array.isArray(result.items) ? result.items : [];
  result.movements = Array.isArray(result.movements)
    ? result.movements
    : [];
  result.importedFiles = Array.isArray(result.importedFiles)
    ? result.importedFiles
    : [];
  return result;
}


function findRepresentative(representatives, id) {
  return representatives.find((item) => sameValue(item.id, id));
}


function getOrCreateWarehouse(warehouses, representativeId) {
  let warehouseIndex = warehouses.findIndex((item) =>
    sameValue(item.representativeId, representativeId),
  );


  if (warehouseIndex < 0) {
    warehouses.push(createEmptyWarehouse(representativeId));
    warehouseIndex = warehouses.length - 1;
  }


  const warehouse = ensureWarehouseShape(
    warehouses[warehouseIndex],
  );


  warehouses[warehouseIndex] = warehouse;
  return { warehouseIndex, warehouse };
}


function calculateWarehouseSummary(warehouse) {
  const items = Array.isArray(warehouse?.items)
    ? warehouse.items
    : [];


  return {
    storeItemsCount: items.reduce(
      (sum, item) => sum + Math.max(0, toNumber(item.quantity)),
      0,
    ),
    storeItemsTotalValue: items.reduce(
      (sum, item) =>
        sum +
        Math.max(0, toNumber(item.quantity)) *
          Math.max(0, toNumber(item.unitPrice)),
      0,
    ),
  };
}


function updateRepresentativeWarehouseSummary(id, warehouse) {
  const representatives = readRepresentatives();
  const index = representatives.findIndex((item) =>
    sameValue(item.id, id),
  );


  if (index < 0) return false;


  representatives[index] = {
    ...representatives[index],
    ...calculateWarehouseSummary(warehouse),
    updatedAt: new Date().toISOString(),
  };


  return writeRepresentatives(representatives);
}


function getRepresentativeWarehouseBudget(representative) {
  const depositAmount = Math.max(
    0,
    toNumber(representative?.depositAmount),
  );


  const guaranteeCheck = Math.max(
    0,
    toNumber(representative?.guaranteeCheck),
  );


  const totalFinancialCommitment = Math.max(
    0,
    toNumber(representative?.totalFinancialCommitment),
  );


  const calculatedBudget = depositAmount + guaranteeCheck;


  return {
    depositAmount,
    guaranteeCheck,
    totalFinancialCommitment,
    calculatedBudget,
    warehouseBudget:
      totalFinancialCommitment > 0
        ? totalFinancialCommitment
        : calculatedBudget,
  };
}


function findWarehouseItem(warehouse, row) {
  if (row.productId) {
    const index = warehouse.items.findIndex((item) =>
      sameValue(item.productId, row.productId),
    );
    if (index >= 0) return index;
  }


  return warehouse.items.findIndex(
    (item) =>
      sameValue(item.productName, row.name) &&
      cleanText(item.brand) === cleanText(row.brand),
  );
}


function sendServerError(res, error, fallback) {
  console.error(fallback, error);
  return res.status(500).json({
    success: false,
    error: error.message || fallback,
  });
}


router.post(
  '/warehouse/sync-summaries',
  requireAdmin,
  (_req, res) => {
    try {
      const warehouses = readRepresentativeWarehouses();
      const now = new Date().toISOString();


      const representatives = readRepresentatives().map(
        (representative) => {
          const warehouse = warehouses.find((item) =>
            sameValue(item.representativeId, representative.id),
          );


          return {
            ...representative,
            ...calculateWarehouseSummary(warehouse),
            updatedAt: now,
          };
        },
      );


      if (!writeRepresentatives(representatives)) {
        throw new Error('ذخیره خلاصه موجودی ناموفق بود.');
      }


      return res.json({
        success: true,
        message: 'خلاصه موجودی نمایندگان بروزرسانی شد.',
        count: representatives.length,
        data: representatives,
      });
    } catch (error) {
      return sendServerError(
        res,
        error,
        'خطا در همگام‌سازی موجودی.',
      );
    }
  },
);


router.get('/:id/warehouse', (req, res) => {
  try {
    const representative = findRepresentative(
      readRepresentatives(),
      req.params.id,
    );


    if (!representative) {
      return res.status(404).json({
        success: false,
        error: 'نماینده موردنظر پیدا نشد.',
      });
    }


    const warehouses = readRepresentativeWarehouses();
    const { warehouse } = getOrCreateWarehouse(
      warehouses,
      representative.id,
    );


    if (!writeRepresentativeWarehouses(warehouses)) {
      throw new Error('ذخیره ساختار انبار ناموفق بود.');
    }


    const summarySaved = updateRepresentativeWarehouseSummary(
      representative.id,
      warehouse,
    );


    return res.json({
      success: true,
      data: {
        representativeId: String(representative.id),
        items: warehouse.items,
        movements: [...warehouse.movements].sort(
          (a, b) =>
            new Date(b.createdAt || 0).getTime() -
            new Date(a.createdAt || 0).getTime(),
        ),
        updatedAt: warehouse.updatedAt,
        summary: calculateWarehouseSummary(warehouse),
        summarySaved,
      },
    });
  } catch (error) {
    return sendServerError(res, error, 'خطا در دریافت انبار.');
  }
});


router.post(
  '/:id/warehouse/update-info',
  requireAdmin,
  (req, res) => {
    try {
      const representative = findRepresentative(
        readRepresentatives(),
        req.params.id,
      );


      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'نماینده موردنظر پیدا نشد.',
        });
      }


      const inputItems = req.body?.items;


      if (!Array.isArray(inputItems) || !inputItems.length) {
        return res.status(400).json({
          success: false,
          error: 'لیست کالاها ارسال نشده است.',
        });
      }


      const warehouses = readRepresentativeWarehouses();
      const { warehouse } = getOrCreateWarehouse(
        warehouses,
        representative.id,
      );


      let matchedItems = 0;
      let updatedBrands = 0;
      let updatedCategories = 0;


      for (const input of inputItems) {
        const name = cleanText(
          input.name || input.productName || input.title,
        );

        const brand = cleanText(input.brand);
        const category = cleanText(input.category);
        const unitPrice = toNumber(input.unitPrice);


        if (!name) continue;


        const item = warehouse.items.find(
          (item) =>
            cleanText(item.productName) === name &&
            (!unitPrice ||
              toNumber(item.unitPrice) === unitPrice),
        );


        if (!item) continue;


        matchedItems += 1;


        if (brand && !cleanText(item.brand)) {
          item.brand = brand;
          updatedBrands += 1;
        }


        if (category && !cleanText(item.category)) {
          item.category = category;
          updatedCategories += 1;
        }
      }


      warehouse.updatedAt = new Date().toISOString();


      if (!writeRepresentativeWarehouses(warehouses)) {
        throw new Error('ذخیره اطلاعات انبار ناموفق بود.');
      }


      return res.json({
        success: true,
        message: 'برند و دسته‌بندی کالاهای موجود بروزرسانی شد.',
        data: {
          matchedItems,
          updatedBrands,
          updatedCategories,
        },
      });
    } catch (error) {
      return sendServerError(
        res,
        error,
        'خطا در بروزرسانی اطلاعات کالاها.',
      );
    }
  },
);


router.post(
  '/:id/warehouse/import',
  requireAdmin,
  (req, res) => {
    try {
      const representative = findRepresentative(
        readRepresentatives(),
        req.params.id,
      );


      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'نماینده موردنظر پیدا نشد.',
        });
      }


      const inputItems = req.body?.items;
      const requestId = cleanText(req.body?.requestId);
      const fileName = cleanText(req.body?.fileName, 'Excel');


      if (!requestId) {
        return res.status(400).json({
          success: false,
          code: 'REQUEST_ID_REQUIRED',
          error: 'شناسه فایل ارسال نشده است.',
        });
      }


      if (
        !Array.isArray(inputItems) ||
        !inputItems.length ||
        inputItems.length > 5000
      ) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_ROWS_COUNT',
          error: 'تعداد ردیف‌های فایل باید بین ۱ و ۵۰۰۰ باشد.',
        });
      }


      const rows = [];
      const validationErrors = [];
      const rowIndexes = new Set();


      inputItems.forEach((input, index) => {
        const row = input || {};
        const rowIndex = row.rowIndex ?? index + 1;
        const name = cleanText(
          row.name || row.productName || row.title,
        );
        const quantity = toNumber(row.quantity);
        const unitPrice = toNumber(row.unitPrice);


        let reason = '';


        if (!name) {
          reason = 'نام کالا خالی است.';
        } else if (
          !Number.isSafeInteger(quantity) ||
          quantity <= 0
        ) {
          reason = 'تعداد باید عدد صحیح و بیشتر از صفر باشد.';
        } else if (
          unitPrice <= 0 ||
          !Number.isFinite(quantity * unitPrice)
        ) {
          reason = 'قیمت یا ارزش ردیف نامعتبر است.';
        } else if (rowIndexes.has(String(rowIndex))) {
          reason = 'شماره ردیف تکراری است.';
        }


        rowIndexes.add(String(rowIndex));


        if (reason) {
          validationErrors.push({
            rowIndex,
            name,
            reason,
          });
        }


        rows.push({
          rowIndex,
          productId: cleanText(row.productId),
          name,
          brand: cleanText(row.brand),
          category: cleanText(row.category),
          quantity,
          unitPrice,
        });
      });


      if (validationErrors.length) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_ROWS',
          error: 'فایل دارای ردیف نامعتبر است؛ هیچ کالایی ثبت نشد.',
          data: { validationErrors },
        });
      }


      const warehouses = readRepresentativeWarehouses();
      const { warehouse } = getOrCreateWarehouse(
        warehouses,
        representative.id,
      );


      const previousFile = warehouse.importedFiles.find(
        (item) => item.requestId === requestId,
      );


      let progressRows;


      if (previousFile && Array.isArray(previousFile.rows)) {
        progressRows = previousFile.rows;


        const inputChanged =
          progressRows.length !== rows.length ||
          rows.some((row, index) => {
            const previous = progressRows[index];


            return (
              String(previous.rowIndex) !== String(row.rowIndex) ||
              previous.name !== row.name ||
              previous.brand !== row.brand ||
              previous.category !== row.category ||
              previous.productId !== row.productId ||
              previous.quantity !== row.quantity ||
              previous.unitPrice !== row.unitPrice
            );
          });


        if (inputChanged) {
          return res.status(409).json({
            success: false,
            code: 'FILE_CONTENT_CHANGED',
            error:
              'محتوای فایل با سابقه ثبت آن یکسان نیست؛ ثبت دوباره متوقف شد.',
          });
        }
      } else if (previousFile) {
        const legacyMovements = warehouse.movements.filter(
          (movement) =>
            movement.type === 'in' &&
            movement.createdAt === previousFile.createdAt &&
            cleanText(movement.description).endsWith(
              ` از فایل ${fileName}`,
            ),
        );


        const recoveredQuantity = legacyMovements.reduce(
          (sum, movement) => sum + toNumber(movement.quantity),
          0,
        );


        if (
          !legacyMovements.length ||
          recoveredQuantity !== toNumber(previousFile.acceptedQuantity)
        ) {
          return res.status(409).json({
            success: false,
            code: 'LEGACY_IMPORT_REVIEW_REQUIRED',
            error:
              'این فایل سابقه ثبت قدیمی دارد، اما تعداد ثبت‌شده هر ردیف قابل بازیابی نیست. برای جلوگیری از موجودی تکراری، ثبت مجدد متوقف شد.',
          });
        }


        progressRows = rows.map((row) => {
          const expectedDescription =
            `ردیف ${row.rowIndex} از فایل ${fileName}`;


          const acceptedQuantity = legacyMovements
            .filter(
              (movement) =>
                movement.description === expectedDescription &&
                sameValue(movement.productName, row.name) &&
                toNumber(movement.unitPrice) === row.unitPrice,
            )
            .reduce(
              (sum, movement) =>
                sum + toNumber(movement.quantity),
              0,
            );


          return { ...row, acceptedQuantity };
        });


        if (
          progressRows.reduce(
            (sum, row) => sum + row.acceptedQuantity,
            0,
          ) !== recoveredQuantity ||
          progressRows.some(
            (row) => row.acceptedQuantity > row.quantity,
          )
        ) {
          return res.status(409).json({
            success: false,
            code: 'LEGACY_IMPORT_REVIEW_REQUIRED',
            error:
              'سابقه قدیمی با ردیف‌های فایل تطابق ندارد؛ ثبت مجدد برای جلوگیری از تکرار متوقف شد.',
          });
        }
      } else {
        progressRows = rows.map((row) => ({
          ...row,
          acceptedQuantity: 0,
        }));
      }


      if (
        progressRows.every(
          (row) => row.acceptedQuantity >= row.quantity,
        )
      ) {
        return res.status(409).json({
          success: false,
          code: 'FILE_ALREADY_COMPLETED',
          error:
            'تمام تعداد کالاهای این فایل قبلاً ثبت شده‌اند؛ کالای باقی‌مانده‌ای برای ثبت وجود ندارد.',
        });
      }


      const budget = getRepresentativeWarehouseBudget(
        representative,
      );


      const currentWarehouseValue =
        calculateWarehouseSummary(warehouse).storeItemsTotalValue;


      let remainingAmount = Math.max(
        0,
        budget.warehouseBudget - currentWarehouseValue,
      );


      const remainingWarehouseBudget = remainingAmount;
      const now = new Date().toISOString();


      let importedAmount = 0;
      let acceptedQuantity = 0;
      let acceptedRowsCount = 0;
      let createdCount = 0;
      let updatedCount = 0;


      const rowResults = [];


      for (const row of progressRows) {
        const previouslyAccepted = row.acceptedQuantity;
        const pendingQuantity =
          row.quantity - previouslyAccepted;


        if (pendingQuantity <= 0) {
          rowResults.push({
            ...row,
            previouslyAcceptedQuantity: previouslyAccepted,
            acceptedNowQuantity: 0,
            remainingQuantity: 0,
            status: 'already_completed',
            reason: 'این ردیف قبلاً به‌طور کامل ثبت شده است.',
          });
          continue;
        }


        const availableBeforeRow = remainingAmount;
        const itemIndex = findWarehouseItem(warehouse, row);
        const previousItem =
          itemIndex >= 0 ? warehouse.items[itemIndex] : null;


        const oldQuantity = previousItem
          ? Math.max(0, toNumber(previousItem.quantity))
          : 0;


        const oldUnitPrice = previousItem
          ? Math.max(0, toNumber(previousItem.unitPrice))
          : 0;


        // ارزش موجودی قبلی نیز با قیمت جدید محاسبه می‌شود.
        const repricingChange =
          oldQuantity * (row.unitPrice - oldUnitPrice);


        const affordableQuantity = Math.max(
          0,
          Math.floor(
            (remainingAmount - repricingChange) / row.unitPrice,
          ),
        );


        const acceptedNowQuantity = Math.min(
          pendingQuantity,
          affordableQuantity,
        );


        let reason = '';


        if (acceptedNowQuantity > 0) {
          const nextQuantity =
            oldQuantity + acceptedNowQuantity;


          const savedItem = {
            ...(previousItem || {}),
            id: previousItem?.id || createRandomId(),
            productId:
              previousItem?.productId ||
              row.productId ||
              createRandomId(),
            productName: row.name,
            brand: row.brand,
            category: row.category,
            quantity: nextQuantity,
            unitPrice: row.unitPrice,
            totalPrice: nextQuantity * row.unitPrice,
            minimumStock: Math.max(
              0,
              toNumber(previousItem?.minimumStock),
            ),
            status: getWarehouseStatus(
              nextQuantity,
              previousItem?.minimumStock,
            ),
            lastUpdated: now,
          };


          if (itemIndex >= 0) {
            warehouse.items[itemIndex] = savedItem;
            updatedCount += 1;
          } else {
            warehouse.items.push(savedItem);
            createdCount += 1;
          }


          const rowAmount =
            acceptedNowQuantity * row.unitPrice;


          remainingAmount -= rowAmount + repricingChange;
          importedAmount += rowAmount;
          acceptedQuantity += acceptedNowQuantity;
          acceptedRowsCount += 1;
          row.acceptedQuantity += acceptedNowQuantity;


          warehouse.movements.unshift({
            id: createRandomId(),
            representativeId: String(representative.id),
            requestId,
            fileName,
            rowIndex: row.rowIndex,
            productId: savedItem.productId,
            productName: savedItem.productName,
            brand: savedItem.brand,
            category: savedItem.category,
            type: 'in',
            quantity: acceptedNowQuantity,
            originalQuantity: row.quantity,
            rejectedQuantity:
              row.quantity - row.acceptedQuantity,
            unitPrice: row.unitPrice,
            rowTotal: rowAmount,
            reason: 'ورود کالا از Excel',
            description:
              `ردیف ${row.rowIndex} از فایل ${fileName}`,
            createdAt: now,
          });
        }


        const pendingAfter =
          row.quantity - row.acceptedQuantity;


        if (pendingAfter > 0) {
          reason =
            budget.warehouseBudget <= 0
              ? 'سقف مالی نماینده صفر یا نامعتبر است.'
              : acceptedNowQuantity > 0
                ? 'فقط بخشی از تعداد ثبت شد؛ سقف مالی برای باقی‌مانده کافی نیست.'
                : 'سقف مالی باقی‌مانده برای ثبت این کالا و تغییر ارزش موجودی قبلی کافی نیست.';
        } else {
          reason = 'تعداد باقی‌مانده این ردیف ثبت شد.';
        }


        rowResults.push({
          ...row,
          previouslyAcceptedQuantity: previouslyAccepted,
          acceptedNowQuantity,
          remainingQuantity: pendingAfter,
          availableBudgetBeforeRow: availableBeforeRow,
          unitPrice: row.unitPrice,
          repricingChange,
          status:
            pendingAfter === 0
              ? 'completed'
              : acceptedNowQuantity > 0
                ? 'partial'
                : 'budget_exceeded',
          reason,
        });
      }


      const rejectedItems = rowResults
        .filter((row) => row.remainingQuantity > 0)
        .map((row) => ({
          ...row,
          rejectedQuantity: row.remainingQuantity,
        }));


      const rejectedQuantity = rejectedItems.reduce(
        (sum, row) => sum + row.remainingQuantity,
        0,
      );


      const resultData = {
        ...budget,
        currentWarehouseValue,
        remainingWarehouseBudget,
        importedAmount,
        remainingAmount,
        requestedRowsCount: rows.length,
        acceptedRowsCount,
        importedCount: acceptedRowsCount,
        acceptedQuantity,
        rejectedRowsCount: rejectedItems.length,
        rejectedQuantity,
        createdCount,
        updatedCount,
        rowResults,
        rejectedItems,
        completed: rejectedItems.length === 0,
        summary: calculateWarehouseSummary(warehouse),
      };


      if (acceptedQuantity === 0) {
        return res.status(400).json({
          success: false,
          code: 'WAREHOUSE_BUDGET_EXCEEDED',
          error:
            'هیچ کالای جدیدی ثبت نشد؛ سقف مالی باقی‌مانده کافی نیست. پس از افزایش سقف، همین فایل را دوباره ارسال کنید.',
          data: resultData,
        });
      }


      const fileRecord = {
        ...(previousFile || {}),
        requestId,
        fileName,
        createdAt: previousFile?.createdAt || now,
        updatedAt: now,
        requestedRowsCount: rows.length,
        requestedQuantity: rows.reduce(
          (sum, row) => sum + row.quantity,
          0,
        ),
        acceptedRowsCount: progressRows.filter(
          (row) => row.acceptedQuantity > 0,
        ).length,
        acceptedQuantity: progressRows.reduce(
          (sum, row) => sum + row.acceptedQuantity,
          0,
        ),
        rejectedRowsCount: rejectedItems.length,
        rejectedQuantity,
        importedAmount:
          toNumber(previousFile?.importedAmount) + importedAmount,
        completed: rejectedItems.length === 0,
        rows: progressRows,
      };


      const fileIndex = warehouse.importedFiles.findIndex(
        (item) => item.requestId === requestId,
      );


      if (fileIndex >= 0) {
        warehouse.importedFiles[fileIndex] = fileRecord;
      } else {
        warehouse.importedFiles.unshift(fileRecord);
      }


      warehouse.updatedAt = now;


      if (!writeRepresentativeWarehouses(warehouses)) {
        throw new Error('ذخیره اطلاعات انبار ناموفق بود.');
      }


      const summarySaved = updateRepresentativeWarehouseSummary(
        representative.id,
        warehouse,
      );


      const message = rejectedItems.length
        ? `${acceptedRowsCount} ردیف و ${acceptedQuantity} قطعه ثبت شد؛ ${rejectedQuantity} قطعه به‌دلیل سقف مالی باقی ماند. پس از افزایش سقف، همین فایل را دوباره ارسال کنید.`
        : `${acceptedRowsCount} ردیف و ${acceptedQuantity} قطعه ثبت شد؛ این فایل اکنون به‌طور کامل ثبت شده است.`;


      return res.status(201).json({
        success: true,
        code: rejectedItems.length
          ? 'IMPORT_PARTIAL'
          : 'IMPORT_COMPLETED',
        message,
        warning: summarySaved
          ? undefined
          : 'کالاها ذخیره شدند، اما خلاصه نماینده بروزرسانی نشد.',
        data: {
          ...resultData,
          summarySaved,
        },
      });
    } catch (error) {
      return sendServerError(
        res,
        error,
        'خطا در ثبت اکسل انبار.',
      );
    }
  },
);


router.post(
  '/:id/warehouse/movements',
  requireAdmin,
  (req, res) => {
    try {
      const representative = findRepresentative(
        readRepresentatives(),
        req.params.id,
      );


      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'نماینده موردنظر پیدا نشد.',
        });
      }


      const body = req.body || {};
      const type = body.type === 'out' ? 'out' : 'in';
      const productId = normalizeValue(body.productId);
      const quantity = toNumber(body.quantity);
      const minimumStock = Math.max(
        0,
        toNumber(body.minimumStock, 5),
      );


      if (!productId || quantity <= 0) {
        return res.status(400).json({
          success: false,
          error: 'محصول و تعداد معتبر الزامی هستند.',
        });
      }


      const product = readProducts().find((item) =>
        sameValue(item.id, productId),
      );


      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'محصول موردنظر پیدا نشد.',
        });
      }


      const warehouses = readRepresentativeWarehouses();
      const { warehouse } = getOrCreateWarehouse(
        warehouses,
        representative.id,
      );


      const index = warehouse.items.findIndex((item) =>
        sameValue(item.productId, productId),
      );


      const oldItem = index >= 0 ? warehouse.items[index] : null;
      const oldQuantity = toNumber(oldItem?.quantity);


      if (
        type === 'out' &&
        (!oldItem || quantity > oldQuantity)
      ) {
        return res.status(400).json({
          success: false,
          error: `موجودی کافی نیست. موجودی فعلی: ${oldQuantity}`,
        });
      }


      const requestedPrice = toNumber(body.unitPrice);


      const unitPrice =
        type === 'out'
          ? toNumber(oldItem.unitPrice)
          : requestedPrice > 0
            ? requestedPrice
            : toNumber(product.price);


      if (type === 'in' && unitPrice <= 0) {
        return res.status(400).json({
          success: false,
          error: 'قیمت محصول معتبر نیست.',
        });
      }


      const now = new Date().toISOString();
      const nextQuantity =
        type === 'in'
          ? oldQuantity + quantity
          : oldQuantity - quantity;


      const savedItem = {
        ...(oldItem || {}),
        id: oldItem?.id || createRandomId(),
        productId: String(product.id),
        productName: cleanText(product.name),
        brand: cleanText(oldItem?.brand || product.brand),
        category: cleanText(oldItem?.category || product.category),
        quantity: nextQuantity,
        unitPrice,
        totalPrice: nextQuantity * unitPrice,
        minimumStock:
          type === 'out'
            ? toNumber(oldItem.minimumStock)
            : minimumStock,
        lastUpdated: now,
      };


      savedItem.status = getWarehouseStatus(
        nextQuantity,
        savedItem.minimumStock,
      );


      if (index >= 0) {
        warehouse.items[index] = savedItem;
      } else {
        warehouse.items.push(savedItem);
      }


      const movement = {
        id: createRandomId(),
        representativeId: String(representative.id),
        productId: String(product.id),
        productName: savedItem.productName,
        brand: savedItem.brand,
        category: savedItem.category,
        type,
        quantity,
        unitPrice,
        rowTotal: quantity * unitPrice,
        reason: cleanText(
          body.reason,
          type === 'in' ? 'ورود کالا' : 'خروج کالا',
        ),
        description: cleanText(body.description),
        createdAt: now,
      };


      warehouse.movements.unshift(movement);
      warehouse.updatedAt = now;


      if (!writeRepresentativeWarehouses(warehouses)) {
        throw new Error('ذخیره گردش انبار ناموفق بود.');
      }


      const summarySaved = updateRepresentativeWarehouseSummary(
        representative.id,
        warehouse,
      );


      return res.status(201).json({
        success: true,
        message:
          type === 'in'
            ? 'ورود کالا ثبت شد.'
            : 'خروج کالا ثبت شد.',
        data: {
          item: savedItem,
          movement,
          summary: calculateWarehouseSummary(warehouse),
          summarySaved,
        },
      });
    } catch (error) {
      return sendServerError(
        res,
        error,
        'خطا در ثبت گردش انبار.',
      );
    }
  },
);


router.delete(
  '/:id/warehouse/items/:itemId',
  requireAdmin,
  (req, res) => {
    try {
      const representative = findRepresentative(
        readRepresentatives(),
        req.params.id,
      );


      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'نماینده موردنظر پیدا نشد.',
        });
      }


      const warehouses = readRepresentativeWarehouses();
      const { warehouse } = getOrCreateWarehouse(
        warehouses,
        representative.id,
      );


      const index = warehouse.items.findIndex((item) =>
        sameValue(item.id, req.params.itemId),
      );


      if (index < 0) {
        return res.status(404).json({
          success: false,
          error: 'کالا در انبار پیدا نشد.',
        });
      }


      const deletedItem = warehouse.items.splice(index, 1)[0];


      if (deletedItem.productId) {
        warehouse.movements = warehouse.movements.filter(
          (movement) =>
            !sameValue(movement.productId, deletedItem.productId),
        );
      }


      warehouse.updatedAt = new Date().toISOString();


      if (!writeRepresentativeWarehouses(warehouses)) {
        throw new Error('ذخیره حذف کالا ناموفق بود.');
      }


      const summarySaved = updateRepresentativeWarehouseSummary(
        representative.id,
        warehouse,
      );


      return res.json({
        success: true,
        message: 'کالا از انبار حذف شد.',
        data: {
          deletedItem,
          summary: calculateWarehouseSummary(warehouse),
          summarySaved,
        },
      });
    } catch (error) {
      return sendServerError(res, error, 'خطا در حذف کالا.');
    }
  },
);


router.delete(
  '/:id/warehouse',
  requireAdmin,
  (req, res) => {
    try {
      const representative = findRepresentative(
        readRepresentatives(),
        req.params.id,
      );


      if (!representative) {
        return res.status(404).json({
          success: false,
          error: 'نماینده موردنظر پیدا نشد.',
        });
      }


      const warehouses = readRepresentativeWarehouses();
      const { warehouse } = getOrCreateWarehouse(
        warehouses,
        representative.id,
      );


      const deletedItemsCount = warehouse.items.length;
      const deletedMovementsCount = warehouse.movements.length;


      warehouse.items = [];
      warehouse.movements = [];
      warehouse.importedFiles = [];
      warehouse.updatedAt = new Date().toISOString();


      if (!writeRepresentativeWarehouses(warehouses)) {
        throw new Error('ذخیره حذف کل موجودی ناموفق بود.');
      }


      const summarySaved = updateRepresentativeWarehouseSummary(
        representative.id,
        warehouse,
      );


      return res.json({
        success: true,
        message: 'کل موجودی انبار نماینده حذف شد.',
        data: {
          deletedItemsCount,
          deletedMovementsCount,
          summary: calculateWarehouseSummary(warehouse),
          summarySaved,
        },
      });
    } catch (error) {
      return sendServerError(
        res,
        error,
        'خطا در حذف کل موجودی.',
      );
    }
  },
);


module.exports = router;
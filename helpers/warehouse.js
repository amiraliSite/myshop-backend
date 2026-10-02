const {
  readWarehouse,
  writeWarehouse,
} = require('./jsonStorage');

const {
  normalizeValue,
  toEnglishDigits,
  createRandomId,
} = require('./values');

/*
  تبدیل مقدار قیمت به عدد.

  ورودی‌های پشتیبانی‌شده:
  250000
  "250,000"
  "250٬000"
  "۲۵۰٬۰۰۰"
  "۲۵۰,۰۰۰ تومان"
  "1,250,000 ریال"

  خروجی:
  250000
  1250000
*/
function parsePrice(value, fallback = 0) {
  if (value === null || value === undefined) {
    return fallback;
  }

  /*
    اگر Excel مقدار قیمت را عددی ارسال کرده باشد،
    نیازی به تبدیل متن نداریم.
  */
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  }

  /*
    تبدیل ارقام فارسی و عربی به انگلیسی،
    حذف کاماهای فارسی و انگلیسی،
    حذف تومان، ریال و هر متن اضافی.
  */
  const normalizedValue = String(
    toEnglishDigits(String(value)),
  )
    .replace(/[٬،,]/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim();

  if (!normalizedValue) {
    return fallback;
  }

  const price = Number(normalizedValue);

  return Number.isFinite(price) && price >= 0
    ? price
    : fallback;
}

/*
  تبدیل موجودی به عدد.

  این تابع برای اطمینان از سالم‌بودن مقدار موجودی انبار استفاده می‌شود.
*/
function parseQuantity(value, fallback = 0) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  }

  const normalizedValue = String(
    toEnglishDigits(String(value)),
  )
    .replace(/[٬،,]/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim();

  if (!normalizedValue) {
    return fallback;
  }

  const quantity = Number(normalizedValue);

  return Number.isFinite(quantity) && quantity >= 0
    ? quantity
    : fallback;
}

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ''
  );
}

function getProductName(product) {
  return String(
    product?.name ||
      product?.productName ||
      product?.title ||
      '',
  ).trim();
}

function getProductCode(product) {
  return String(
    product?.code ||
      product?.productCode ||
      product?.sku ||
      '',
  ).trim();
}

function getProductPrice(product) {
  const rawPrice =
    product?.price ??
    product?.salePrice ??
    product?.unitPrice ??
    0;

  return parsePrice(rawPrice, 0);
}

/*
  پیدا کردن کالا در انبار مرکزی.

  ترتیب جستجو:
  1. productId
  2. code
  3. name
*/
function findWarehouseItemIndex(warehouse, product) {
  const productId = String(product?.id || '').trim();

  const productCode = normalizeValue(
    getProductCode(product),
  );

  const productName = normalizeValue(
    getProductName(product),
  );

  return warehouse.findIndex((item) => {
    const itemProductId = String(
      item?.productId || '',
    ).trim();

    const itemCode = normalizeValue(
      item?.code ||
        item?.productCode ||
        item?.sku ||
        '',
    );

    const itemName = normalizeValue(
      item?.name ||
        item?.productName ||
        item?.title ||
        '',
    );

    if (productId && itemProductId === productId) {
      return true;
    }

    if (
      productCode &&
      itemCode &&
      itemCode === productCode
    ) {
      return true;
    }

    if (
      productName &&
      itemName &&
      itemName === productName
    ) {
      return true;
    }

    return false;
  });
}

/*
  همگام‌سازی محصول با انبار مرکزی.

  رفتار:
  - اگر محصول قبلاً در انبار وجود داشته باشد:
    نام، کد، قیمت و وضعیت active به‌روز می‌شوند.
    موجودی قبلی انبار حفظ می‌شود.

  - اگر محصول در انبار وجود نداشته باشد:
    یک آیتم جدید با موجودی صفر ایجاد می‌شود.

  - اگر قیمت جدید خالی یا نامعتبر باشد:
    قیمت قدیمی انبار حفظ می‌شود تا صفر به‌اشتباه جایگزین نشود.
*/
function syncProductToWarehouse(product) {
  if (!product || typeof product !== 'object') {
    return null;
  }

  const productName = getProductName(product);

  if (!productName) {
    return null;
  }

  const warehouse = readWarehouse();

  const warehouseIndex = findWarehouseItemIndex(
    warehouse,
    product,
  );

  const now = new Date().toISOString();

  const productId = String(product.id || '').trim();

  const productCode = getProductCode(product);

  const rawProductPrice =
    product?.price ??
    product?.salePrice ??
    product?.unitPrice;

  const hasProductPrice = hasValue(rawProductPrice);

  /*
    محصول در انبار قبلاً وجود دارد.
  */
  if (warehouseIndex >= 0) {
    const oldItem = warehouse[warehouseIndex];

    const oldPrice = parsePrice(
      oldItem?.price,
      0,
    );

    /*
      قیمت جدید فقط زمانی جایگزین می‌شود که واقعاً
      در محصول وجود داشته باشد.
    */
    const updatedPrice = hasProductPrice
      ? parsePrice(rawProductPrice, oldPrice)
      : oldPrice;

    const oldQuantity =
      oldItem?.quantity ??
      oldItem?.stock ??
      0;

    const updatedItem = {
      ...oldItem,

      productId:
        productId ||
        oldItem.productId ||
        '',

      name: productName,

      code:
        productCode ||
        oldItem.code ||
        '',

      price: updatedPrice,

      /*
        موجودی انبار را با آپلود لیست قیمت تغییر نمی‌دهیم.
      */
      quantity: parseQuantity(
        oldQuantity,
        0,
      ),

      active:
        product.active !== false,

      updatedAt: now,
    };

    warehouse[warehouseIndex] = updatedItem;

    writeWarehouse(warehouse);

    return updatedItem;
  }

  /*
    محصول جدید است و هنوز در انبار مرکزی وجود ندارد.
  */
  const newPrice = hasProductPrice
    ? parsePrice(rawProductPrice, 0)
    : 0;

  const newWarehouseItem = {
    id: createRandomId(),

    productId,

    name: productName,

    code: productCode,

    price: newPrice,

    /*
      آپلود فایل قیمت موجودی انبار را تغییر نمی‌دهد.
    */
    quantity: 0,

    active:
      product.active !== false,

    createdAt: now,

    updatedAt: now,
  };

  warehouse.push(newWarehouseItem);

  writeWarehouse(warehouse);

  return newWarehouseItem;
}

/*
  محصول را از انبار حذف فیزیکی نمی‌کند.

  فقط آن را غیرفعال می‌کند تا داده‌های قبلی مانند
  فروش، ارسال بار و گزارش‌های انبار سالم بمانند.
*/
function deactivateWarehouseItem(productId) {
  const id = String(productId || '').trim();

  if (!id) {
    return null;
  }

  const warehouse = readWarehouse();

  const itemIndex = warehouse.findIndex((item) => {
    return String(item?.productId || '').trim() === id;
  });

  if (itemIndex < 0) {
    return null;
  }

  const updatedItem = {
    ...warehouse[itemIndex],

    active: false,

    updatedAt: new Date().toISOString(),
  };

  warehouse[itemIndex] = updatedItem;

  writeWarehouse(warehouse);

  return updatedItem;
}

/*
  محاسبه خلاصه انبار مرکزی.

  فقط آیتم‌های فعال در آمار محاسبه می‌شوند.
*/
function getWarehouseSummary() {
  const warehouse = readWarehouse();

  const items = warehouse.filter((item) => {
    return item.active !== false;
  });

  const totalQuantity = items.reduce((sum, item) => {
    return sum + parseQuantity(
      item?.quantity ??
        item?.stock ??
        0,
      0,
    );
  }, 0);

  const totalValue = items.reduce((sum, item) => {
    const quantity = parseQuantity(
      item?.quantity ??
        item?.stock ??
        0,
      0,
    );

    const price = parsePrice(
      item?.price ??
        item?.salePrice ??
        item?.unitPrice ??
        0,
      0,
    );

    return sum + quantity * price;
  }, 0);

  return {
    totalItems: items.length,
    totalQuantity,
    totalValue,
  };
}

module.exports = {
  parsePrice,
  parseQuantity,

  getProductName,
  getProductCode,
  getProductPrice,

  findWarehouseItemIndex,
  syncProductToWarehouse,
  deactivateWarehouseItem,
  getWarehouseSummary,
};
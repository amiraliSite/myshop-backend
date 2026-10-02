const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const {
  readProducts,
  writeProducts,
} = require('../helpers/jsonStorage');

const {
  toEnglishDigits,
  normalizeValue,
  createRandomId,
} = require('../helpers/values');

const {
  syncProductToWarehouse,
  deactivateWarehouseItem,
} = require('../helpers/warehouse');

const router = express.Router();

const excelUpload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 10 * 1024 * 1024,
  },

  fileFilter: (_req, file, callback) => {
    const fileName = String(
      file?.originalname || '',
    ).toLowerCase();

    const isExcelFile =
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls');

    if (!isExcelFile) {
      callback(
        new Error(
          'فقط فایل‌های اکسل با فرمت .xlsx یا .xls قابل آپلود هستند.',
        ),
      );

      return;
    }

    callback(null, true);
  },
});

function hasValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ''
  );
}

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();

  return text || fallback;
}

/*
  تبدیل قیمت به عدد.

  اگر قیمت خالی، نامعتبر یا غیرعددی باشد:
  مقدار 0 برمی‌گرداند.

  بنابراین تمام محصولاتی که عنوان دارند ثبت می‌شوند،
  حتی اگر قیمت در Excel خالی باشد.
*/
function parsePrice(value, fallback = 0) {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  const normalizedValue = String(
    toEnglishDigits(String(value)),
  )
    .replace(/[٬،,\s]/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim();

  if (!normalizedValue) {
    return fallback;
  }

  const price = Number(normalizedValue);

  return Number.isFinite(price)
    ? price
    : fallback;
}

function normalizeExcelHeader(value) {
  return String(
    toEnglishDigits(String(value ?? '')),
  )
    .replace(/\u200c/g, ' ')
    .replace(/\u200f/g, '')
    .replace(/\u200e/g, '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/[ـ_()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getExcelColumnValue(row, expectedHeaders = []) {
  const entries = Object.entries(row || {});

  /*
    تطبیق دقیق.
  */
  for (const expectedHeader of expectedHeaders) {
    const expected = normalizeExcelHeader(
      expectedHeader,
    );

    const found = entries.find(([key]) => {
      return normalizeExcelHeader(key) === expected;
    });

    if (found) {
      /*
        اینجا حتی اگر مقدار سلول خالی یا صفر باشد، برگردانده می‌شود.
      */
      return found[1];
    }
  }

  /*
    تطبیق منعطف.

    مثال:
    قیمت محصول (تومان)
    با
    قیمت محصول
    تطبیق دارد.
  */
  for (const expectedHeader of expectedHeaders) {
    const expected = normalizeExcelHeader(
      expectedHeader,
    );

    const found = entries.find(([key]) => {
      const header = normalizeExcelHeader(key);

      if (
        expected.length < 2 ||
        header.length < 2
      ) {
        return false;
      }

      return (
        header.includes(expected) ||
        expected.includes(header)
      );
    });

    if (found) {
      return found[1];
    }
  }

  return '';
}

/*
  تبدیل یک ردیف Excel به شکل محصول.

  ستون‌های اصلی:

  عنوان محصول
  قیمت محصول
  دسته‌بندی
*/
function mapExcelRowToProduct(row) {
  return {
    name: getExcelColumnValue(row, [
      'عنوان محصول',
      'عنوان کالا',
      'نام محصول',
      'نام کالا',
      'نام',
      'title',
      'name',
      'productName',
    ]),

    price: getExcelColumnValue(row, [
      'قیمت محصول',
      'قیمت محصول تومان',
      'قیمت کالا',
      'قیمت فروش',
      'قیمت مصرف‌کننده',
      'قیمت مصرف کننده',
      'قیمت',
      'مبلغ',
      'نرخ',
      'فی',
      'price',
      'salePrice',
      'unitPrice',
    ]),

    category: getExcelColumnValue(row, [
      'دسته‌بندی',
      'دسته بندی',
      'دسته‌بندي',
      'دسته بندي',
      'دسته',
      'گروه',
      'گروه کالا',
      'category',
    ]),
  };
}

function getProductName(product) {
  return cleanText(
    product?.name ||
      product?.productName ||
      product?.title ||
      '',
  );
}

function findProductIndexByName(products, productName) {
  const normalizedName = normalizeValue(productName);

  if (!normalizedName) {
    return -1;
  }

  return products.findIndex((product) => {
    return (
      normalizeValue(getProductName(product)) ===
      normalizedName
    );
  });
}

function createProduct({
  name,
  price,
  category,
}) {
  const now = new Date().toISOString();

  return {
    id: createRandomId(),

    name: cleanText(name),

    code: '',

    price: parsePrice(price, 0),

    quantity: 0,

    category: cleanText(category),

    description: '',

    image: '',

    active: true,

    createdAt: now,

    updatedAt: now,
  };
}

function updateProduct(
  oldProduct,
  {
    name,
    price,
    category,
  },
) {
  return {
    ...oldProduct,

    name: cleanText(name, oldProduct.name),

    /*
      قیمت جدید جایگزین قیمت قبلی می‌شود.
      اگر قیمت Excel خالی باشد، قیمت محصول صفر می‌شود.
    */
    price: parsePrice(price, 0),

    category: cleanText(
      category,
      oldProduct.category || '',
    ),

    active: oldProduct.active !== false,

    updatedAt: new Date().toISOString(),
  };
}

/*
  آپلود Excel و ثبت قیمت‌ها.

  POST /api/products/upload
*/
router.post(
  '/upload',
  excelUpload.single('file'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error:
            'فایل دریافت نشد. نام فیلد فایل باید file باشد.',
        });
      }

      const workbook = XLSX.read(req.file.buffer, {
        type: 'buffer',
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        return res.status(400).json({
          success: false,
          error:
            'فایل Excel هیچ Sheet قابل‌خواندنی ندارد.',
        });
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const excelRows = XLSX.utils.sheet_to_json(
        worksheet,
        {
          defval: '',
          raw: true,
        },
      );

      if (!excelRows.length) {
        return res.status(400).json({
          success: false,
          error:
            'فایل Excel خالی است یا ردیف قابل‌خواندن ندارد.',
        });
      }

      const products = readProducts();

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let zeroPriceCount = 0;
      let skippedCount = 0;

      const errors = [];

      excelRows.forEach((excelRow, index) => {
        const rowNumber = index + 2;

        try {
          const rowData = mapExcelRowToProduct(excelRow);

          const name = cleanText(rowData.name);

          const category = cleanText(
            rowData.category,
          );

          /*
            قیمت خالی، غیرعددی یا صفر:
            همگی در نهایت 0 می‌شوند.
          */
          const price = parsePrice(
            rowData.price,
            0,
          );

          /*
            فقط محصولی که عنوان ندارد رد می‌شود.
          */
          if (!name) {
            skippedCount += 1;

            errors.push({
              row: rowNumber,
              error:
                'عنوان محصول خالی است و این ردیف ثبت نشد.',
            });

            return;
          }

          /*
            آمار محصولاتی که قیمت صفر دارند.
          */
          if (price === 0) {
            zeroPriceCount += 1;
          }

          const productIndex = findProductIndexByName(
            products,
            name,
          );

          /*
            محصول جدید.
          */
          if (productIndex < 0) {
            const newProduct = createProduct({
              name,
              price,
              category,
            });

            products.push(newProduct);

            syncProductToWarehouse(newProduct);

            createdCount += 1;

            return;
          }

          const oldProduct = products[productIndex];

          const oldPrice = parsePrice(
            oldProduct.price,
            0,
          );

          const oldCategory = cleanText(
            oldProduct.category,
          );

          /*
            محصول تکراری با اطلاعات دقیقاً مشابه.
          */
          if (
            oldPrice === price &&
            oldCategory === category
          ) {
            unchangedCount += 1;

            return;
          }

          /*
            محصول با قیمت یا دسته‌بندی جدید.

            اگر قیمت Excel خالی باشد، قیمت قبلی به 0 تغییر می‌کند.
          */
          const updatedProduct = updateProduct(
            oldProduct,
            {
              name,
              price,
              category,
            },
          );

          products[productIndex] = updatedProduct;

          syncProductToWarehouse(updatedProduct);

          updatedCount += 1;
        } catch (rowError) {
          skippedCount += 1;

          errors.push({
            row: rowNumber,
            error:
              rowError?.message ||
              'خطا در پردازش این ردیف Excel.',
          });
        }
      });

      /*
        ذخیره محصولات در:

        backend/data/products.json
      */
      writeProducts(products);

      return res.status(200).json({
        success: true,
        message: 'فایل Excel با موفقیت پردازش شد.',

        data: {
          fileName: req.file.originalname,
          sheetName: firstSheetName,
          totalRows: excelRows.length,
          createdCount,
          updatedCount,
          unchangedCount,
          zeroPriceCount,
          skippedCount,
          totalProducts: products.length,
          errors,
        },
      });
    } catch (error) {
      console.error(
        'خطا در آپلود Excel:',
        error,
      );

      return res.status(500).json({
        success: false,
        error:
          error?.message ||
          'خطا در پردازش فایل Excel.',
      });
    }
  },
);

/*
  دریافت لیست محصولات.

  GET /api/products
*/
router.get('/', (_req, res) => {
  try {
    const products = readProducts();

    const sortedProducts = [...products].sort(
      (first, second) => {
        const firstDate = new Date(
          first.updatedAt ||
            first.createdAt ||
            0,
        ).getTime();

        const secondDate = new Date(
          second.updatedAt ||
            second.createdAt ||
            0,
        ).getTime();

        return secondDate - firstDate;
      },
    );

    return res.status(200).json({
      success: true,
      count: sortedProducts.length,
      data: sortedProducts,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'خطا در دریافت لیست محصولات.',
    });
  }
});

/*
  دریافت یک محصول.

  GET /api/products/:id
*/
router.get('/:id', (req, res) => {
  try {
    const productId = String(
      req.params.id || '',
    ).trim();

    const products = readProducts();

    const product = products.find((item) => {
      return String(item.id || '') === productId;
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'محصول پیدا نشد.',
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'خطا در دریافت محصول.',
    });
  }
});

/*
  ساخت دستی محصول.

  POST /api/products
*/
router.post('/', (req, res) => {
  try {
    const name = cleanText(
      req.body?.name ||
        req.body?.productName ||
        req.body?.title ||
        '',
    );

    const price = parsePrice(
      req.body?.price ??
        req.body?.salePrice ??
        req.body?.unitPrice,
      0,
    );

    const category = cleanText(
      req.body?.category,
    );

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'نام محصول الزامی است.',
      });
    }

    const products = readProducts();

    const productIndex = findProductIndexByName(
      products,
      name,
    );

    if (productIndex >= 0) {
      const updatedProduct = updateProduct(
        products[productIndex],
        {
          name,
          price,
          category,
        },
      );

      products[productIndex] = updatedProduct;

      writeProducts(products);

      syncProductToWarehouse(updatedProduct);

      return res.status(200).json({
        success: true,
        updated: true,
        message:
          'محصول قبلی به‌روزرسانی شد.',
        data: updatedProduct,
      });
    }

    const newProduct = createProduct({
      name,
      price,
      category,
    });

    products.push(newProduct);

    writeProducts(products);

    syncProductToWarehouse(newProduct);

    return res.status(201).json({
      success: true,
      created: true,
      message: 'محصول جدید ثبت شد.',
      data: newProduct,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'خطا در ثبت محصول.',
    });
  }
});

/*
  ویرایش محصول.

  PUT /api/products/:id
*/
router.put('/:id', (req, res) => {
  try {
    const productId = String(
      req.params.id || '',
    ).trim();

    const products = readProducts();

    const productIndex = products.findIndex((item) => {
      return String(item.id || '') === productId;
    });

    if (productIndex < 0) {
      return res.status(404).json({
        success: false,
        error: 'محصول پیدا نشد.',
      });
    }

    const oldProduct = products[productIndex];

    const name = cleanText(
      req.body?.name ||
        req.body?.productName ||
        req.body?.title ||
        oldProduct.name,
    );

    const price = parsePrice(
      req.body?.price ??
        req.body?.salePrice ??
        req.body?.unitPrice ??
        oldProduct.price,
      0,
    );

    const category = cleanText(
      req.body?.category,
      oldProduct.category || '',
    );

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'نام محصول الزامی است.',
      });
    }

    const duplicateIndex = products.findIndex(
      (item, index) => {
        if (index === productIndex) {
          return false;
        }

        return (
          normalizeValue(getProductName(item)) ===
          normalizeValue(name)
        );
      },
    );

    if (duplicateIndex >= 0) {
      return res.status(409).json({
        success: false,
        error:
          'محصول دیگری با همین نام وجود دارد.',
      });
    }

    const updatedProduct = updateProduct(
      oldProduct,
      {
        name,
        price,
        category,
      },
    );

    products[productIndex] = updatedProduct;

    writeProducts(products);

    syncProductToWarehouse(updatedProduct);

    return res.status(200).json({
      success: true,
      message: 'محصول با موفقیت ویرایش شد.',
      data: updatedProduct,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'خطا در ویرایش محصول.',
    });
  }
});

/*
  غیرفعال‌کردن محصول.

  DELETE /api/products/:id
*/
router.delete('/:id', (req, res) => {
  try {
    const productId = String(
      req.params.id || '',
    ).trim();

    const products = readProducts();

    const productIndex = products.findIndex((item) => {
      return String(item.id || '') === productId;
    });

    if (productIndex < 0) {
      return res.status(404).json({
        success: false,
        error: 'محصول پیدا نشد.',
      });
    }

    const deletedProduct = {
      ...products[productIndex],
      active: false,
      updatedAt: new Date().toISOString(),
    };

    products[productIndex] = deletedProduct;

    writeProducts(products);

    deactivateWarehouseItem(productId);

    return res.status(200).json({
      success: true,
      message: 'محصول غیرفعال شد.',
      data: deletedProduct,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'خطا در حذف محصول.',
    });
  }
});

module.exports = router;
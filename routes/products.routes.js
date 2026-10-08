const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');

const {
  readProducts,
  writeProducts,
  getFilePath,
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

    const valid =
      fileName.endsWith('.xlsx') ||
      fileName.endsWith('.xls');

    if (!valid) {
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

function cleanText(value, fallback = '') {
  const text = String(value ?? '').trim();

  return text || fallback;
}

function parsePrice(value, fallback = 0) {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : fallback;
  }

  const normalized = String(
    toEnglishDigits(String(value)),
  )
    .replace(/[٬،,\s]/g, '')
    .replace(/[^0-9.-]/g, '')
    .trim();

  if (!normalized) {
    return fallback;
  }

  const price = Number(normalized);

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

function getExcelColumnValue(
  row,
  expectedHeaders = [],
) {
  const entries = Object.entries(row || {});

  for (const expectedHeader of expectedHeaders) {
    const expected =
      normalizeExcelHeader(expectedHeader);

    const found = entries.find(([key]) => {
      return (
        normalizeExcelHeader(key) ===
        expected
      );
    });

    if (found) {
      return found[1];
    }
  }

  for (const expectedHeader of expectedHeaders) {
    const expected =
      normalizeExcelHeader(expectedHeader);

    const found = entries.find(([key]) => {
      const actual =
        normalizeExcelHeader(key);

      if (
        expected.length < 2 ||
        actual.length < 2
      ) {
        return false;
      }

      return (
        actual.includes(expected) ||
        expected.includes(actual)
      );
    });

    if (found) {
      return found[1];
    }
  }

  return '';
}

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

function findProductIndexByName(
  products,
  productName,
) {
  const normalizedName =
    normalizeValue(productName);

  if (!normalizedName) {
    return -1;
  }

  return products.findIndex((product) => {
    return (
      normalizeValue(
        getProductName(product),
      ) === normalizedName
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
    name: cleanText(
      name,
      oldProduct.name,
    ),
    price: parsePrice(price, 0),
    category: cleanText(
      category,
      oldProduct.category || '',
    ),
    active: true,
    updatedAt: new Date().toISOString(),
  };
}

function makeUploadData({
  fileName,
  sheetName,
  totalRows,
  createdCount,
  updatedCount,
  unchangedCount,
  zeroPriceCount,
  skippedCount,
  totalProducts,
  createdProducts,
  updatedProducts,
  unchangedProducts,
  skippedRows,
}) {
  return {
    fileName,
    sheetName,
    totalRows,
    createdCount,
    updatedCount,
    unchangedCount,
    zeroPriceCount,
    skippedCount,
    totalProducts,
    createdProducts,
    updatedProducts,
    unchangedProducts,
    skippedRows,
  };
}

/*
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

      const workbook = XLSX.read(
        req.file.buffer,
        {
          type: 'buffer',
        },
      );

      const sheetName =
        workbook.SheetNames[0];

      if (!sheetName) {
        return res.status(400).json({
          success: false,
          error:
            'فایل Excel هیچ Sheet قابل‌خواندنی ندارد.',
        });
      }

      const worksheet =
        workbook.Sheets[sheetName];

      const rows =
        XLSX.utils.sheet_to_json(
          worksheet,
          {
            defval: '',
            raw: true,
          },
        );

      if (!rows.length) {
        return res.status(400).json({
          success: false,
          error:
            'فایل Excel خالی است یا ردیف قابل‌خواندن ندارد.',
        });
      }

      const products = readProducts();

      if (!Array.isArray(products)) {
        return res.status(500).json({
          success: false,
          error:
            'ساختار فایل محصولات معتبر نیست.',
        });
      }

      const isFreshImport =
        products.length === 0;

      console.log('📊 وضعیت قبل از آپلود:', {
        productsBeforeUpload: products.length,
        isFreshImport,
        rowsInExcel: rows.length,
        productsFile: getFilePath('products'),
      });

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let zeroPriceCount = 0;
      let skippedCount = 0;

      const createdProducts = [];
      const updatedProducts = [];
      const unchangedProducts = [];
      const skippedRows = [];

      rows.forEach((row, index) => {
        const rowNumber = index + 2;

        try {
          const rowData =
            mapExcelRowToProduct(row);

          const name = cleanText(
            rowData.name,
          );

          const category = cleanText(
            rowData.category,
          );

          const price = parsePrice(
            rowData.price,
            0,
          );

          if (!name) {
            skippedCount += 1;

            skippedRows.push({
              row: rowNumber,
              reason:
                'عنوان محصول خالی است.',
            });

            return;
          }

          if (price === 0) {
            zeroPriceCount += 1;
          }

          const productIndex =
            isFreshImport
              ? -1
              : findProductIndexByName(
                  products,
                  name,
                );

          if (productIndex < 0) {
            const newProduct =
              createProduct({
                name,
                price,
                category,
              });

            products.push(newProduct);

            syncProductToWarehouse(
              newProduct,
            );

            createdCount += 1;

            createdProducts.push({
              row: rowNumber,
              id: newProduct.id,
              name: newProduct.name,
              price: newProduct.price,
              category: newProduct.category,
            });

            return;
          }

          const oldProduct =
            products[productIndex];

          const oldPrice = parsePrice(
            oldProduct.price,
            0,
          );

          const oldCategory = cleanText(
            oldProduct.category,
          );

          if (
            oldPrice === price &&
            oldCategory === category &&
            oldProduct.active !== false
          ) {
            unchangedCount += 1;

            unchangedProducts.push({
              row: rowNumber,
              id: oldProduct.id,
              name: getProductName(
                oldProduct,
              ),
              price: oldPrice,
              category: oldCategory,
            });

            return;
          }

          const updatedProduct =
            updateProduct(
              oldProduct,
              {
                name,
                price,
                category,
              },
            );

          products[productIndex] =
            updatedProduct;

          syncProductToWarehouse(
            updatedProduct,
          );

          updatedCount += 1;

          updatedProducts.push({
            row: rowNumber,
            id: updatedProduct.id,
            name: updatedProduct.name,
            oldPrice,
            newPrice: updatedProduct.price,
            oldCategory,
            newCategory:
              updatedProduct.category,
          });
        } catch (error) {
          skippedCount += 1;

          skippedRows.push({
            row: rowNumber,
            reason:
              error?.message ||
              'خطا در پردازش ردیف.',
          });
        }
      });

      const processedRows =
        createdCount +
        updatedCount +
        unchangedCount +
        skippedCount;

      const difference =
        rows.length - processedRows;

      console.log('📊 نتیجه کامل آپلود:', {
        totalRows: rows.length,
        createdCount,
        updatedCount,
        unchangedCount,
        skippedCount,
        processedRows,
        difference,
      });

      if (difference !== 0) {
        return res.status(500).json({
          success: false,
          error:
            'تعداد ردیف‌های پردازش‌شده با تعداد ردیف‌های Excel برابر نیست.',
          data: makeUploadData({
            fileName:
              req.file.originalname,
            sheetName,
            totalRows: rows.length,
            createdCount,
            updatedCount,
            unchangedCount,
            zeroPriceCount,
            skippedCount,
            totalProducts:
              products.filter(
                (product) =>
                  product.active !== false,
              ).length,
            createdProducts,
            updatedProducts,
            unchangedProducts,
            skippedRows,
          }),
        });
      }

      const hasChanges =
        createdCount > 0 ||
        updatedCount > 0;

      if (!hasChanges) {
        return res.status(400).json({
          success: false,
          error:
            unchangedCount > 0
              ? 'همه محصولات فایل از قبل وجود داشتند و تغییری نداشتند.'
              : 'هیچ محصولی از فایل ثبت نشد.',
          data: makeUploadData({
            fileName:
              req.file.originalname,
            sheetName,
            totalRows: rows.length,
            createdCount,
            updatedCount,
            unchangedCount,
            zeroPriceCount,
            skippedCount,
            totalProducts:
              products.filter(
                (product) =>
                  product.active !== false,
              ).length,
            createdProducts,
            updatedProducts,
            unchangedProducts,
            skippedRows,
          }),
        });
      }

      const writeResult =
        writeProducts(products);

      if (writeResult === false) {
        throw new Error(
          'ذخیره محصولات انجام نشد.',
        );
      }

      const savedProducts =
        readProducts();

      if (!Array.isArray(savedProducts)) {
        throw new Error(
          'محصولات ذخیره‌شده قابل خواندن نیستند.',
        );
      }

      if (
        savedProducts.length !==
        products.length
      ) {
        throw new Error(
          'تعداد محصولات ذخیره‌شده با تعداد مورد انتظار برابر نیست.',
        );
      }

      const activeProducts =
        savedProducts.filter(
          (product) =>
            product.active !== false,
        );

      console.log(
        '✅ نتیجه آپلود:',
        {
          createdCount,
          updatedCount,
          unchangedCount,
          skippedCount,
          totalProducts:
            activeProducts.length,
          productsFile:
            getFilePath('products'),
        },
      );

      return res.status(200).json({
        success: true,
        message:
          'فایل Excel با موفقیت پردازش و ذخیره شد.',
        data: makeUploadData({
          fileName:
            req.file.originalname,
          sheetName,
          totalRows: rows.length,
          createdCount,
          updatedCount,
          unchangedCount,
          zeroPriceCount,
          skippedCount,
          totalProducts:
            activeProducts.length,
          createdProducts,
          updatedProducts,
          unchangedProducts,
          skippedRows,
        }),
      });
    } catch (error) {
      console.error(
        '❌ خطا در آپلود Excel:',
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
  GET /api/products
*/
router.get('/', (_req, res) => {
  try {
    const products = readProducts();

    if (!Array.isArray(products)) {
      return res.status(500).json({
        success: false,
        error:
          'ساختار فایل محصولات معتبر نیست.',
      });
    }

    const activeProducts =
      products.filter(
        (product) =>
          product &&
          product.active !== false,
      );

    const sortedProducts = [
      ...activeProducts,
    ].sort((first, second) => {
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
    });

    return res.status(200).json({
      success: true,
      count: sortedProducts.length,
      data: sortedProducts,
    });
  } catch (error) {
    console.error(
      '❌ خطا در دریافت محصولات:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        'خطا در دریافت لیست محصولات.',
    });
  }
});

/*
  GET /api/products/:id
*/
router.get('/:id', (req, res) => {
  try {
    const productId = String(
      req.params.id || '',
    ).trim();

    const products = readProducts();

    const product = products.find((item) => {
      return (
        String(item.id || '') ===
          productId &&
        item.active !== false
      );
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
      error:
        'خطا در دریافت محصول.',
    });
  }
});

/*
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
        error:
          'نام محصول الزامی است.',
      });
    }

    const products = readProducts();

    const productIndex =
      findProductIndexByName(
        products,
        name,
      );

    if (productIndex >= 0) {
      const updatedProduct =
        updateProduct(
          products[productIndex],
          {
            name,
            price,
            category,
          },
        );

      products[productIndex] =
        updatedProduct;

      const writeResult =
        writeProducts(products);

      if (writeResult === false) {
        throw new Error(
          'ذخیره محصول انجام نشد.',
        );
      }

      syncProductToWarehouse(
        updatedProduct,
      );

      return res.status(200).json({
        success: true,
        updated: true,
        message:
          'محصول قبلی به‌روزرسانی شد.',
        data: updatedProduct,
      });
    }

    const newProduct =
      createProduct({
        name,
        price,
        category,
      });

    products.push(newProduct);

    const writeResult =
      writeProducts(products);

    if (writeResult === false) {
      throw new Error(
        'ذخیره محصول انجام نشد.',
      );
    }

    syncProductToWarehouse(
      newProduct,
    );

    return res.status(201).json({
      success: true,
      created: true,
      message:
        'محصول جدید ثبت شد.',
      data: newProduct,
    });
  } catch (error) {
    console.error(
      '❌ خطا در ثبت دستی محصول:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        'خطا در ثبت محصول.',
    });
  }
});

/*
  PUT /api/products/:id
*/
router.put('/:id', (req, res) => {
  try {
    const productId = String(
      req.params.id || '',
    ).trim();

    const products = readProducts();

    const productIndex =
      products.findIndex((item) => {
        return (
          String(item.id || '') ===
          productId
        );
      });

    if (productIndex < 0) {
      return res.status(404).json({
        success: false,
        error: 'محصول پیدا نشد.',
      });
    }

    const oldProduct =
      products[productIndex];

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
        error:
          'نام محصول الزامی است.',
      });
    }

    const duplicateIndex =
      products.findIndex(
        (item, index) => {
          if (index === productIndex) {
            return false;
          }

          return (
            normalizeValue(
              getProductName(item),
            ) === normalizeValue(name)
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

    const updatedProduct =
      updateProduct(
        oldProduct,
        {
          name,
          price,
          category,
        },
      );

    products[productIndex] =
      updatedProduct;

    const writeResult =
      writeProducts(products);

    if (writeResult === false) {
      throw new Error(
        'ذخیره ویرایش محصول انجام نشد.',
      );
    }

    syncProductToWarehouse(
      updatedProduct,
    );

    return res.status(200).json({
      success: true,
      message:
        'محصول با موفقیت ویرایش شد.',
      data: updatedProduct,
    });
  } catch (error) {
    console.error(
      '❌ خطا در ویرایش محصول:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        'خطا در ویرایش محصول.',
    });
  }
});

/*
  DELETE /api/products/:id
*/
router.delete('/:id', (req, res) => {
  try {
    const productId = String(
      req.params.id || '',
    ).trim();

    if (!productId) {
      return res.status(400).json({
        success: false,
        error:
          'شناسه محصول معتبر نیست.',
      });
    }

    const products = readProducts();

    if (!Array.isArray(products)) {
      return res.status(500).json({
        success: false,
        error:
          'ساختار فایل محصولات معتبر نیست.',
      });
    }

    const productIndex =
      products.findIndex((item) => {
        return (
          String(item?.id || '').trim() ===
          productId
        );
      });

    if (productIndex < 0) {
      return res.status(404).json({
        success: false,
        error: 'محصول پیدا نشد.',
      });
    }

    const deletedProduct =
      products[productIndex];

    const remainingProducts =
      products.filter(
        (_product, index) =>
          index !== productIndex,
      );

    const writeResult =
      writeProducts(remainingProducts);

    if (writeResult === false) {
      throw new Error(
        'ذخیره حذف محصول انجام نشد.',
      );
    }

    const savedProducts =
      readProducts();

    if (!Array.isArray(savedProducts)) {
      throw new Error(
        'محصولات پس از حذف قابل خواندن نیستند.',
      );
    }

    const stillExists =
      savedProducts.some((item) => {
        return (
          String(item?.id || '').trim() ===
          productId
        );
      });

    if (stillExists) {
      throw new Error(
        'محصول پس از حذف هنوز در فایل محصولات وجود دارد.',
      );
    }

    try {
      deactivateWarehouseItem(productId);
    } catch (warehouseError) {
      console.error(
        '⚠️ خطا در غیرفعال‌سازی کالا در انبار:',
        warehouseError,
      );
    }

    console.log(
      '✅ محصول واقعاً حذف شد:',
      {
        id: productId,
        name: getProductName(
          deletedProduct,
        ),
        remainingProducts:
          savedProducts.filter(
            (product) =>
              product.active !== false,
          ).length,
      },
    );

    return res.status(200).json({
      success: true,
      deleted: true,
      message:
        'محصول با موفقیت حذف شد.',
      data: {
        id: productId,
        name: getProductName(
          deletedProduct,
        ),
      },
      count:
        savedProducts.filter(
          (product) =>
            product.active !== false,
        ).length,
    });
  } catch (error) {
    console.error(
      '❌ خطا در حذف محصول:',
      error,
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        'خطا در حذف محصول.',
    });
  }
});

module.exports = router;
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

const FILES = {
  products: 'products.json',
  representatives: 'representatives.json',
  shipments: 'shipments.json',
  admins: 'admins.json',
  warehouse: 'warehouse.json',
  warehouseMovements: 'warehouseMovements.json',
  representativeWarehouses:
    'representativeWarehouses.json',
  returnRequests: 'returnRequests.json',
  salesReports: 'salesReports.json',
  representativeNotes:
    'representativeNotes.json',
  warranties: 'warranties.json',
};

function ensureDataFiles() {
  fs.mkdirSync(DATA_DIR, {
    recursive: true,
  });

  for (const fileName of Object.values(FILES)) {
    const filePath = path.join(
      DATA_DIR,
      fileName,
    );

    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(
        filePath,
        '[]\n',
        {
          encoding: 'utf8',
          flag: 'wx',
        },
      );
    }
  }

  return true;
}

function getFilePath(name) {
  const fileName = FILES[name];

  if (!fileName) {
    throw new Error(
      `فایل داده "${name}" تعریف نشده است.`,
    );
  }

  return path.join(DATA_DIR, fileName);
}

function readJson(name) {
  ensureDataFiles();

  const filePath = getFilePath(name);

  try {
    const content = fs.readFileSync(
      filePath,
      'utf8',
    );

    if (!content.trim()) {
      return [];
    }

    const data = JSON.parse(content);

    if (!Array.isArray(data)) {
      throw new Error(
        `محتوای فایل ${name} آرایه نیست.`,
      );
    }

    return data;
  } catch (error) {
    console.error(
      `❌ خطا در خواندن ${name}:`,
      error,
    );

    throw new Error(
      `فایل ${name} قابل خواندن نیست.`,
    );
  }
}

function writeJson(name, data) {
  if (!Array.isArray(data)) {
    throw new Error(
      `داده ${name} باید آرایه باشد.`,
    );
  }

  ensureDataFiles();

  const filePath = getFilePath(name);

  const temporaryPath = path.join(
    DATA_DIR,
    `.${FILES[name]}.${process.pid}.${Date.now()}.${Math.random()
      .toString(36)
      .slice(2)}.tmp`,
  );

  const content = `${JSON.stringify(
    data,
    null,
    2,
  )}\n`;

  try {
    fs.writeFileSync(
      temporaryPath,
      content,
      {
        encoding: 'utf8',
        flag: 'wx',
      },
    );

    fs.renameSync(
      temporaryPath,
      filePath,
    );

    const savedContent = fs.readFileSync(
      filePath,
      'utf8',
    );

    const savedData =
      JSON.parse(savedContent);

    if (!Array.isArray(savedData)) {
      throw new Error(
        `داده ذخیره‌شده ${name} آرایه نیست.`,
      );
    }

    if (
      savedData.length !== data.length
    ) {
      throw new Error(
        `تعداد داده‌های ذخیره‌شده ${name} صحیح نیست.`,
      );
    }

    console.log(
      `✅ ${name} ذخیره شد: ${filePath}`,
    );

    console.log(
      `📦 تعداد ${name}: ${savedData.length}`,
    );

    return true;
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) {
        fs.unlinkSync(temporaryPath);
      }
    } catch {
      // خطای حذف فایل موقت نادیده گرفته می‌شود
    }

    console.error(
      `❌ خطا در ذخیره ${name}:`,
      error,
    );

    throw error;
  }
}

const readProducts = () =>
  readJson('products');

const writeProducts = (data) =>
  writeJson('products', data);

const readRepresentatives = () =>
  readJson('representatives');

const writeRepresentatives = (data) =>
  writeJson('representatives', data);

const readShipments = () =>
  readJson('shipments');

const writeShipments = (data) =>
  writeJson('shipments', data);

const readAdmins = () =>
  readJson('admins');

const writeAdmins = (data) =>
  writeJson('admins', data);

const readWarehouse = () =>
  readJson('warehouse');

const writeWarehouse = (data) =>
  writeJson('warehouse', data);

const readWarehouseMovements = () =>
  readJson('warehouseMovements');

const writeWarehouseMovements = (
  data,
) =>
  writeJson(
    'warehouseMovements',
    data,
  );

const readRepresentativeWarehouses = () =>
  readJson('representativeWarehouses');

const writeRepresentativeWarehouses = (
  data,
) =>
  writeJson(
    'representativeWarehouses',
    data,
  );

const readReturnRequests = () =>
  readJson('returnRequests');

const writeReturnRequests = (
  data,
) =>
  writeJson(
    'returnRequests',
    data,
  );

const readSalesReports = () =>
  readJson('salesReports');

const writeSalesReports = (
  data,
) =>
  writeJson(
    'salesReports',
    data,
  );

const readRepresentativeNotes = () =>
  readJson('representativeNotes');

const writeRepresentativeNotes = (
  data,
) =>
  writeJson(
    'representativeNotes',
    data,
  );

const readNotes = () =>
  readJson('representativeNotes');

const writeNotes = (data) =>
  writeJson(
    'representativeNotes',
    data,
  );

const readWarranties = () =>
  readJson('warranties');

const writeWarranties = (data) =>
  writeJson(
    'warranties',
    data,
  );

console.log(
  '📁 مسیر ذخیره‌سازی:',
  DATA_DIR,
);

module.exports = {
  DATA_DIR,
  FILES,
  ensureDataFiles,
  getFilePath,
  readJson,
  writeJson,

  readProducts,
  writeProducts,

  readRepresentatives,
  writeRepresentatives,

  readShipments,
  writeShipments,

  readAdmins,
  writeAdmins,

  readWarehouse,
  writeWarehouse,

  readWarehouseMovements,
  writeWarehouseMovements,

  readRepresentativeWarehouses,
  writeRepresentativeWarehouses,

  readReturnRequests,
  writeReturnRequests,

  readSalesReports,
  writeSalesReports,

  readRepresentativeNotes,
  writeRepresentativeNotes,

  readNotes,
  writeNotes,

  readWarranties,
  writeWarranties,
};
const fs = require('fs');
const path = require('path');


const DATA_DIR = path.join(__dirname, '..', 'data');


const FILES = {
  products: 'products.json',
  representatives: 'representatives.json',
  shipments: 'shipments.json',
  admins: 'admins.json',
  warehouse: 'warehouse.json',
  warehouseMovements: 'warehouseMovements.json',
  representativeWarehouses: 'representativeWarehouses.json',
  returnRequests: 'returnRequests.json',
  salesReports: 'salesReports.json',
  representativeNotes: 'representativeNotes.json',
};


function ensureDataFiles() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });


    for (const fileName of Object.values(FILES)) {
      const filePath = path.join(DATA_DIR, fileName);


      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', {
          encoding: 'utf8',
          flag: 'wx',
        });
      }
    }


    return true;
  } catch (error) {
    console.error('خطا در آماده‌سازی فایل‌های داده:', error);
    return false;
  }
}


function getFilePath(name) {
  const fileName = FILES[name];


  if (!fileName) {
    throw new Error(`فایل دادهٔ "${name}" تعریف نشده است.`);
  }


  return path.join(DATA_DIR, fileName);
}


function readJson(name) {
  if (!ensureDataFiles()) {
    throw new Error('آماده‌سازی فایل‌های داده ناموفق بود.');
  }


  const filePath = getFilePath(name);
  const content = fs.readFileSync(filePath, 'utf8');


  if (!content.trim()) {
    throw new Error(`فایل ${name} خالی است؛ عملیات متوقف شد.`);
  }


  const data = JSON.parse(content);


  if (!Array.isArray(data)) {
    throw new Error(`محتوای ${name} آرایه نیست؛ عملیات متوقف شد.`);
  }


  return data;
}


function writeJson(name, data) {
  try {
    if (!Array.isArray(data)) {
      throw new Error(`دادهٔ ${name} باید آرایه باشد.`);
    }


    if (!ensureDataFiles()) {
      return false;
    }


    fs.writeFileSync(
      getFilePath(name),
      JSON.stringify(data, null, 2),
      'utf8',
    );


    return true;
  } catch (error) {
    console.error(`خطا در ذخیرهٔ ${name}:`, error);
    return false;
  }
}


const readProducts = () => readJson('products');
const writeProducts = (data) => writeJson('products', data);


const readRepresentatives = () => readJson('representatives');
const writeRepresentatives = (data) =>
  writeJson('representatives', data);


const readShipments = () => readJson('shipments');
const writeShipments = (data) => writeJson('shipments', data);


const readAdmins = () => readJson('admins');
const writeAdmins = (data) => writeJson('admins', data);


const readWarehouse = () => readJson('warehouse');
const writeWarehouse = (data) => writeJson('warehouse', data);


const readWarehouseMovements = () =>
  readJson('warehouseMovements');
const writeWarehouseMovements = (data) =>
  writeJson('warehouseMovements', data);


const readRepresentativeWarehouses = () =>
  readJson('representativeWarehouses');
const writeRepresentativeWarehouses = (data) =>
  writeJson('representativeWarehouses', data);


const readReturnRequests = () => readJson('returnRequests');
const writeReturnRequests = (data) =>
  writeJson('returnRequests', data);


const readSalesReports = () => readJson('salesReports');
const writeSalesReports = (data) =>
  writeJson('salesReports', data);


const readRepresentativeNotes = () =>
  readJson('representativeNotes');
const writeRepresentativeNotes = (data) =>
  writeJson('representativeNotes', data);


// توابع عمومی برای یادداشت‌ها (هم ادمین هم نماینده)
const readNotes = () => readJson('representativeNotes');
const writeNotes = (data) => writeJson('representativeNotes', data);


module.exports = {
  DATA_DIR,
  FILES,
  ensureDataFiles,
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
};
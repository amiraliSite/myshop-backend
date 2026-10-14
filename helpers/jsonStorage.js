const mongoose = require('mongoose');


const fs = require('fs');
const path = require('path');


const models = require('../models');


const DATA_DIR = path.join(
  __dirname,
  '..',
  'data',
);


const COLLECTION_MAP = {
  products: 'Product',
  representatives: 'Representative',
  shipments: 'Shipment',
  admins: 'Admin',
  warehouse: 'WarehouseItem',
  warehouseMovements: 'WarehouseMovement',
  representativeWarehouses:
    'RepresentativeWarehouse',
  returnRequests: 'ReturnRequest',
  salesReports: 'SalesReport',
  representativeNotes:
    'RepresentativeNote',
  warranties: 'Warranty',
};



const cache = {};



const writeQueues = {};



for (const name of Object.keys(
  COLLECTION_MAP,
)) {
  cache[name] = [];



  writeQueues[name] =
    Promise.resolve();
}



const ensureDataFiles = () => true;



const getFilePath = (name) => {
  if (!COLLECTION_MAP[name]) {
    throw new Error(
      `کلید داده "${name}" تعریف نشده است.`,
    );
  }



  return name;
};



const loadAllData = async () => {
  for (const [
    name,
    modelName,
  ] of Object.entries(COLLECTION_MAP)) {
    const Model = models[modelName];



    cache[name] =
      await Model.find({}).lean();



    console.log(
      `📦 ${name}: ${cache[name].length} رکورد از MongoDB بارگذاری شد.`,
    );
  }



  return true;
};



const readJson = (name) => {
  if (!COLLECTION_MAP[name]) {
    throw new Error(
      `کلید داده "${name}" تعریف نشده است.`,
    );
  }



  return cache[name];
};



const flush = (name) => {
  writeQueues[name] =
    writeQueues[name].then(
      async () => {
        const Model =
          models[
            COLLECTION_MAP[name]
          ];



        await Model.deleteMany({});



        if (cache[name].length > 0) {
          await Model.insertMany(
            cache[name],
          );
        }



        console.log(
          `💾 ${name} در MongoDB ذخیره شد (${cache[name].length} رکورد).`,
        );
      },
    ).catch((error) => {
      console.error(
        `❌ خطا در ذخیره ${name} در MongoDB:`,
        error.message,
      );
    });



  return writeQueues[name];
};



const writeJson = (name, data) => {
  if (!Array.isArray(data)) {
    throw new Error(
      `داده ${name} باید آرایه باشد.`,
    );
  }



  if (!COLLECTION_MAP[name]) {
    throw new Error(
      `کلید داده "${name}" تعریف نشده است.`,
    );
  }



  cache[name] = data;



  flush(name);



  return true;
};



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



const writeReturnRequests = (data) =>
  writeJson('returnRequests', data);



const readSalesReports = () =>
  readJson('salesReports');



const writeSalesReports = (data) =>
  writeJson('salesReports', data);



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
  writeJson('warranties', data);



module.exports = {
  DATA_DIR,
  COLLECTION_MAP,
  cache,
  ensureDataFiles,
  getFilePath,
  loadAllData,
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
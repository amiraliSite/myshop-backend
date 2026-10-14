const mongoose = require('mongoose');


const baseOptions = {
  timestamps: true,
  strict: false,
  versionKey: false,
};


const schemas = {
  Product: new mongoose.Schema({}, baseOptions),
  Representative: new mongoose.Schema({}, baseOptions),
  Shipment: new mongoose.Schema({}, baseOptions),
  Admin: new mongoose.Schema({}, baseOptions),
  WarehouseItem: new mongoose.Schema({}, baseOptions),
  WarehouseMovement: new mongoose.Schema({}, baseOptions),
  RepresentativeWarehouse: new mongoose.Schema({}, baseOptions),
  ReturnRequest: new mongoose.Schema({}, baseOptions),
  SalesReport: new mongoose.Schema({}, baseOptions),
  RepresentativeNote: new mongoose.Schema({}, baseOptions),
  Warranty: new mongoose.Schema({}, baseOptions),
};


const models = {};


for (const [name, schema] of Object.entries(schemas)) {
  models[name] = mongoose.model(name, schema);
}


module.exports = models;
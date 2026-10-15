const mongoose = require('mongoose');


const baseOptions = {
  timestamps: true,
  strict: false,
  versionKey: false,
  // اطمینان از اینکه فیلد id به‌صورت واقعی ذخیره می‌شود
  // (نه به‌عنوان virtual)
};


// اضافه کردن فیلد id به‌صورت واقعی به همه schema ها
// تا Mongoose آن را حذف نکند
const createSchema = () => {
  const schema = new mongoose.Schema({
    id: {
      type: String,
      required: false,
      default: null,
    },
  }, baseOptions);
  
  // غیرفعال کردن virtual id تا با فیلد واقعی تداخل نداشته باشد
  schema.set('toJSON', {
    virtuals: false,
    transform: function(doc, ret) {
      // اطمینان از اینکه id واقعی برمی‌گردد (نه _id به‌عنوان id)
      if (doc.id) {
        ret.id = doc.id;
      }
      return ret;
    },
  });
  
  return schema;
};


const schemas = {
  Product: createSchema(),
  Representative: createSchema(),
  Shipment: createSchema(),
  Admin: createSchema(),
  WarehouseItem: createSchema(),
  WarehouseMovement: createSchema(),
  RepresentativeWarehouse: createSchema(),
  ReturnRequest: createSchema(),
  SalesReport: createSchema(),
  RepresentativeNote: createSchema(),
  Warranty: createSchema(),
};


const models = {};


for (const [name, schema] of Object.entries(schemas)) {
  models[name] = mongoose.model(name, schema);
}


module.exports = models;

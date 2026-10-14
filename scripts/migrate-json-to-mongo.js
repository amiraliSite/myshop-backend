require('dotenv').config();


const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');


const models = require('../models');


const {
  COLLECTION_MAP,
} = require('../helpers/jsonStorage');


const DATA_DIR = path.join(
  __dirname,
  '..',
  'data',
);


const migrate = async () => {
  if (!process.env.MONGODB_URI) {
    console.error(
      '❌ متغیر MONGODB_URI تنظیم نشده است.',
    );


    process.exit(1);
  }


  await mongoose.connect(
    process.env.MONGODB_URI,
  );


  console.log(
    '✅ اتصال به MongoDB برقرار شد.',
  );


  for (const [
    name,
    modelName,
  ] of Object.entries(COLLECTION_MAP)) {
    const filePath = path.join(
      DATA_DIR,
      `${name}.json`,
    );


    if (!fs.existsSync(filePath)) {
      console.log(
        `⚠️ فایل ${name}.json پیدا نشد، رد شد.`,
      );


      continue;
    }


    const raw = fs.readFileSync(
      filePath,
      'utf8',
    );


    if (!raw.trim()) {
      console.log(
        `⚠️ فایل ${name}.json خالی است، رد شد.`,
      );


      continue;
    }


    const data = JSON.parse(raw);


    if (!Array.isArray(data)) {
      console.log(
        `⚠️ فایل ${name}.json آرایه نیست، رد شد.`,
      );


      continue;
    }


    const Model = models[modelName];


    await Model.deleteMany({});


    if (data.length > 0) {
      await Model.insertMany(data);
    }


    console.log(
      `✅ ${name}: ${data.length} رکورد منتقل شد.`,
    );
  }


  await mongoose.disconnect();


  console.log(
    '🎉 انتقال همهٔ داده‌ها کامل شد.',
  );


  process.exit(0);
};


migrate().catch((error) => {
  console.error(
    '❌ خطا در انتقال داده‌ها:',
    error,
  );


  process.exit(1);
});
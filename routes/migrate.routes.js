const express = require('express');


const fs = require('fs');
const path = require('path');


const models = require('../models');


const {
  COLLECTION_MAP,
} = require('../helpers/jsonStorage');


const router = express.Router();


router.post(
  '/run',
  async (_req, res) => {
    try {
      const DATA_DIR = path.join(
        __dirname,
        '..',
        'data',
      );


      const results = [];


      for (const [
        name,
        modelName,
      ] of Object.entries(COLLECTION_MAP)) {
        const filePath = path.join(
          DATA_DIR,
          `${name}.json`,
        );


        if (!fs.existsSync(filePath)) {
          results.push({
            name,
            status: 'فایل پیدا نشد',
          });


          continue;
        }


        const raw = fs.readFileSync(
          filePath,
          'utf8',
        );


        if (!raw.trim()) {
          results.push({
            name,
            status: 'فایل خالی',
          });


          continue;
        }


        const data = JSON.parse(raw);


        if (!Array.isArray(data)) {
          results.push({
            name,
            status: 'آرایه نیست',
          });


          continue;
        }


        const Model =
          models[modelName];


        await Model.deleteMany({});


        if (data.length > 0) {
          await Model.insertMany(data);
        }


        results.push({
          name,
          status: 'انجام شد',
          count: data.length,
        });
      }


      return res.status(200).json({
        success: true,
        message:
          'انتقال داده‌ها کامل شد.',
        results,
      });
    } catch (error) {
      console.error(
        '❌ خطا در انتقال:',
        error,
      );


      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },
);


module.exports = router;
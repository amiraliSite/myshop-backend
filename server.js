// const express = require('express');
// const cors = require('cors');
// const multer = require('multer');
// const XLSX = require('xlsx');
// const fs = require('fs');
// const path = require('path');

// const app = express();
// const PORT = 5000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // مسیر فایل داده‌ها
// const DATA_FILE = path.join(__dirname, 'data', 'products.json');

// // مطمئن شو پوشه data وجود داره
// if (!fs.existsSync(path.join(__dirname, 'data'))) {
//   fs.mkdirSync(path.join(__dirname, 'data'));
// }

// // اگر فایل products.json وجود نداره، بساز
// if (!fs.existsSync(DATA_FILE)) {
//   fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2));
// }

// // تنظیمات Multer برای آپلود فایل
// const upload = multer({ dest: 'uploads/' });

// // خواندن محصولات از فایل
// const readProducts = () => {
//   const data = fs.readFileSync(DATA_FILE, 'utf8');
//   return JSON.parse(data);
// };

// // نوشتن محصولات در فایل
// const writeProducts = (products) => {
//   fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
// };

// // --- API Endpoints ---

// // دریافت همه محصولات
// app.get('/api/products', (req, res) => {
//   try {
//     const products = readProducts();
//     res.json(products);
//   } catch (error) {
//     res.status(500).json({ error: 'خطا در خواندن محصولات' });
//   }
// });

// // آپلود فایل اکسل و تبدیل به محصولات
// app.post('/api/products/upload', upload.single('file'), (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ error: 'فایلی آپلود نشده' });
//     }

//     // خواندن فایل اکسل
//     const workbook = XLSX.readFile(req.file.path);
//     const sheetName = workbook.SheetNames[0];
//     const sheet = workbook.Sheets[sheetName];
//     const jsonData = XLSX.utils.sheet_to_json(sheet);

//     // تبدیل به فرمت محصولات
//     const newProducts = jsonData.map((row, index) => ({
//       id: Date.now().toString() + index,
//       name: row['name'] || row['نام'] || row['نام محصول'] || 'بدون نام',
//       price: Number(row['price'] || row['قیمت'] || 0),
//       category: row['category'] || row['دسته‌بندی'] || 'عمومی',
//       stock: Number(row['stock'] || row['موجودی'] || 0),
//       description: row['description'] || row['توضیحات'] || '',
//       image: row['image'] || row['تصویر'] || '',
//     }));

//     // ذخیره در فایل
//     const existingProducts = readProducts();
//     const allProducts = [...existingProducts, ...newProducts];
//     writeProducts(allProducts);

//     // پاک کردن فایل موقت
//     fs.unlinkSync(req.file.path);

//     res.json({ 
//       message: `${newProducts.length} محصول با موفقیت اضافه شد`,
//       count: newProducts.length,
//       products: allProducts
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'خطا در پردازش فایل اکسل' });
//   }
// });

// // افزودن یک محصول
// app.post('/api/products', (req, res) => {
//   try {
//     const products = readProducts();
//     const newProduct = {
//       id: Date.now().toString(),
//       ...req.body
//     };
//     products.push(newProduct);
//     writeProducts(products);
//     res.json(newProduct);
//   } catch (error) {
//     res.status(500).json({ error: 'خطا در افزودن محصول' });
//   }
// });

// // ویرایش محصول
// app.put('/api/products/:id', (req, res) => {
//   try {
//     const products = readProducts();
//     const index = products.findIndex(p => p.id === req.params.id);
    
//     if (index === -1) {
//       return res.status(404).json({ error: 'محصول یافت نشد' });
//     }

//     products[index] = { ...products[index], ...req.body };
//     writeProducts(products);
//     res.json(products[index]);
//   } catch (error) {
//     res.status(500).json({ error: 'خطا در ویرایش محصول' });
//   }
// });

// // حذف محصول
// app.delete('/api/products/:id', (req, res) => {
//   try {
//     let products = readProducts();
//     products = products.filter(p => p.id !== req.params.id);
//     writeProducts(products);
//     res.json({ message: 'محصول حذف شد' });
//   } catch (error) {
//     res.status(500).json({ error: 'خطا در حذف محصول' });
//   }
// });

// // شروع سرور
// app.listen(PORT, () => {
//   console.log(`🚀 سرور بک‌اند در حال اجرا روی پورت ${PORT}`);
// });
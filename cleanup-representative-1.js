const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const REPRESENTATIVE_ID = '1';

const fileNames = [
  'shipments.json',
  'representativeWarehouses.json',
  'returnRequests.json',
  'salesReports.json',
];

function readArray(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`فایل پیدا نشد: ${filePath}`);
  }

  const parsed = JSON.parse(
    fs.readFileSync(filePath, 'utf8'),
  );

  if (!Array.isArray(parsed)) {
    throw new Error(
      `محتوای فایل باید آرایه باشد: ${filePath}`,
    );
  }

  return parsed;
}

function isRepresentativeOne(row) {
  return String(row?.representativeId ?? '').trim() ===
    REPRESENTATIVE_ID;
}

function main() {
  const representativesPath = path.join(
    DATA_DIR,
    'representatives.json',
  );

  const representatives = readArray(
    representativesPath,
  );

  if (
    representatives.some(
      (rep) =>
        String(rep?.id ?? '').trim() ===
          REPRESENTATIVE_ID ||
        Number(rep?.folderNumber) === 1,
    )
  ) {
    throw new Error(
      'نماینده‌ای با id یا پوشهٔ 1 هنوز ثبت است؛ ' +
      'پاکسازی متوقف شد.',
    );
  }

  const changes = fileNames.map((fileName) => {
    const filePath = path.join(DATA_DIR, fileName);
    const original = readArray(filePath);
    const cleaned = original.filter(
      (row) => !isRepresentativeOne(row),
    );

    return {
      fileName,
      filePath,
      original,
      cleaned,
      removed: original.length - cleaned.length,
    };
  });

  const directory = path.join(
    DATA_DIR,
    'representatives',
    REPRESENTATIVE_ID,
  );

  console.log('مواردی که حذف خواهند شد:');

  for (const change of changes) {
    console.log(
      `${change.fileName}: ${change.removed} رکورد`,
    );
  }

  console.log(
    `پوشهٔ 1: ${
      fs.existsSync(directory) ? 'وجود دارد' : 'وجود ندارد'
    }`,
  );

  for (const change of changes) {
    if (change.removed === 0) continue;

    fs.writeFileSync(
      change.filePath,
      JSON.stringify(change.cleaned, null, 2),
      'utf8',
    );
  }

  if (fs.existsSync(directory)) {
    fs.rmSync(directory, {
      recursive: true,
      force: false,
    });
  }

  console.log('پاکسازی باقی‌مانده‌های شمارهٔ 1 انجام شد.');
}

try {
  main();
} catch (error) {
  console.error('پاکسازی متوقف شد:', error);
  process.exitCode = 1;
}
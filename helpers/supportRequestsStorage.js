const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'support-requests.json');

let queue = Promise.resolve();

function serialized(operation) {
  const result = queue.then(operation);
  queue = result.catch(() => {});
  return result;
}

async function readRequests() {
  try {
    const content = await fs.readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(content);

    if (!Array.isArray(parsed)) {
      throw new Error('support-requests.json must contain an array');
    }

    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeRequests(requests) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${DATA_FILE}.${randomUUID()}.tmp`;

  try {
    await fs.writeFile(
      temporary,
      JSON.stringify(requests, null, 2),
      'utf8',
    );
    await fs.rename(temporary, DATA_FILE);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  readRequests,
  writeRequests,
  serialized,
};
const express = require('express');
const { readNotes, writeNotes } = require('../helpers/jsonStorage');

const router = express.Router();

const createRandomId = () => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

// میدل‌ور ساده برای چک کردن توکن
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;


  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'توکن اعتبارسنجی پیدا نشد.',
    });
  }


  const token = authHeader.split(' ')[1];


  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'توکن نامعتبر است.',
    });
  }


  req.user = {
    id: 'user-' + Date.now(),
    role: 'admin',
    token: token,
  };


  next();
};

// دریافت یادداشت‌های کاربر فعلی
router.get('/', authenticateToken, (req, res) => {
  try {
    const notes = readNotes();


    notes.sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });


    return res.json({
      success: true,
      count: notes.length,
      data: notes,
    });
  } catch (error) {
    console.error('خطا در دریافت یادداشت‌ها:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'خطا در دریافت یادداشت‌ها.',
    });
  }
});

// افزودن یادداشت جدید
router.post('/', authenticateToken, (req, res) => {
  try {
    const userId = 'user-' + Date.now();
    const userRole = 'admin';


    const { title, content, color } = req.body;


    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'عنوان و متن یادداشت الزامی است.',
      });
    }


    const notes = readNotes();


    const newNote = {
      id: createRandomId(),
      userId,
      userRole,
      title: title.trim(),
      content: content.trim(),
      color: color || 'yellow',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };


    notes.unshift(newNote);
    
    console.log('💾 Saving notes:', notes);
    const saved = writeNotes(notes);
    console.log('✅ Save result:', saved);


    return res.status(201).json({
      success: true,
      data: newNote,
    });
  } catch (error) {
    console.error('خطا در افزودن یادداشت:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'خطا در افزودن یادداشت.',
    });
  }
});

// ویرایش یادداشت
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const noteId = String(req.params.id);


    const { title, content, color } = req.body;


    if (!title?.trim() || !content?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'عنوان و متن یادداشت الزامی است.',
      });
    }


    const notes = readNotes();


    const noteIndex = notes.findIndex((note) => {
      return String(note.id) === noteId;
    });


    if (noteIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'یادداشت پیدا نشد.',
      });
    }


    notes[noteIndex] = {
      ...notes[noteIndex],
      title: title.trim(),
      content: content.trim(),
      color: color || notes[noteIndex].color,
      updatedAt: new Date().toISOString(),
    };


    writeNotes(notes);


    return res.json({
      success: true,
      data: notes[noteIndex],
    });
  } catch (error) {
    console.error('خطا در ویرایش یادداشت:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'خطا در ویرایش یادداشت.',
    });
  }
});

// حذف یادداشت
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const noteId = String(req.params.id);


    const notes = readNotes();


    const noteIndex = notes.findIndex((note) => {
      return String(note.id) === noteId;
    });


    if (noteIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'یادداشت پیدا نشد.',
      });
    }


    notes.splice(noteIndex, 1);
    writeNotes(notes);


    return res.json({
      success: true,
      message: 'یادداشت حذف شد.',
    });
  } catch (error) {
    console.error('خطا در حذف یادداشت:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'خطا در حذف یادداشت.',
    });
  }
});

module.exports = router;
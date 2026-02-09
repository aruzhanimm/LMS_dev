const express = require('express');
const { getDb } = require('../database/db');
const { ObjectId } = require('mongodb');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Middleware для проверки ролей
const { requireAuth, requireRole } = require('../middlewares/roles');

// Настройка Multer для загрузки картинок курсов
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// --- 1. GET ALL COURSES (Получение списка с фильтрами) ---
router.get('/', async (req, res) => {
    const db = getDb();
    const filter = {};

    if (req.query.category) {
        if (Array.isArray(req.query.category)) {
            filter.category = { $in: req.query.category };
        } else {
            filter.category = req.query.category;
        }
    }

    if (req.query.level) {
        if (Array.isArray(req.query.level)) {
            filter.level = { $in: req.query.level };
        } else {
            filter.level = req.query.level;
        }
    }

    if (req.query.instructor) {
        filter.instructor = { $regex: req.query.instructor, $options: 'i' };
    }

    if (req.query.search) {
        filter.$or = [
            { title: { $regex: req.query.search, $options: 'i' } },
            { description: { $regex: req.query.search, $options: 'i' } },
            { instructor: { $regex: req.query.search, $options: 'i' } }
        ];
    }

    let sort = {};
    if (req.query.sort) {
        if (req.query.sort === 'newest') sort.createdAt = -1;
        else if (req.query.sort === 'popular') sort.enrolledCount = -1;
        else if (req.query.sort === 'rating') sort.rating = -1;
        else if (req.query.sort === 'price_asc') sort.price = 1;
        else if (req.query.sort === 'price_desc') sort.price = -1;
    } else {
        sort.createdAt = -1;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    try {
        const courses = await db.collection('courses')
            .find(filter)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .toArray();

        const total = await db.collection('courses').countDocuments(filter);

        res.status(200).json({
            courses,
            page,
            totalPages: Math.ceil(total / limit),
            totalCourses: total
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch courses" });
    }
});

// --- 2. GET SINGLE COURSE (Исправлено: ObjectId, Прогресс, Квиз) ---
router.get('/:id', async (req, res) => {
    const db = getDb();
    const courseId = req.params.id;

    // FIX: Проверка валидности ID перед запросом
    if (!ObjectId.isValid(courseId)) {
        return res.status(400).json({ error: "Invalid course ID format" });
    }

    try {
        // 1. Ищем курс
        const course = await db.collection('courses').findOne({ _id: new ObjectId(courseId) });
        if (!course) {
            return res.status(404).json({ error: "Course not found" });
        }

        // 2. Ищем уроки
        const lessons = await db.collection('lessons')
            .find({ courseId: new ObjectId(courseId) })
            .sort({ order: 1 })
            .toArray();

        // 3. Ищем прогресс пользователя
        let userProgress = { isEnrolled: false, percent: 0, completedLessonIds: [] };

        if (req.session.user) {
            // FIX: Ищем по userId (строка из сессии) и courseId (ObjectId)
            const enrollment = await db.collection('enrollments').findOne({
                userId: req.session.user.userId,
                courseId: new ObjectId(courseId)
            });

            if (enrollment) {
                userProgress.isEnrolled = true;
                userProgress.percent = enrollment.progress || 0;
                userProgress.completedLessonIds = enrollment.completedLessons || [];
            }

            // Если это создатель курса (профессор), даем ему доступ
            if (course.createdBy === req.session.user.userId) {
                userProgress.isEnrolled = true;
            }
        }

        // 4. Добавляем данные для Квиза (Хардкод для примера, можно вынести в БД)
        const quiz = {
            questions: [
                { id: 1, text: "What represents the structure of a webpage?", options: ["HTML", "CSS", "JS"], correct: 0 },
                { id: 2, text: "Which tag is used for links?", options: ["<link>", "<a>", "<href>"], correct: 1 }
            ]
        };

        res.status(200).json({
            ...course,
            lessons,
            userProgress,
            quiz
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// --- 3. SUBMIT QUIZ (Новое: проверка ответов) ---
router.post('/:id/quiz', requireAuth, async (req, res) => {
    // В реальном проекте ответы нужно брать из БД по ID курса
    const { answers } = req.body; // Приходит объект вида { 1: 0, 2: 1 } (id вопроса : индекс ответа)

    // Правильные ответы (Пока хардкод)
    const correctAnswers = { 1: 0, 2: 1 };

    let total = Object.keys(correctAnswers).length;
    let correct = 0;

    for (let qId in answers) {
        if (answers[qId] == correctAnswers[qId]) {
            correct++;
        }
    }

    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= 70;

    // Тут можно сохранить результат в БД, если нужно

    res.json({ score, passed });
});

// --- 4. MARK LESSON COMPLETE (Логика прогресса) ---
router.post('/:courseId/complete/:lessonId', requireAuth, async (req, res) => {
    const db = getDb();
    const { courseId, lessonId } = req.params;

    if (!ObjectId.isValid(courseId)) return res.status(400).json({ error: "Invalid ID" });

    try {
        const enrollment = await db.collection('enrollments').findOne({
            userId: req.session.user.userId,
            courseId: new ObjectId(courseId)
        });

        if (!enrollment) return res.status(403).json({ error: "Not enrolled" });

        // Добавляем урок в массив завершенных
        await db.collection('enrollments').updateOne(
            { _id: enrollment._id },
            { $addToSet: { completedLessons: lessonId } }
        );

        // Пересчитываем %
        const totalLessons = await db.collection('lessons').countDocuments({ courseId: new ObjectId(courseId) });

        // Получаем обновленную запись для точного подсчета
        const updatedEnrollment = await db.collection('enrollments').findOne({ _id: enrollment._id });
        const completedCount = updatedEnrollment.completedLessons ? updatedEnrollment.completedLessons.length : 0;

        const newProgress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

        // Сохраняем проценты
        await db.collection('enrollments').updateOne(
            { _id: enrollment._id },
            { $set: { progress: newProgress } }
        );

        res.json({ success: true, newProgress });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error updating progress" });
    }
});

// --- 5. ENROLL (Исправлено: ObjectId validation) ---
router.post('/:id/enroll', requireAuth, requireRole(['student']), async (req, res) => {
    const db = getDb();
    const courseId = req.params.id;

    // Валидация
    if (!ObjectId.isValid(courseId)) {
        return res.status(400).json({ error: "Not a valid ID" });
    }

    try {
        const existing = await db.collection('enrollments').findOne({
            userId: req.session.user.userId,
            courseId: new ObjectId(courseId)
        });

        if (existing) {
            return res.status(400).json({ error: "Already enrolled in this course" });
        }

        const enrollmentData = {
            userId: req.session.user.userId, // Храним как строку (из сессии)
            courseId: new ObjectId(courseId), // Храним как ObjectId (для связей)
            enrolledAt: new Date(),
            progress: 0,
            completedLessons: []
        };

        await db.collection('enrollments').insertOne(enrollmentData);

        // Увеличиваем счетчик студентов
        await db.collection('courses').updateOne(
            { _id: new ObjectId(courseId) },
            { $inc: { enrolledCount: 1 } }
        );

        res.status(200).json({ message: "Successfully enrolled in course" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not enroll in course" });
    }
});

// --- 6. CREATE COURSE (Professor Only) ---
router.post('/', requireAuth, requireRole(['professor']), upload.single('image'), async (req, res) => {
    const db = getDb();

    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

    const { title, description, category, instructor, price, duration, level } = req.body;

    if (!title || !description || !category || !instructor) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const course = {
        title,
        description,
        category,
        instructor,
        price: parseFloat(price) || 0,
        duration: duration || '40 hours',
        level: level || 'Beginner',
        rating: 4.8,
        enrolledCount: 0,
        image: req.file ? `/uploads/${req.file.filename}` : '/images/placeholder.jpg',
        createdAt: new Date(),
        createdBy: req.session.user.userId,
        createdByName: req.session.user.username
    };

    try {
        const result = await db.collection('courses').insertOne(course);
        res.status(201).json({
            message: "Course created successfully",
            id: result.insertedId,
            course: { ...course, _id: result.insertedId }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not create course" });
    }
});

// --- 7. UPDATE COURSE (Professor Only) ---
router.put('/:id', requireAuth, requireRole(['professor']), upload.single('image'), async (req, res) => {
    const db = getDb();

    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Not a valid ID" });
    }

    const updates = req.body;
    if (req.file) {
        updates.image = `/uploads/${req.file.filename}`;
    }

    try {
        const course = await db.collection('courses').findOne({
            _id: new ObjectId(req.params.id),
            createdBy: req.session.user.userId
        });

        if (!course) {
            return res.status(403).json({ error: "Not authorized to update this course" });
        }

        const result = await db.collection('courses').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updates }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Course not found" });
        }

        res.status(200).json({ message: "Course updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not update course" });
    }
});

// --- 8. DELETE COURSE (Professor Only) ---
router.delete('/:id', requireAuth, requireRole(['professor']), async (req, res) => {
    const db = getDb();

    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Not a valid ID" });
    }

    try {
        const course = await db.collection('courses').findOne({
            _id: new ObjectId(req.params.id),
            createdBy: req.session.user.userId
        });

        if (!course) {
            return res.status(403).json({ error: "Not authorized to delete this course" });
        }

        const result = await db.collection('courses').deleteOne({
            _id: new ObjectId(req.params.id)
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Course not found" });
        }

        // Удаляем связанные данные (уроки, записи студентов)
        await db.collection('enrollments').deleteMany({ courseId: new ObjectId(req.params.id) });
        await db.collection('lessons').deleteMany({ courseId: new ObjectId(req.params.id) });

        res.status(200).json({ message: "Course deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not delete course" });
    }
});

module.exports = router;
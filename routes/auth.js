const express = require('express');
const { getDb } = require('../database/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const { requireAuth, requireRole } = require('../middlewares/roles'); // Проверь путь к middlewares
const router = express.Router();

// Настройка загрузки аватарок
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, 'avatar-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- REGISTER ---
router.post('/register', async (req, res) => {
    const db = getDb();
    const { username, email, password } = req.body;

    if (!username || !email || !password) return res.status(400).json({ error: "All fields are required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    try {
        const existingUser = await db.collection('users').findOne({ $or: [{ email }, { username }] });
        if (existingUser) return res.status(400).json({ error: "User already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = {
            username,
            email,
            password: hashedPassword,
            createdAt: new Date(),
            role: null, // Роль выбирается позже
            bio: '',
            education: ''
        };

        const result = await db.collection('users').insertOne(user);

        req.session.user = {
            userId: result.insertedId.toString(),
            username: user.username,
            email: user.email,
            role: null
        };

        req.session.save((err) => {
            if (err) return res.status(500).json({ error: "Session error" });
            // ВАЖНО: Отправляем requiresRole: true
            res.status(201).json({ message: "Registration successful", requiresRole: true });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed" });
    }
});

// --- LOGIN ---
router.post('/login', async (req, res) => {
    const db = getDb();
    const { email, password } = req.body;

    try {
        const user = await db.collection('users').findOne({ email });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) return res.status(401).json({ error: "Invalid credentials" });

        req.session.user = {
            userId: user._id.toString(),
            username: user.username,
            email: user.email,
            role: user.role || null
        };

        req.session.save(() => {
            if (!user.role) {
                return res.status(200).json({ message: "Login successful", requiresRole: true });
            }
            res.status(200).json({ message: "Login successful" });
        });
    } catch (err) {
        res.status(500).json({ error: "Login failed" });
    }
});

// --- LOGOUT ---
router.post('/logout', (req, res) => {
    req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(200).json({ message: "Logout successful" });
    });
});

// --- SET ROLE ---
router.post('/set-role', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
    const { role } = req.body;

    if (!['student', 'professor'].includes(role)) return res.status(400).json({ error: "Invalid role" });

    const db = getDb();
    await db.collection('users').updateOne(
        { _id: new ObjectId(req.session.user.userId) },
        { $set: { role: role } }
    );

    req.session.user.role = role;

    // Если профессор — нужно заполнить детали
    const redirectUrl = role === 'professor' ? '/professor-details' : '/profile';

    res.status(200).json({ message: "Role updated", redirectUrl });
});

// --- PROFESSOR DETAILS (НОВОЕ) ---
router.post('/professor-details', requireAuth, async (req, res) => {
    const { education, bio, experience } = req.body;
    const db = getDb();

    await db.collection('users').updateOne(
        { _id: new ObjectId(req.session.user.userId) },
        { $set: { education, bio, experience, isVerified: false } } // isVerified можно использовать для админки
    );

    res.status(200).json({ message: "Details saved" });
});

// --- UPDATE PROFILE (НОВОЕ) ---
router.post('/update-profile', requireAuth, upload.single('avatar'), async (req, res) => {
    const db = getDb();
    const { username, email, bio } = req.body;
    const updates = { username, email, bio };

    if (req.file) {
        updates.avatar = `/uploads/avatars/${req.file.filename}`;
    }

    try {
        await db.collection('users').updateOne(
            { _id: new ObjectId(req.session.user.userId) },
            { $set: updates }
        );

        // Обновляем сессию
        req.session.user.username = username;
        req.session.user.email = email;

        res.status(200).json({ message: "Profile updated", avatar: updates.avatar });
    } catch (err) {
        res.status(500).json({ error: "Update failed" });
    }
});

// --- ME ---
router.get('/me', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });

    const db = getDb();
    // Получаем свежие данные из БД (для аватарок и био)
    const user = await db.collection('users').findOne(
        { _id: new ObjectId(req.session.user.userId) },
        { projection: { password: 0 } }
    );

    res.status(200).json({ user: { ...user, userId: user._id } });
});

// --- MY STUDENTS (ИСПРАВЛЕНО) ---
router.get('/my-students', requireAuth, requireRole(['professor']), async (req, res) => {
    const db = getDb();
    try {
        const myCourses = await db.collection('courses')
            .find({ createdBy: req.session.user.userId }) // userId в сессии - строка
            .toArray();

        if (myCourses.length === 0) return res.json({ students: [] });

        const myCourseIds = myCourses.map(c => c._id); // ObjectIds

        const enrollments = await db.collection('enrollments')
            .find({ courseId: { $in: myCourseIds } })
            .toArray();

        if (enrollments.length === 0) return res.json({ students: [] });

        const studentsData = [];

        for (const enrollment of enrollments) {
            // ВАЖНО: enrollment.userId может быть строкой или ObjectId.
            // Приводим к ObjectId для поиска.
            let uid;
            try { uid = new ObjectId(enrollment.userId); } catch(e) { continue; }

            const student = await db.collection('users').findOne({ _id: uid });
            const course = myCourses.find(c => c._id.toString() === enrollment.courseId.toString());

            if (student && course) {
                studentsData.push({
                    username: student.username,
                    email: student.email,
                    courseTitle: course.title,
                    enrolledAt: enrollment.enrolledAt,
                    progress: enrollment.progress || 0
                });
            }
        }
        res.status(200).json({ students: studentsData });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch students" });
    }
});

// --- MY COURSES (Для студента) ---
router.get('/my-courses', async (req, res) => {
    // Оставь код как был в твоем routes/auth.js, он рабочий,
    // только убедись, что userId сравнивается правильно (String vs String)
    const db = getDb();
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });

    try {
        const enrollments = await db.collection('enrollments')
            .find({ userId: req.session.user.userId }) // В enroll route мы сохраняем userId как строку
            .toArray();

        const courseIds = enrollments.map(e => new ObjectId(e.courseId));
        const courses = await db.collection('courses')
            .find({ _id: { $in: courseIds } })
            .toArray();

        const coursesWithProgress = courses.map(course => {
            const enrollment = enrollments.find(e => e.courseId.toString() === course._id.toString());
            return {
                ...course,
                progress: enrollment ? enrollment.progress : 0
            };
        });
        res.status(200).json({ courses: coursesWithProgress });
    } catch (err) {
        res.status(500).json({ error: "Error" });
    }
});

// --- CREATED COURSES ---
router.get('/created-courses', async (req, res) => {
    const db = getDb();
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
    const courses = await db.collection('courses')
        .find({ createdBy: req.session.user.userId })
        .toArray();
    res.status(200).json({ courses });
});

module.exports = router;
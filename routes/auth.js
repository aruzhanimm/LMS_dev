const express = require('express');
const { getDb } = require('../database/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
// Импортируем Middleware для роутов my-students
const { requireAuth, requireRole } = require('../middlewares/roles');
const router = express.Router();

// Регистрация (по умолчанию создаем студента, роль потом можно уточнить)
router.post('/register', async (req, res) => {
    const db = getDb();
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    try {
        const existingUser = await db.collection('users').findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = {
            username,
            email,
            password: hashedPassword,
            createdAt: new Date(),
            role: null, // Роль пока не выбрана!
            enrolledCourses: []
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
            res.status(201).json({ message: "Registration successful" });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed" });
    }
});

// ВХОД (ОБНОВЛЕННАЯ ЛОГИКА)
router.post('/login', async (req, res) => {
    const db = getDb();
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        const user = await db.collection('users').findOne({ email });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        req.session.user = {
            userId: user._id.toString(),
            username: user.username,
            email: user.email,
            role: user.role || null
        };

        req.session.save((err) => {
            if (err) return res.status(500).json({ error: "Session error" });

            // ВАЖНО: Если роли нет, отправляем флаг requiresRole
            if (!user.role) {
                return res.status(200).json({
                    message: "Login successful",
                    requiresRole: true
                });
            }

            res.status(200).json({
                message: "Login successful",
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role
                }
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Login failed" });
    }
});

// Выход
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Logout failed" });
        res.clearCookie('connect.sid');
        res.status(200).json({ message: "Logout successful" });
    });
});

// Установка роли
router.post('/set-role', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });

    const { role } = req.body;
    if (!['student', 'professor'].includes(role)) {
        return res.status(400).json({ error: "Invalid role" });
    }

    // Обновляем сессию
    req.session.user.role = role;

    // Обновляем БД
    const db = getDb();
    await db.collection('users').updateOne(
        { _id: new ObjectId(req.session.user.userId) },
        { $set: { role: role } }
    );

    res.status(200).json({ message: "Role updated", role: role });
});

// Текущий пользователь
router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });
    res.status(200).json({ user: req.session.user, role: req.session.user.role });
});

// Курсы студента
router.get('/my-courses', async (req, res) => {
    const db = getDb();
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });

    try {
        const enrollments = await db.collection('enrollments')
            .find({ userId: req.session.user.userId })
            .toArray();

        const courseIds = enrollments.map(e => new ObjectId(e.courseId));
        const courses = await db.collection('courses')
            .find({ _id: { $in: courseIds } })
            .toArray();

        const coursesWithProgress = courses.map(course => {
            const enrollment = enrollments.find(e => e.courseId.toString() === course._id.toString());
            return {
                ...course,
                progress: enrollment ? enrollment.progress : 0,
                enrolledAt: enrollment ? enrollment.enrolledAt : null
            };
        });

        res.status(200).json({ courses: coursesWithProgress });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch courses" });
    }
});

// Курсы созданные профессором
router.get('/created-courses', async (req, res) => {
    const db = getDb();
    if (!req.session.user) return res.status(401).json({ error: "Not authenticated" });

    try {
        const courses = await db.collection('courses')
            .find({ createdBy: req.session.user.userId })
            .sort({ createdAt: -1 })
            .toArray();
        res.status(200).json({ courses });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch courses" });
    }
});

// Список студентов (Только для профессора)
router.get('/my-students', requireAuth, requireRole(['professor']), async (req, res) => {
    const db = getDb();
    try {
        const courses = await db.collection('courses')
            .find({ createdBy: req.session.user.userId })
            .toArray();

        const courseIds = courses.map(course => course._id.toString());

        const enrollments = await db.collection('enrollments')
            .find({ courseId: { $in: courseIds } })
            .toArray();

        const students = [];
        for (const enrollment of enrollments) {
            const student = await db.collection('users').findOne({
                _id: new ObjectId(enrollment.userId),
                role: 'student'
            });

            const course = courses.find(c => c._id.toString() === enrollment.courseId.toString());

            if (student && course) {
                students.push({
                    username: student.username,
                    email: student.email,
                    courseTitle: course.title,
                    enrolledAt: enrollment.enrolledAt,
                    progress: enrollment.progress || 0
                });
            }
        }
        res.status(200).json({ students });
    } catch (err) {
        res.status(500).json({ error: "Could not fetch students" });
    }
});
// Получение списка студентов для профессора
router.get('/my-students', requireAuth, requireRole(['professor']), async (req, res) => {
    const db = getDb();

    try {
        // 1. Находим все курсы, которые создал текущий профессор
        const myCourses = await db.collection('courses')
            .find({ createdBy: req.session.user.userId })
            .toArray();

        if (myCourses.length === 0) {
            return res.json({ students: [] });
        }

        // Собираем ID этих курсов
        const myCourseIds = myCourses.map(c => c._id); // Это массив ObjectId

        // 2. Находим все записи (enrollments) на эти курсы
        // Ищем записи, где courseId входит в список моих курсов
        const enrollments = await db.collection('enrollments')
            .find({ courseId: { $in: myCourseIds } })
            .toArray();

        if (enrollments.length === 0) {
            return res.json({ students: [] });
        }

        // 3. Собираем данные студентов
        const studentsData = [];

        for (const enrollment of enrollments) {
            // Находим данные студента по ID из записи
            const student = await db.collection('users').findOne(
                { _id: new ObjectId(enrollment.userId) },
                { projection: { password: 0 } } // Не отправляем пароль!
            );

            // Находим название курса, чтобы показать "На какой курс записан"
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
        console.error('Error fetching students:', err);
        res.status(500).json({ error: "Could not fetch students" });
    }
});
module.exports = router;
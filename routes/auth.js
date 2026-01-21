const express = require('express');
const { getDb } = require('../database/db');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Регистрация
router.post('/register', async (req, res) => {
    const db = getDb();
    const { username, email, password } = req.body;

    // Валидация
    if (!username || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    try {
        // Проверяем, существует ли пользователь
        const existingUser = await db.collection('users').findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(400).json({
                error: "User with this email or username already exists"
            });
        }

        // Хэшируем пароль
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Создаем пользователя
        const user = {
            username,
            email,
            password: hashedPassword,
            createdAt: new Date(),
            role: 'student',
            enrolledCourses: []
        };

        const result = await db.collection('users').insertOne(user);

        // Создаем сессию
        req.session.user = {
            userId: result.insertedId.toString(),
            username: user.username,
            email: user.email,
            role: user.role
        };

        // Сохраняем сессию перед отправкой ответа
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: "Session error" });
            }

            res.status(201).json({
                message: "Registration successful",
                user: {
                    id: result.insertedId,
                    username: user.username,
                    email: user.email
                }
            });
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration failed" });
    }
});

// Вход
router.post('/login', async (req, res) => {
    const db = getDb();
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    try {
        // Находим пользователя
        const user = await db.collection('users').findOne({ email });

        if (!user) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Проверяем пароль
        const isValidPassword = await bcrypt.compare(password, user.password);

        if (!isValidPassword) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        // Создаем сессию
        req.session.user = {
            userId: user._id.toString(),
            username: user.username,
            email: user.email,
            role: user.role
        };

        // Сохраняем сессию
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.status(500).json({ error: "Session error" });
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
        if (err) {
            return res.status(500).json({ error: "Logout failed" });
        }
        res.clearCookie('connect.sid');
        res.status(200).json({ message: "Logout successful" });
    });
});

// Проверка текущего пользователя
router.get('/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    res.status(200).json({ user: req.session.user });
});

// Получение курсов пользователя
router.get('/my-courses', async (req, res) => {
    const db = getDb();

    if (!req.session.user) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const enrollments = await db.collection('enrollments')
            .find({ userId: req.session.user.userId })
            .toArray();

        const courseIds = enrollments.map(e => new ObjectId(e.courseId));

        const courses = await db.collection('courses')
            .find({ _id: { $in: courseIds } })
            .toArray();

        // Добавляем информацию о прогрессе
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
        console.error(err);
        res.status(500).json({ error: "Could not fetch courses" });
    }
});

// Получение созданных курсов пользователя
router.get('/created-courses', async (req, res) => {
    const db = getDb();

    if (!req.session.user) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const courses = await db.collection('courses')
            .find({ createdBy: req.session.user.userId })
            .sort({ createdAt: -1 })
            .toArray();

        res.status(200).json({ courses });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not fetch courses" });
    }
});

module.exports = router;
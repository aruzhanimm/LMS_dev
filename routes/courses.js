const express = require('express');
const { getDb } = require('../database/db');
const { ObjectId } = require('mongodb');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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


router.get('/', async (req, res) => {
    const db = getDb();


    const filter = {};
    if (req.query.category) {
        filter.category = req.query.category;
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
        if (req.query.sort === 'newest') {
            sort.createdAt = -1;
        } else if (req.query.sort === 'popular') {
            sort.enrolledCount = -1;
        } else if (req.query.sort === 'rating') {
            sort.rating = -1;
        } else if (req.query.sort === 'price_asc') {
            sort.price = 1;
        } else if (req.query.sort === 'price_desc') {
            sort.price = -1;
        }
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


router.get('/:id', async (req, res) => {
    const db = getDb();

    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Not a valid ID" });
    }

    try {
        const course = await db.collection('courses')
            .findOne({ _id: new ObjectId(req.params.id) });

        if (!course) {
            return res.status(404).json({ error: "Course not found" });
        }

        res.status(200).json(course);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});


router.post('/', upload.single('image'), async (req, res) => {
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


router.post('/:id/enroll', async (req, res) => {
    const db = getDb();

    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Please login to enroll" });
    }

    if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ error: "Not a valid ID" });
    }

    try {

        const enrollment = await db.collection('enrollments').findOne({
            userId: req.session.user.userId,
            courseId: new ObjectId(req.params.id)
        });

        if (enrollment) {
            return res.status(400).json({ error: "Already enrolled in this course" });
        }


        const enrollmentData = {
            userId: req.session.user.userId,
            courseId: new ObjectId(req.params.id),
            enrolledAt: new Date(),
            progress: 0
        };

        await db.collection('enrollments').insertOne(enrollmentData);


        await db.collection('courses').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $inc: { enrolledCount: 1 } }
        );

        res.status(200).json({ message: "Successfully enrolled in course" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not enroll in course" });
    }
});


router.put('/:id', upload.single('image'), async (req, res) => {
    const db = getDb();

    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

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


router.delete('/:id', async (req, res) => {
    const db = getDb();

    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }

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


        await db.collection('enrollments').deleteMany({
            courseId: new ObjectId(req.params.id)
        });

        res.status(200).json({ message: "Course deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Could not delete course" });
    }
});

module.exports = router;
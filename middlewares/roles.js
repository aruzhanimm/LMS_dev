// Проверка аутентификации
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
}

// Проверка роли
function requireRole(roles) {
    return (req, res, next) => {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        if (!roles.includes(req.session.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

// Проверка владельца курса
function requireCourseOwner(req, res, next) {
    const db = require('../database/db').getDb();
    const { ObjectId } = require('mongodb');

    const courseId = req.params.id;

    if (!ObjectId.isValid(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
    }

    db.collection('courses').findOne({ _id: new ObjectId(courseId) })
        .then(course => {
            if (!course) {
                return res.status(404).json({ error: "Course not found" });
            }

            // Проверяем, является ли пользователь владельцем или профессором
            if (course.createdBy === req.session.user.userId || req.session.user.role === 'professor') {
                next();
            } else {
                res.status(403).json({ error: "Not authorized to modify this course" });
            }
        })
        .catch(err => {
            console.error(err);
            res.status(500).json({ error: "Server error" });
        });
}

module.exports = { requireAuth, requireRole, requireCourseOwner };
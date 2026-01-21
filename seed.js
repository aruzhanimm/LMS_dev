const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');

const uri = "mongodb+srv://aruzhanimka0_db_user:Ffhefhe31072007@cluster0.a4nf5lr.mongodb.net/?appName=Cluster0";

const initialCourses = [
    {
        title: "Web Development Fundamentals",
        description: "Learn HTML, CSS, and JavaScript from scratch. Build responsive websites and understand modern web development practices.",
        category: "Development",
        instructor: "Alex Johnson",
        price: 19.99,
        duration: "40 hours",
        level: "Beginner",
        rating: 4.8,
        enrolledCount: 1250,
        image: "/images/c1.jpg",
        createdAt: new Date(),
        createdBy: null,
        createdByName: "System"
    },
    {
        title: "Data Structures & Algorithms",
        description: "Master fundamental data structures and algorithms. Prepare for technical interviews and improve problem-solving skills.",
        category: "Computer Science",
        instructor: "Sarah Lee",
        price: 24.99,
        duration: "60 hours",
        level: "Intermediate",
        rating: 4.9,
        enrolledCount: 850,
        image: "/images/c2.jpg",
        createdAt: new Date(),
        createdBy: null,
        createdByName: "System"
    },
    {
        title: "Machine Learning Basics",
        description: "Introduction to machine learning concepts, algorithms, and practical applications using Python.",
        category: "Data Science",
        instructor: "Dr. Alan Turing",
        price: 29.99,
        duration: "50 hours",
        level: "Intermediate",
        rating: 4.7,
        enrolledCount: 500,
        image: "/images/c3.jpg",
        createdAt: new Date(),
        createdBy: null,
        createdByName: "System"
    },
    {
        title: "Mobile App Development",
        description: "Build cross-platform mobile applications using React Native. Learn to create apps for both iOS and Android.",
        category: "Mobile Development",
        instructor: "John Doe",
        price: 19.99,
        duration: "45 hours",
        level: "Beginner",
        rating: 4.6,
        enrolledCount: 320,
        image: "/images/c4.jpg",
        createdAt: new Date(),
        createdBy: null,
        createdByName: "System"
    },
    {
        title: "Database Design Masterclass",
        description: "Learn database design principles, SQL queries, normalization, and optimization techniques.",
        category: "Backend",
        instructor: "Jane Smith",
        price: 22.99,
        duration: "35 hours",
        level: "Intermediate",
        rating: 4.8,
        enrolledCount: 210,
        image: "/images/c5.jpg",
        createdAt: new Date(),
        createdBy: null,
        createdByName: "System"
    },
    {
        title: "Cybersecurity Fundamentals",
        description: "Understand cybersecurity principles, threat detection, and security best practices for web applications.",
        category: "Security",
        instructor: "Mr. Robot",
        price: 34.99,
        duration: "55 hours",
        level: "Advanced",
        rating: 4.9,
        enrolledCount: 1500,
        image: "/images/c6.jpg",
        createdAt: new Date(),
        createdBy: null,
        createdByName: "System"
    }
];

async function seedDatabase() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('edusphere_lms');


        await db.collection('courses').deleteMany({});
        await db.collection('users').deleteMany({});
        await db.collection('enrollments').deleteMany({});


        await db.collection('courses').insertMany(initialCourses);


        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        const testUser = {
            username: 'testuser',
            email: 'test@example.com',
            password: hashedPassword,
            role: 'student',
            createdAt: new Date(),
            enrolledCourses: []
        };

        await db.collection('users').insertOne(testUser);

        console.log('Database seeded successfully!');
        console.log('Test user: test@example.com / password123');

    } catch (error) {
        console.error('Error seeding database:', error);
    } finally {
        await client.close();
    }
}

seedDatabase();
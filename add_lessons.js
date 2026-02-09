const { MongoClient, ObjectId } = require('mongodb');

// Твоя строка подключения
const uri = "mongodb+srv://aruzhanimka0_db_user:Ffhefhe31072007@cluster0.a4nf5lr.mongodb.net/?appName=Cluster0";

async function addLessonsToExistingCourses() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('edusphere_lms');

        // 1. Очищаем старые уроки (чтобы не дублировались при повторном запуске)
        await db.collection('lessons').deleteMany({});
        console.log('Old lessons cleared.');

        // 2. Получаем все существующие курсы
        const courses = await db.collection('courses').find({}).toArray();
        console.log(`Found ${courses.length} courses.`);

        const lessonsToAdd = [];

        // 3. Проходим по каждому курсу и придумываем ему уроки
        for (const course of courses) {
            const courseId = course._id;
            const titleLower = course.title.toLowerCase();

            // Логика подбора видео (Real Data Logic)
            if (titleLower.includes('web') || titleLower.includes('development') || titleLower.includes('javascript')) {
                lessonsToAdd.push(
                    { courseId, title: "1. Intro to Web Development", youtubeId: "fq4N0hgOWzU", duration: "10 min", order: 1 },
                    { courseId, title: "2. HTML Basics", youtubeId: "pQN-pnXPaVg", duration: "25 min", order: 2 },
                    { courseId, title: "3. CSS Styling", youtubeId: "yfoY53QXEnI", duration: "30 min", order: 3 },
                    { courseId, title: "4. JavaScript Fundamentals", youtubeId: "hdI2bqOjy3c", duration: "45 min", order: 4 }
                );
            } else if (titleLower.includes('data') || titleLower.includes('python') || titleLower.includes('ml')) {
                lessonsToAdd.push(
                    { courseId, title: "1. Python for Beginners", youtubeId: "rfscVS0vtbw", duration: "60 min", order: 1 },
                    { courseId, title: "2. Data Analysis with Pandas", youtubeId: "vmEHCJofslg", duration: "45 min", order: 2 },
                    { courseId, title: "3. Machine Learning Intro", youtubeId: "7eh4d6sabA0", duration: "50 min", order: 3 }
                );
            } else if (titleLower.includes('design')) {
                lessonsToAdd.push(
                    { courseId, title: "1. UI/UX Principles", youtubeId: "c9Wg6Cb_YlU", duration: "15 min", order: 1 },
                    { courseId, title: "2. Figma Crash Course", youtubeId: "FTFaQWZBqQ8", duration: "40 min", order: 2 }
                );
            } else if (titleLower.includes('marketing') || titleLower.includes('ads')) {
                lessonsToAdd.push(
                    { courseId, title: "1. Digital Marketing 101", youtubeId: "bixR-KIJKYM", duration: "20 min", order: 1 },
                    { courseId, title: "2. Google Ads Tutorial", youtubeId: "j63jY9i6fV4", duration: "30 min", order: 2 }
                );
            } else {
                // Дефолтные уроки для остальных категорий
                lessonsToAdd.push(
                    { courseId, title: "1. Course Introduction", youtubeId: "jNQXAC9IVRw", duration: "5 min", order: 1 },
                    { courseId, title: "2. Core Concepts", youtubeId: "916GWv2Qs08", duration: "20 min", order: 2 },
                    { courseId, title: "3. Advanced Topics", youtubeId: "HXV3zeQKqGY", duration: "30 min", order: 3 }
                );
            }
        }

        // 4. Записываем уроки в базу
        if (lessonsToAdd.length > 0) {
            await db.collection('lessons').insertMany(lessonsToAdd);
            console.log(`Successfully added ${lessonsToAdd.length} lessons to ${courses.length} courses!`);
        } else {
            console.log('No courses found to add lessons to.');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

addLessonsToExistingCourses();
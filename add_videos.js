const { MongoClient, ObjectId } = require('mongodb');

// Твоя ссылка на базу
const uri = "mongodb+srv://aruzhanimka0_db_user:Ffhefhe31072007@cluster0.a4nf5lr.mongodb.net/?appName=Cluster0";

async function addVideosToExistingCourses() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('edusphere_lms');

        console.log("Connected. Fetching courses...");

        // 1. Получаем все твои существующие курсы
        const courses = await db.collection('courses').find({}).toArray();
        console.log(`Found ${courses.length} courses.`);

        // 2. Очищаем старую коллекцию уроков (на всякий случай, чтобы не дублировать)
        await db.collection('lessons').deleteMany({});

        const lessons = [];

        // 3. Проходимся по каждому курсу и создаем для него уроки
        for (const course of courses) {
            const courseId = course._id;
            const title = course.title.toLowerCase();

            // Логика: смотрим на название твоего курса и даем подходящие видео
            if (title.includes('web') || title.includes('html') || title.includes('css')) {
                lessons.push(
                    { courseId, title: "1. Intro to Web Dev", youtubeId: "fq4N0hgOWzU", duration: "10 min", order: 1 },
                    { courseId, title: "2. HTML Basics", youtubeId: "pQN-pnXPaVg", duration: "25 min", order: 2 },
                    { courseId, title: "3. CSS Crash Course", youtubeId: "yfoY53QXEnI", duration: "30 min", order: 3 }
                );
            } else if (title.includes('python') || title.includes('data')) {
                lessons.push(
                    { courseId, title: "1. Python Setup", youtubeId: "rfscVS0vtbw", duration: "15 min", order: 1 },
                    { courseId, title: "2. Pandas Intro", youtubeId: "vmEHCJofslg", duration: "45 min", order: 2 }
                );
            } else if (title.includes('design')) {
                lessons.push(
                    { courseId, title: "1. UI/UX Principles", youtubeId: "c9Wg6Cb_YlU", duration: "20 min", order: 1 }
                );
            } else {
                // Если название не совпало, добавляем дефолтные уроки
                lessons.push(
                    { courseId, title: "1. Introduction", youtubeId: "jNQXAC9IVRw", duration: "5 min", order: 1 },
                    { courseId, title: "2. Main Concepts", youtubeId: "916GWv2Qs08", duration: "20 min", order: 2 }
                );
            }
        }

        // 4. Загружаем уроки в базу
        if (lessons.length > 0) {
            await db.collection('lessons').insertMany(lessons);
            console.log(`Successfully added ${lessons.length} lessons to your database!`);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.close();
    }
}

addVideosToExistingCourses();
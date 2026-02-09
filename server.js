const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { connectToDb } = require('./database/db');
const courseRoutes = require('./routes/courses');
const authRoutes = require('./routes/auth');
const templateHelpers = require('./utils/templateHelpers');


const app = express();
const PORT = 3000;

connectToDb((err) => {
    if (err) {
        console.error('Failed to connect to DB');
        process.exit(1);
    }
    console.log('Connected to DB');
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

app.set('trust proxy', 1);

app.use(session({
    secret: 'edusphere-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 // 24 часа
    }
}));

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Функция шаблонизатора
const renderTemplate = (res, templatePath, data = {}) => {
    return new Promise((resolve, reject) => {
        fs.readFile(path.join(__dirname, 'views', templatePath), 'utf8', (err, content) => {
            if (err) {
                reject(err);
                return;
            }

            const headerPath = path.join(__dirname, 'views', 'partials', 'header.html');
            const footerPath = path.join(__dirname, 'views', 'partials', 'footer.html');

            fs.readFile(headerPath, 'utf8', (err, header) => {
                if (err) {
                    reject(err);
                    return;
                }

                fs.readFile(footerPath, 'utf8', (err, footer) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    let renderedHeader = header;

                    // 1. Активные пункты меню
                    if (data.active) {
                        Object.keys(data.active).forEach(key => {
                            renderedHeader = renderedHeader.replace(
                                `class="{{#if active.${key}}}active{{/if}}"`,
                                data.active[key] ? 'class="active"' : ''
                            );
                            renderedHeader = renderedHeader.replace(
                                `{{#if active.${key}}}active{{/if}}`,
                                data.active[key] ? 'active' : ''
                            );
                        });
                    }

                    // 2. Логика авторизации
                    renderedHeader = renderedHeader.replace(
                        /\{\{#if user\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g,
                        (match, ifContent, elseContent) => {
                            return res.locals.user ? ifContent : elseContent;
                        }
                    );

                    renderedHeader = renderedHeader.replace(
                        /\{\{#if user\}\}([\s\S]*?)\{\{\/if\}\}/g,
                        (match, content) => {
                            return res.locals.user ? content : '';
                        }
                    );

                    if (res.locals.user) {
                        renderedHeader = renderedHeader.replace(/{{user\.username}}/g, res.locals.user.username);
                    }

                    // 3. Очистка и Хелперы
                    renderedHeader = renderedHeader.replace(/{{#if.*?}}/g, '');
                    renderedHeader = renderedHeader.replace(/{{.*?}}/g, '');

                    Object.keys(templateHelpers).forEach(helper => {
                        const regex = new RegExp(`{{${helper}\\((.*?)\\)}}`, 'g');
                        content = content.replace(regex, (match, args) => {
                            return templateHelpers[helper](...args.split(',').map(arg => arg.trim().replace(/['"]/g, '')));
                        });
                    });

                    const rendered = renderedHeader + content + footer;
                    resolve(rendered);
                });
            });
        });
    });
};

// API Routes
app.use('/api/courses', courseRoutes);
app.use('/api/auth', authRoutes);

app.get('/api/info', (req, res) => {
    res.json({
        name: "EduSphere LMS API",
        version: "1.0.0",
        endpoints: {
            courses: "/api/courses",
            auth: "/api/auth"
        }
    });
});

// --- Page Routes ---

app.get('/', async (req, res) => {
    try {
        const html = await renderTemplate(res, 'index.html', { active: { home: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering index:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/about', async (req, res) => {
    try {
        const html = await renderTemplate(res, 'about.html', { active: { about: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering about:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/contact', async (req, res) => {
    try {
        const html = await renderTemplate(res, 'contact.html', { active: { contact: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering contact:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/search', async (req, res) => {
    try {
        const html = await renderTemplate(res, 'search.html', { active: { search: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering search:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/choose-role', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    if (req.session.user.role) {
        return res.redirect('/profile');
    }
    try {
        const html = await renderTemplate(res, 'choose-role.html', {});
        res.send(html);
    } catch (error) {
        console.error('Error rendering choose-role:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/login', async (req, res) => {
    if (req.session.user) {
        if (!req.session.user.role) {
            return res.redirect('/choose-role');
        }
        return res.redirect('/profile');
    }
    try {
        const html = await renderTemplate(res, 'login.html', { active: { login: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering login:', error);
        res.status(500).send('Internal Server Error');
    }
});

// --- НОВЫЙ МАРШРУТ ---
app.get('/professor-details', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        const html = await renderTemplate(res, 'professor-details.html', {});
        res.send(html);
    } catch (error) {
        console.error('Error rendering professor-details:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/register', async (req, res) => {
    if (req.session.user) {
        return res.redirect('/profile');
    }
    try {
        const html = await renderTemplate(res, 'register.html', { active: { register: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering register:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    try {
        const html = await renderTemplate(res, 'profile.html', { active: { profile: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering profile:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/add-course', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    // ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА: Если студент пытается зайти сюда вручную
    if (req.session.user.role !== 'professor') {
        return res.redirect('/profile');
    }

    try {
        const html = await renderTemplate(res, 'add-course.html', { active: { profile: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering add-course:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/item/:id', async (req, res) => {
    try {
        const html = await renderTemplate(res, 'item.html', {});
        res.send(html);
    } catch (error) {
        console.error('Error rendering item:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post('/contact', (req, res) => {
    const { name, email, message } = req.body;
    console.log('Contact form submission:', { name, email, message });
    res.redirect('/contact?success=true');
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
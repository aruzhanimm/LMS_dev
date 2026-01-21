const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const { connectToDb } = require('./database/db');
const courseRoutes = require('./routes/courses');
const authRoutes = require('./routes/auth');

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


app.use(session({
    secret: 'edusphere-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 24 часа
    }
}));


app.use((req, res, next) => {

    res.locals.user = req.session.user || null;
    next();
});


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
                    if (data.active) {
                        Object.keys(data.active).forEach(key => {
                            renderedHeader = renderedHeader.replace(
                                `class="{{#if active.${key}}}active{{/if}}"`,
                                data.active[key] ? 'class="active"' : ''
                            );
                        });
                    }


                    renderedHeader = renderedHeader.replace(/{{#if.*?}}/g, '');
                    renderedHeader = renderedHeader.replace(/{{.*?}}/g, '');


                    if (res.locals.user) {
                        renderedHeader = renderedHeader.replace('{{user.username}}', res.locals.user.username);
                    } else {
                        renderedHeader = renderedHeader.replace(/{{user\.username}}/g, '');
                    }


                    renderedHeader = renderedHeader.replace(/\{\{#if user\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
                        return res.locals.user ? content : '';
                    });
                    renderedHeader = renderedHeader.replace(/\{\{#else\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, content) => {
                        return !res.locals.user ? content : '';
                    });

                    const rendered = renderedHeader + content + footer;
                    resolve(rendered);
                });
            });
        });
    });
};


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
        const html = await renderTemplate(res,'search.html', { active: { search: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering search:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/login', async (req, res) => {
    if (req.session.user) {
        return res.redirect('/profile');
    }
    try {
        const html = await renderTemplate(res,'login.html', { active: { login: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering login:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/register', async (req, res) => {
    if (req.session.user) {
        return res.redirect('/profile');
    }
    try {
        const html = await renderTemplate(res,'register.html', { active: { register: true } });
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
        const html = await renderTemplate(res,'profile.html', { active: { profile: true } });
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
    try {
        const html = await renderTemplate(res,'add-course.html', { active: { profile: true } });
        res.send(html);
    } catch (error) {
        console.error('Error rendering add-course:', error);
        res.status(500).send('Internal Server Error');
    }
});


app.get('/item/:id', async (req, res) => {
    try {
        const html = await renderTemplate(res,'item.html', {});
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
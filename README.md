# EduSphere - Learning Management System

## Project Overview
EduSphere is a modern Learning Management System designed to revolutionize online education.
Assignment 2 Part 2 implemented Database integration using SQLite.

## Team Members
- **Aruzhan Kartam**  - Full Stack Developer

## Technologies
- **Backend**: Node.js, Express.js
- **Database**: SQLite3 (Lightweight, file-based DB)
- **Frontend**: HTML5, CSS3, JavaScript

## Database Structure
We use one main entity: **Courses**.
Table: `courses`
| Field       | Type    | Description             |
|-------------|---------|-------------------------|
| id          | INTEGER | Primary Key (Auto Inc)  |
| title       | TEXT    | Name of the course      |
| description | TEXT    | Detailed info           |
| duration    | TEXT    | Course length (e.g. 40h)|
| instructor  | TEXT    | Teacher's name          |

## API Documentation (CRUD)
The project provides a REST API at `/api/courses`.

| Method | Endpoint          | Description            | Status Codes |
|--------|-------------------|------------------------|--------------|
| GET    | `/api/courses`    | Get all courses        | 200, 500     |
| GET    | `/api/courses/:id`| Get course by ID       | 200, 400, 404|
| POST   | `/api/courses`    | Create new course      | 201, 400, 500|
| PUT    | `/api/courses/:id`| Update existing course | 200, 400, 404|
| DELETE | `/api/courses/:id`| Delete course by ID    | 200, 400, 404|

### How to Run
1. Install dependencies:
   ```bash
   npm install
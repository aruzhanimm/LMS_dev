module.exports = {
    // Функция сравнения для шаблонов
    eq: (a, b) => a === b,
    // Проверка роли
    isProfessor: (role) => role === 'professor',
    // Форматирование даты
    formatDate: (date) => new Date(date).toLocaleDateString()
};
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv')

dotenv.config()

// const uri = "mongodb+srv://aruzhanimka0_db_user:Ffhefhe31072007@cluster0.a4nf5lr.mongodb.net/?appName=Cluster0";
const uri = process.env.MONGODB_URI

let dbConnection;

module.exports = {
  connectToDb: (cb) => {
    MongoClient.connect(uri)
      .then((client) => {
        dbConnection = client.db('edusphere_lms');
        return cb();
      })
      .catch(err => {
        console.log(err);
        return cb(err);
      });
  },
  getDb: () => dbConnection
};
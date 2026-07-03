require('dotenv').config();
const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  const secret = process.env.JWT_SECRET || 'defaultsecret';
  const expiresIn = process.env.JWT_EXPIRE || '1h';
  return jwt.sign({ id }, secret, { expiresIn });
};

const testUserId = '12345'; // Replace with a valid user ID from your database
const token = generateToken(testUserId);

console.log('Generated Token:', token);
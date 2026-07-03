const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Default users for each role
const defaultUsers = [
  {
    name: 'Super Admin',
    email: 'superadmin@crambrunch.com',
    password: 'SuperAdmin@123',
    role: 'super_admin',
    department: 'Administration',
    phone: '+1234567890',
    approvalStatus: 'approved',
    isEmailVerified: true,
    requires2FA: true
  },
  {
    name: 'Head of Department',
    email: 'hod@crambrunch.com',
    password: 'Hod@123',
    role: 'hod',
    department: 'Computer Science',
    phone: '+1234567891',
    approvalStatus: 'approved',
    isEmailVerified: true
  },
  {
    name: 'Teacher One',
    email: 'teacher@crambrunch.com',
    password: 'Teacher@123',
    role: 'teacher',
    department: 'Computer Science',
    phone: '+1234567892',
    subjects: ['Data Structures', 'Algorithms'],
    qualification: 'M.Tech Computer Science',
    experience: 5,
    approvalStatus: 'approved',
    isEmailVerified: true
  },
  {
    name: 'Student One',
    email: 'student@crambrunch.com',
    password: 'Student@123',
    role: 'student',
    rollNumber: 'CS001',
    department: 'Computer Science',
    semester: 6,
    phone: '+1234567893',
    parentName: 'Parent One',
    parentEmail: 'parent@crambrunch.com',
    address: '123 Student Street, City',
    dateOfBirth: new Date('2000-01-01'),
    approvalStatus: 'approved',
    isEmailVerified: true
  },
  {
    name: 'Parent One',
    email: 'parent@crambrunch.com',
    password: 'Parent@123',
    role: 'parent',
    phone: '+1234567894',
    approvalStatus: 'approved',
    isEmailVerified: true
  }
];

async function seedDefaultUsers() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    for (const userData of defaultUsers) {
      // Check if user already exists
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) {
        console.log(`⚠️  User with email ${userData.email} already exists. Skipping...`);
        continue;
      }

      // Create new user
      const user = new User(userData);
      await user.save();
      console.log(`✅ Created ${userData.role} user: ${userData.email}`);
    }

    console.log('🎉 Default users seeding completed!');
  } catch (error) {
    console.error('❌ Error seeding default users:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the seeding function
seedDefaultUsers();

const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function enableSuperAdmin2FA() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Find and update super admin
    const superAdmin = await User.findOne({ role: 'super_admin' });
    if (!superAdmin) {
      console.log('❌ Super Admin not found');
      return;
    }

    superAdmin.requires2FA = true;
    await superAdmin.save();

    console.log('✅ Super Admin 2FA enabled successfully');
    console.log('📧 Email: superadmin@crambrunch.com');
    console.log('🔑 Password: SuperAdmin@123');
    console.log('🔐 2FA: Enabled - OTP will be sent to terminal/console');

  } catch (error) {
    console.error('❌ Error updating super admin:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the update function
enableSuperAdmin2FA();
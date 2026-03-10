const mongoose = require('mongoose');
const User = require('../models/User');
const dotenv = require('dotenv');

dotenv.config();

const seedAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Delete all existing admin users
    const deletedCount = await User.deleteMany({ role: 'super_admin' });
    if (deletedCount.deletedCount > 0) {
      console.log(`🗑️  Deleted ${deletedCount.deletedCount} existing admin user(s)`);
    }

    // Create Super Admin user
    const admin = await User.create({
      name: 'Admin',
      email: 'buksu.alagad@gmail.com',
      password: 'Admin001',
      role: 'super_admin'
    });

    console.log('✅ Super Admin created successfully!');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Password: Admin001');
    console.log('\nℹ️  Use these credentials to login in the frontend!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();

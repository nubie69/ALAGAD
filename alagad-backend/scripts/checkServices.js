const mongoose = require('mongoose');
const Service = require('../models/Service');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/alagad';

async function checkServices() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    const services = await Service.find().populate('office').populate({
      path: 'office',
      populate: { path: 'building' }
    });
    
    console.log(`\n📊 Total Services: ${services.length}\n`);
    
    if (services.length === 0) {
      console.log('⚠️  No services found in the database.');
      console.log('\nTo add services, you can use the SuperAdmin dashboard.');
    } else {
      console.log('Services List:');
      console.log('================');
      services.forEach((service, index) => {
        console.log(`${index + 1}. ${service.name}`);
        console.log(`   Office: ${service.office?.name || 'N/A'}`);
        console.log(`   Building: ${service.office?.building?.name || 'N/A'}`);
        console.log(`   Description: ${service.description || 'N/A'}`);
        console.log('');
      });
    }

    await mongoose.connection.close();
    console.log('\n✓ Database connection closed');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkServices();

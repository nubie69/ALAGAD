const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Department = require('../models/Department');
const Building = require('../models/Building');

dotenv.config();

const checkDepartments = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected\n');

    const departments = await Department.find().populate('building');
    
    console.log('📋 DEPARTMENTS IN DATABASE:');
    console.log('─'.repeat(60));
    
    if (departments.length === 0) {
      console.log('⚠️  No departments found!');
    } else {
      departments.forEach((dept, index) => {
        console.log(`${index + 1}. ${dept.name}`);
        console.log(`   Code: ${dept.code || 'N/A'}`);
        console.log(`   Building: ${dept.building ? dept.building.name : '❌ NOT SET'}`);
        console.log(`   Floor: ${dept.floor || '❌ NOT SET'}`);
        console.log(`   Active: ${dept.active !== false ? '✅ Yes' : '❌ No'}`);
        console.log('');
      });
    }
    
    console.log('─'.repeat(60));
    console.log(`Total: ${departments.length} departments\n`);
    
    const buildings = await Building.find();
    console.log('🏢 BUILDINGS IN DATABASE:');
    console.log('─'.repeat(60));
    
    if (buildings.length === 0) {
      console.log('⚠️  No buildings found!');
    } else {
      buildings.forEach((building, index) => {
        console.log(`${index + 1}. ${building.name} (${building.numberOfFloors || 'N/A'} floors)`);
        console.log(`   Location: ${building.location}`);
        console.log('');
      });
    }
    
    console.log('─'.repeat(60));
    console.log(`Total: ${buildings.length} buildings`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

checkDepartments();

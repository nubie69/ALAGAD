const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Building = require('../models/Building');
const Department = require('../models/Department');

dotenv.config();

const backfillDepartmentBuildings = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    // Get or create sample buildings
    let buildings = await Building.find();

    if (buildings.length === 0) {
      console.log('📦 Creating sample buildings...');
      buildings = await Building.insertMany([
        {
          name: 'Administration Building',
          location: 'Main Campus',
          description: 'Administrative offices and services',
          numberOfFloors: 3
        },
        {
          name: 'Academic Building',
          location: 'Main Campus',
          description: 'Academic departments and classrooms',
          numberOfFloors: 4
        },
        {
          name: 'IT Building',
          location: 'North Wing',
          description: 'Information Technology facilities',
          numberOfFloors: 2
        },
        {
          name: 'Facilities Building',
          location: 'Service Area',
          description: 'Campus facilities and maintenance',
          numberOfFloors: 1
        }
      ]);
      console.log(`✅ Created ${buildings.length} buildings`);
    } else {
      console.log(`✅ Found ${buildings.length} existing buildings:`);
      buildings.forEach(b => console.log(`   - ${b.name} (${b.numberOfFloors} floors)`));
    }

    console.log('\n📋 Updating departments...');
    
    // Get all departments
    const departments = await Department.find();
    console.log(`Found ${departments.length} departments`);

    let updatedCount = 0;

    // Assign buildings to departments based on keywords
    for (const department of departments) {
      const deptName = department.name.toLowerCase();
      let selectedBuilding = null;

      if (deptName.includes('it')) {
        selectedBuilding = buildings.find(b => b.name.includes('IT'));
      } else if (deptName.includes('admin')) {
        selectedBuilding = buildings.find(b => b.name.includes('Administration'));
      } else if (deptName.includes('facilities')) {
        selectedBuilding = buildings.find(b => b.name.includes('Facilities'));
      } else if (deptName.includes('academic')) {
        selectedBuilding = buildings.find(b => b.name.includes('Academic'));
      } else if (deptName.includes('security')) {
        selectedBuilding = buildings.find(b => b.name.includes('Administration'));
      } else {
        // Default to first building
        selectedBuilding = buildings[0];
      }

      if (selectedBuilding) {
        department.building = selectedBuilding._id;
        if (!department.floor) {
          department.floor = 1;
        }
        await department.save();
        updatedCount++;
        console.log(`✅ ${department.name} → ${selectedBuilding.name} (Floor ${department.floor})`);
      }
    }

    console.log(`\n✨ Successfully updated ${updatedCount} departments!`);
    console.log('💡 Refresh the Department Management page to see the floor values.');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

backfillDepartmentBuildings();

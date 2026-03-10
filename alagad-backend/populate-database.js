const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

// Import models using relative paths from backend directory
const User = require('./models/User');
const Building = require('./models/Building');
const Office = require('./models/Office');

const sampleData = {
  users: [
    {
      name: 'Admin',
      email: 'buksu.alagad@gmail.com',
      password: 'Admin001',
      role: 'super_admin'
    }
  ],
  buildings: [
    {
      name: 'Main Building',
      location: {
        type: 'Point',
        coordinates: [125.6193, 7.0644] // Bohol coordinates as example
      },
      description: 'Main administrative building with offices and classrooms'
    },
    {
      name: 'Library Building',
      location: {
        type: 'Point',
        coordinates: [125.6195, 7.0646]
      },
      description: 'University library with study areas and research facilities'
    },
    {
      name: 'Science Building',
      location: {
        type: 'Point',
        coordinates: [125.6191, 7.0642]
      },
      description: 'Laboratories and science classrooms'
    }
  ],
  offices: [
    {
      name: "Registrar's Office",
      building: 'Main Building',
      contactInfo: 'registrar@bukSU.edu.ph',
      description: 'Student records and enrollment services'
    },
    {
      name: 'Library Circulation',
      building: 'Library Building',
      contactInfo: 'library@bukSU.edu.ph',
      description: 'Book lending and library services'
    },
    {
      name: 'Computer Science Department',
      building: 'Science Building',
      contactInfo: 'cs@bukSU.edu.ph',
      description: 'Computer science faculty and labs'
    }
  ]
};

async function populateDatabase() {
  try {
    // Connect to MongoDB
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    console.log('Clearing existing data...');
    await User.deleteMany({});
    await Building.deleteMany({});
    await Office.deleteMany({});
    console.log('Existing data cleared');

    // Create users with hashed passwords
    console.log('Creating users...');
    const createdUsers = [];
    for (const userData of sampleData.users) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      const user = new User({
        ...userData,
        password: hashedPassword
      });
      
      await user.save();
      createdUsers.push(user);
      console.log(`Created user: ${user.name} (${user.role})`);
    }

    // Create buildings
    console.log('Creating buildings...');
    const createdBuildings = [];
    for (const buildingData of sampleData.buildings) {
      const building = new Building(buildingData);
      await building.save();
      createdBuildings.push(building);
      console.log(`Created building: ${building.name}`);
    }

    // Create offices
    console.log('Creating offices...');
    for (const officeData of sampleData.offices) {
      // Find the building by name
      const building = createdBuildings.find(b => b.name === officeData.building);
      if (building) {
        const office = new Office({
          ...officeData,
          building: building._id
        });
        await office.save();
        console.log(`Created office: ${office.name} in ${building.name}`);
      }
    }

    console.log('\n✅ Database population completed successfully!');
    console.log('\nLogin credentials:');
    sampleData.users.forEach(user => {
      console.log(`- ${user.role.toUpperCase()}: ${user.email} / ${user.password}`);
    });
    
    console.log('\nSample data added:');
    console.log(`- ${createdUsers.length} users`);
    console.log(`- ${createdBuildings.length} buildings`);
    console.log(`- ${sampleData.offices.length} offices`);

  } catch (error) {
    console.error('Error populating database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  }
}

// Run the population
populateDatabase();
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const Building = require('../models/Building');
const Room = require('../models/Room');
const Office = require('../models/Office');
const FacultyStaff = require('../models/FacultyStaff');
const Service = require('../models/Service');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to get campus context
const getCampusContext = async () => {
  try {
    const activeFilter = { isActive: { $ne: false } };
    const buildings = await Building.find(activeFilter).select('name location description').limit(20);
    const offices = await Office.find(activeFilter).select('name description department').populate('building', 'name').limit(20);
    const services = await Service.find(activeFilter).select('name description').limit(10);
    const facultyStaff = await FacultyStaff.find(activeFilter).select('name title').populate('office', 'name').limit(10);

    return `
Campus Information Context:
      
BUILDINGS:
${buildings.map(b => `- ${b.name}: ${b.location}${b.description ? ' - ' + b.description : ''}`).join('\n')}

OFFICES & DEPARTMENTS:
${offices.map(o => `- ${o.name} (${o.department}): ${o.building?.name || 'Unknown Building'}${o.description ? ' - ' + o.description : ''}`).join('\n')}

SERVICES:
${services.map(s => `- ${s.name}${s.description ? ': ' + s.description : ''}`).join('\n')}

STAFF DIRECTORY (Sample):
${facultyStaff.slice(0, 5).map(f => `- ${f.name} (${f.title}): ${f.office?.name || 'Unknown'}`).join('\n')}
    `.trim();
  } catch (error) {
    console.error('Error fetching campus context:', error);
    return 'Unable to fetch campus information at this moment.';
  }
};

// @desc    Chat with AI about campus
// @route   POST /api/chat
// @access  Public (Guest only)
router.post('/', async (req, res) => {
  try {
    const { message, language = 'en' } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key is not configured' });
    }

    // Get campus context
    const campusContext = await getCampusContext();

    // Language-specific instructions
    const languageInstructions = {
      en: 'Respond in English.',
      tl: 'Respond in Tagalog (Filipino). Use natural, conversational Tagalog.',
      ceb: 'Respond in Cebuano (Bisaya). Use natural, conversational Cebuano.'
    };

    // Create the system prompt with campus context
    const systemPrompt = `You are CampusGuide AI, a smart, friendly, and professional Campus Navigation Assistant.

Main Responsibilities:
- Help students, visitors, and staff navigate the campus.
- Provide directions to buildings, rooms, offices, and departments.
- Answer general school-related questions.
- Assist in Cebuano, Tagalog, English, or mixed language (Taglish).

Language Rules:
- Automatically detect the user's language.
- Reply in the same language used by the user.
- Keep responses natural and conversational.
- If mixed language is used, respond naturally in mixed language.

Response Style:
- Be polite, helpful, and clear.
- Keep answers short and easy to follow.
- Use step-by-step format for directions.
- Avoid long paragraphs unless necessary.

Navigation Format Example:
"From the Main Gate, walk straight toward the Administration Building. Turn right beside the Library. The Registrar's Office is on the second floor."

If Information Is Unknown:
"I'm sorry, I don't have that information yet. Please contact the school office for assistance."

Rules:
- Do NOT invent fake campus information.
- Stay focused on campus-related topics.
- Politely redirect if question is unrelated.
- Maintain a professional and friendly tone.

You are reliable, accurate, and student-friendly.

${campusContext}`;

    // Call OpenAI API
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: message,
        },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = response.choices[0]?.message?.content || 'Unable to process your request.';

    res.json({
      success: true,
      reply,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Chat API error:', error);
    
    if (error.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }
    
    if (error.status === 401) {
      return res.status(401).json({ error: 'Invalid OpenAI API key.' });
    }

    res.status(500).json({
      error: error.message || 'Error processing chat request',
    });
  }
});

module.exports = router;

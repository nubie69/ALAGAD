# Service Questions with Specific Answers

## Service: Transcript of Records

### Question Types and Expected Answers:

#### 1. **Requirements Question**
**Q:** What do I need for a Transcript of Records?
**A:** To get Transcript of Records, you should have these requirements: Valid ID and Request form.

#### 2. **Process/Steps Question**
**Q:** How do I get a Transcript of Records step by step?
**A:** The process for Transcript of Records is first, submit requirements; next, pay the fee; finally, claim document.

#### 3. **Description/Details Question**
**Q:** What is Transcript of Records?
**A:** Transcript of Records is Request and release of transcript.

#### 4. **Location Question**
**Q:** Where can I get a Transcript of Records?
**A:** Transcript of Records can be processed at Registrar Office, Administration Building.

---

## Service: Entrance Examination Registration

### Question Types and Expected Answers:

#### 1. **Service Query**
**Q:** How do I register for entrance exam?
**A:** Service: Entrance Examination Registration. Office: Registrar Office.

#### 2. **Synonym Variant Query**
**Q:** What about exam registration?
**A:** Service: Entrance Examination Registration. Office: Registrar Office.

---

## General Service Response Format Rules

### Response Categories:

1. **Requirements-Only Response:**
   - Format: "To get [Service Name], you should have these requirements: [requirement 1] and [requirement 2]."
   - Triggered by: "What do I need?", "What are the requirements?", "What's needed for..."

2. **Process/Steps Response:**
   - Format: "The process for [Service Name] is first, [step 1]; next, [step 2]; finally, [step 3]."
   - Triggered by: "How do I...", "What are the steps?", "Process for...", "Step by step..."
   - Note: Do NOT include numbered format (step 1, step 2, etc.)

3. **Description Response:**
   - Format: "[Service Name] is [description]."
   - Triggered by: "What is...", "Tell me about...", "Describe..."

4. **Location/Where Response:**
   - Format: "[Service Name] can be processed at [Office Name], [Building Name]."
   - Triggered by: "Where can I...", "Where is...", "Which office handles..."

5. **Full Service Response:**
   - Returns: Service Name, Description, Requirements (if available), Process (if available), and Location
   - Triggered by: General queries without specific aspect mention

---

## Service Data Structure

Each service contains:
- **name**: Service name
- **description**: What the service does
- **steps**: Array of process steps
- **requirements**: Array of needed documents/items
- **stakeholder/stakeholders**: Who handles the service
- **category**: Service category
- **deadline**: Any time limits
- **processingTime**: How long it takes
- **department**: Related department
- **office**: Related office with building info

---

## Query Keywords for Service Intent Detection

### Strong Service Intent Triggers:
- "How do I..." ← Process steps
- "What do I need..." ← Requirements
- "What is..." ← Description
- "Where can I..." ← Location
- "Step by step..." ← Process
- "Process for..." ← Process
- "Requirements for..." ← Requirements
- "How to..." ← Process
- "Get a [service]..." ← Full service info

### Fuzzy Matching Rules:
- Typo normalization enabled (e.g., "departmnt" → "department")
- Abbreviation expansion (TOR, COE, COR, COC, ID)
- Synonym matching (exam = entrance examination registration)
- Short token rules: tokens ≤3 chars require exact matches to prevent false positives

---

## Chatbot Response Fallbacks

If no service matches:
- **No match found**: "Sorry, that information is not available in the campus database."
- **Vague query**: "Can you clarify what you mean? Please specify if you need details, location, process/step-by-step, requirements, or personnel contact."
- **Non-campus query**: "I can only assist with campus-related information."

---

## Example Service Database Records

### Record 1: Transcript of Records
```
{
  name: "Transcript of Records",
  description: "Request and release of transcript",
  steps: ["Submit requirements", "Pay the fee", "Claim document"],
  requirements: ["Valid ID", "Request form"],
  office: "Registrar Office",
  building: "Administration Building",
  category: "Academic Documents",
  processingTime: "3-5 business days"
}
```

### Record 2: Entrance Examination Registration
```
{
  name: "Entrance Examination Registration",
  aliases: ["Entrance Exam Registration", "Exam Registration"],
  description: "Registration for entrance examination",
  office: "Registrar Office",
  category: "Admissions"
}
```

---

## Testing Service Q&A

To test these questions, make a POST request to:
```
POST /api/chatbot
Content-Type: application/json

{
  "query": "What do I need for a Transcript of Records?",
  "language": "en"
}
```

Expected response will include intent detection and formatted answer based on the service data.

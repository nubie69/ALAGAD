# NLP document questions and expected intents

Source: Alagad_NLP Accuracy Test Queries (1).docx

This dataset contains all 15 source questions in their original order. Expected intents were assigned from the meaning of each question, independently of chatbot predictions. Expected answers are transcribed from the source Expected Output column; they are not independently verified campus facts. The source Actual Output and Panel Check columns are not used as predictions.

Run with the backend available:

```powershell
npm run evaluate:nlp
```

The evaluator scores exact agreement between expected_intent and the live API intent. It does not score expected_answer. No new results have been generated for this dataset. Earlier 44-question results do not apply to these 15 questions.

Voice cases are submitted as text transcripts; this run does not evaluate speech recognition. There are five Voice cases and ten Text cases. Q14 normalizes the source input type Tex to Text.

## Questions and labels

| Test | Question | Input | Language | Expected intent |
|---|---|---|---|---|
| 1 | What are the requirements for obtaining an Exemption Slip? | Voice | en | `requirements` |
| 2 | What is the step-by-step procedure for getting an Exemption Slip? | Voice | en | `process` |
| 3 | What is the process for ID RE-ISSUANCE? | Text | en | `process` |
| 4 | What is the process for Online Enrollment? | Voice | en | `process` |
| 5 | What are the requirements for an Online enrollment? | Text | en | `requirements` |
| 6 | What are the requirements needed for issuance of permit to stay | Text | en | `requirements` |
| 7 | Where can I validate my ID? | Voice | en | `where_process` |
| 8 | Where can I find Dr Sales Aribe? | Text | en | `where` |
| 9 | Where can I find Dr. Lorenzo Dinlayan? | Text | en | `where` |
| 10 | Who is the Director of the Student Leadership and Development? | Text | en | `who` |
| 11 | How to apply for an Entrance Examination? | Voice | en | `process` |
| 12 | Unsaon pag kuha sa Examination Result? | Text | ceb | `process` |
| 13 | Unsaon pag kuha ug Student Admission Slip? | Text | ceb | `process` |
| 14 | Unsa nga Unit ang ga handle sa Entrance Exam? | Text | ceb | `unit_handler` |
| 15 | Ano ang mga requirements para sa pagpa validate ng ID? | Text | tl | `requirements` |

## Coverage

- `process`: 6
- `requirements`: 4
- `unit_handler`: 1
- `where`: 2
- `where_process`: 1
- `who`: 1

This small dataset covers six intents and has no unsupported-question examples. Its F1 scores cannot establish performance across all chatbot capabilities. Q7 is where_process because it asks where to obtain a service; Q8 and Q9 are where because they locate named people.

## Expected answer references

### Test 1

According to verified information from "Student Leadership & Development Unit (SLEDEVU)", to get "EXEMPTION SLIP", you should have these requirements: Validated Student Identification Card and Letter request (Attachment to the declared reason for exemption).

### Test 2

According to verified information from "Student Leadership & Development Unit (SLEDEVU)", the process for "EXEMPTION SLIP" is first, present Identification Card & Printed Letter request with attachment; next, sign the Logbook; finally, fill out the Customer Feedback Form /BOSES.

### Test 3

According to verified information from "Office of the Vice President for Culture, Arts, Sports and Student Services (OVPCASSS)", the process for "ID RE-ISSUANCE" is first, present old ID for card replacement/affidavit of lost for lost ID; next, sign the Logbook; next, fill out the Customer Feedback Form or scan the QR code provided; next, proceed to the Cashier's Office for payment; finally, proceed to University Press for ID printing.

### Test 4

According to verified information from "Registrar", the process for "Online Enrollment of New & Transferee Students" is first, visit the link: https://www.admissions.buksu.edu.ph and log in account; next, apply for the desired program, enroll, and upload the necessary documentary requirements; next, download and review the COR; next, submit original copies of documentary requirements to Window 1 or 2; finally, proceed to the validation of enrollment Accounting.

### Test 5

According to verified information from "Registrar", to get "Online Enrollment of New & Transferee Students", you should have these requirements: High School Graduate, Original Form 138, and Original Good Moral certificate.

### Test 6

According to verified information from "Student Leadership & Development Unit (SLEDEVU)", to get "ISSUANCE OF PERMIT TO STAY OVERNIGHT AND EXTENDED USE OF UNIVERSITY FACILITIES", you should have these requirements: Validated Student Identification Card and Provide letter request to stay overnight and extended use of campus facilities.

### Test 7

According to verified information from "Office of the Vice President for Culture, Arts, Sports and Student Services (OVPCASSS)", "validation & Activation of School ID (Identification Card)" can be processed at "Office of the Vice President for Culture, Arts, Sports and Student Services (OVPCASSS)", ADMIN bldgg., Floor 1.

### Test 8

Dr. Sales Aribe Jr can be found at IT Office, COT bldg., Floor 3.

### Test 9

Dr. Lorenzo B. Dinlayan III can be found at Student Leadership & Development Unit (SLEDEVU), ADMIN bldgg., Floor 1.

### Test 10

Dr. Lorenzo B. Dinlayan III is the head of Student Leadership & Development Unit (SLEDEVU). Dr. Lorenzo B. Dinlayan III can be found at Student Leadership & Development Unit (SLEDEVU), ADMIN bldgg., Floor 1.

### Test 11

According to verified information from "Admission and Testing Unit (ATU)", the process for "Entrance Examination Application for Incoming 1st Year Students & Transferees" is first, access admissions.buksu.edu.ph on a browser and click "Register" or "Login"; next, register an active email address and create a password. Read the privacy and terms agreement to next steps; next, access Gmail inbox to activate admission account; next, proceed to complete the online application by providing the required information and submission of documentary requirement; next, proceed to select date and time of the admission test; finally, submit the accomplished online application for evaluation.

### Test 12

Sumala sa verified info gikan sa "Admission and Testing Unit (ATU)", ang proseso para sa Entrance Examination Application para sa Incoming 1st Year Students & Transferees kay: una, adto sa admissions. buksu.

Review note: The question asks for examination results, but the source expected answer describes entrance examination application and ends mid-address. Do not use it as an approved factual-answer reference until reviewed.

### Test 13

ang proseso para sa "STUDENT ADMISSION SLIP" kay: una, ipakita ang Identification Card ug Excuse letter nga gipirmahan sa guardian; sunod, pirma sa Logbook; ug sa katapusan, pun-on ang Customer Feedback Form /BOSES.

### Test 14

Sumala sa gipamatud-an nga impormasyon gikan sa "Admission and Testing Unit (ATU)", ang unit nga nagdumala sa Conduct of Entrance Examination para sa Incoming College Students mao ang "Admission and Testing Unit (ATU)".

Review note: Source input type "Tex" normalized to "Text".

### Test 15

Ayon sa impormasyon mula sa "Office of the Vice President for Culture, Arts, Sports and Student Services (OVPCASSS)", para makuha ang Validation & Activation ng School ID, kailangan mo ng Validated Certificate of Registration at Student Identification Card.

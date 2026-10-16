# Careflow healthcare demo

## Start the app and API

Requires Node.js 22.5 or newer. The backend uses Node's built-in HTTP server and SQLite (`node:sqlite`); there are no runtime packages to install.

1. Open a terminal in the `healthcare` folder.
2. Copy `.env.example` to `.env`.
3. Add your AI provider API key to `AI_API_KEY` in `.env`.
4. Start the app with `npm start`.
5. Open `http://127.0.0.1:3000`.

The key stays on the server and must never be added to `app.js`, HTML, or CSS. `.env` is excluded from Git. The default provider uses the OpenAI-compatible Chat Completions API; set `AI_API_URL` and `AI_MODEL` for a compatible provider. Provider API usage may be billed separately.

If no API key is configured, the API returns a clear `AI_NOT_CONFIGURED` error. The chat UI then offers its cited, curated offline health guide for supported common topics, clearly labeled as offline rather than live AI. Unsupported topics still report that live AI needs configuration instead of inventing an answer. To enable open-ended AI responses, add a valid provider key to `.env` and restart the server. Emergency guidance and fictional dashboard schedule responses are local and do not call the AI provider.

## SQLite database

The server creates `data/careflow.sqlite`, applies the schema and ownership migration, and idempotently seeds fictional sample patients covering diabetes, heart health, preventive care, asthma, high blood pressure, arthritis, chronic kidney health, COPD, cancer support, chronic pain, digestive health, epilepsy, migraine, mental wellbeing, osteoporosis, thyroid health, sleep health, allergies, skin health, and stroke recovery, plus today's demo appointments. Today's sample schedule is seeded on each server start without duplicating rows; new appointments are stored in SQLite and remain available after restarting the server. The sample patients are intentionally read-only: appointment requests must reference a seeded sample-patient ID, so the demo cannot store an arbitrary real patient's name.

Create an account from the sign-in page, using an email address and a password of at least 12 characters. `POST /api/auth/register` and `POST /api/auth/login` establish a seven-day, `HttpOnly`, `SameSite=Strict` session cookie; `POST /api/auth/logout` clears it. Passwords are stored as salted scrypt hashes, and only a hash of each random session token is stored. There is no email verification, password-reset flow, or multi-factor authentication in this demo.

The signed-in dashboard reads `GET /api/dashboard?date=YYYY-MM-DD`, `GET /api/patients`, `GET /api/pathways`, and `GET /api/appointments?date=YYYY-MM-DD` from SQLite. Dashboard patient, pathway, appointment, and next-appointment information is derived from these API results rather than fixed display values. Patient records remain in the database for demo appointments and care coordination, but there is no Patients page in the dashboard navigation. Select a disease pathway and one of ten informational approaches (Allopathy, Ayurvedic, Homeopathy, Naturopathy, Physiotherapy, Yoga, Acupressure, Acupuncture, Siddha, or Unani). The appointment form then asks for a fictional sample patient from that pathway, visit type, date, and time; matching fictional demo clinicians are suggested according to approach and availability. Open a profile for its demo credentials, experience, languages, focus areas, clinic, visit types, and availability. Selecting a profile saves the appointment and clinician to the signed-in user's schedule, then opens Appointments. Appointments can be viewed by date. All doctor profiles are fictional examples, not real or verified clinicians; do not rely on their invented credentials, experience, or availability for real care. Complementary approaches are informational, not a diagnosis, personalized medical advice, or a promise of cure. Homeopathy is not supported by reliable evidence as a treatment for health conditions and must not delay proven care. Discuss treatment decisions and supplements with a qualified clinician. `POST /api/appointments` validates the sample-patient ID, date, time, appointment type, optional pathway/approach, selected clinician, and that clinician's listed availability. A pathway appointment must use a fictional sample patient in that pathway. Duplicate bookings for the same sample patient, date, and time are rejected. Shared seeded appointments and fictional sample patients are visible to all accounts; appointments made by a signed-in user are scoped to that account. Set `DATABASE_PATH` in `.env` to choose a different local database file. The default `data/` folder and SQLite files are excluded from Git.

Only fictional sample patient records and demo appointments are stored. Demo appointments may include the selected fictional clinician, care approach, and pathway. Previously saved demo-clinician selections may remain in existing local databases. AI prompts, conversation history, medical notes, and clinical records are not written to the database. The SQLite file is local and unencrypted; keep it on a trusted machine and do not use this prototype for identifiable patient data or production healthcare records.

## Privacy and health-safety notes

- Chat questions and recent conversation turns are sent to the provider configured by the operator. Do not submit patient identifiers, medical records, or other sensitive personal information.
- The database stores account email addresses, display names, password hashes, session-token hashes, fictional seeded patients, demo appointments explicitly added for those sample patients, and optional care-pathway, care-approach, and demo clinician labels. AI chat history is not stored.
- The API limits request size, conversation length, request frequency, and provider wait time. It checks common emergency language before contacting the AI.
- AI health information can be wrong. It is general education, not a diagnosis, treatment plan, or replacement for a qualified clinician or local emergency services.
- The SQLite file is local and unencrypted; keep it on a trusted machine and do not use this prototype for identifiable patient data or production healthcare records. This demo does not provide account recovery or multi-factor authentication.
- The current in-memory rate limit is appropriate only for a single demo server. Public production deployments need HTTPS, a production-grade shared rate limiter, account recovery and verification, operational monitoring, provider privacy review, and clinical/legal review.

## Run tests

```sh
npm test
```

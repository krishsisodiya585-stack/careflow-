import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const SAMPLE_PATIENTS = [
  ["demo-jordan", "Jordan Mitchell", "JM", "Cardiology", "Heart health pathway", "avatar-blue"],
  ["demo-sofia", "Sofia Laurent", "SL", "Primary care", "Preventive care", "avatar-pink"],
  ["demo-ravi", "Ravi Kapoor", "RK", "Care coordination", "Diabetes management", "avatar-gold"],
  ["demo-emma", "Emma Thompson", "ET", "Endocrinology", "Diabetes management", "avatar-green"],
  ["demo-alex-chen", "Alex Chen", "AC", "Pulmonology", "Asthma care", "avatar-blue"],
  ["demo-priya-shah", "Priya Shah", "PS", "Primary care", "High blood pressure care", "avatar-pink"],
  ["demo-mateo-ortiz", "Mateo Ortiz", "MO", "Rheumatology", "Arthritis support", "avatar-gold"],
  ["demo-nia-williams", "Nia Williams", "NW", "Nephrology", "Chronic kidney health", "avatar-green"],
  ["demo-oliver-brooks", "Oliver Brooks", "OB", "Respiratory care", "COPD support", "avatar-blue"],
  ["demo-ava-johnson", "Ava Johnson", "AJ", "Oncology", "Cancer care coordination", "avatar-pink"],
  ["demo-ethan-patel", "Ethan Patel", "EP", "Neurology", "Chronic pain support", "avatar-gold"],
  ["demo-mia-robinson", "Mia Robinson", "MR", "Gastroenterology", "Digestive health", "avatar-green"],
  ["demo-noah-kim", "Noah Kim", "NK", "Neurology", "Epilepsy support", "avatar-blue"],
  ["demo-isabella-garcia", "Isabella Garcia", "IG", "Neurology", "Migraine care", "avatar-pink"],
  ["demo-liam-wilson", "Liam Wilson", "LW", "Behavioral health", "Mental wellbeing", "avatar-gold"],
  ["demo-sophia-davis", "Sophia Davis", "SD", "Endocrinology", "Thyroid health", "avatar-green"],
  ["demo-james-martin", "James Martin", "JM", "Sleep medicine", "Sleep health", "avatar-blue"],
  ["demo-amara-thomas", "Amara Thomas", "AT", "Allergy and immunology", "Allergy care", "avatar-pink"],
  ["demo-lucas-moore", "Lucas Moore", "LM", "Dermatology", "Skin health", "avatar-gold"],
  ["demo-chloe-lee", "Chloe Lee", "CL", "Neurology", "Stroke recovery", "avatar-green"],
  ["demo-benjamin-clark", "Benjamin Clark", "BC", "Rheumatology", "Osteoporosis support", "avatar-blue"],
];
const SAMPLE_APPOINTMENTS = [
  ["demo-seed-jordan", "demo-jordan", "09:20", "Cardiology", "Follow-up"],
  ["demo-seed-sofia", "demo-sofia", "10:00", "Primary care", "Check-in"],
  ["demo-seed-ravi", "demo-ravi", "10:45", "Care coordination", "Virtual"],
  ["demo-seed-emma", "demo-emma", "11:30", "Endocrinology", "Review"],
];

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function createDatabase(databasePath = join(ROOT, "data", "careflow.sqlite")) {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      specialty TEXT NOT NULL,
      pathway TEXT NOT NULL,
      avatar_color TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1 CHECK (is_demo = 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES patients(id),
      visit_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      specialty TEXT NOT NULL,
      visit_type TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1 CHECK (is_demo = 1),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (patient_id, visit_date, appointment_time)
    );

    CREATE INDEX IF NOT EXISTS appointments_by_date
      ON appointments (visit_date, appointment_time);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions (expires_at);

    CREATE TABLE IF NOT EXISTS selected_care_team (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pathway TEXT NOT NULL,
      approach_id TEXT NOT NULL,
      approach_name TEXT NOT NULL,
      clinician_id TEXT NOT NULL,
      clinician_name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, pathway, approach_id)
    );
  `);

  const appointmentColumns = db.prepare("PRAGMA table_info(appointments)").all();
  if (!appointmentColumns.some((column) => column.name === "owner_user_id")) {
    db.exec(`
      ALTER TABLE appointments
      ADD COLUMN owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE
    `);
  }
  const migratedAppointmentColumns = db.prepare("PRAGMA table_info(appointments)").all();
  if (!migratedAppointmentColumns.some((column) => column.name === "care_pathway")) {
    db.exec("ALTER TABLE appointments ADD COLUMN care_pathway TEXT");
  }
  if (!migratedAppointmentColumns.some((column) => column.name === "care_approach")) {
    db.exec("ALTER TABLE appointments ADD COLUMN care_approach TEXT");
  }
  const appointmentColumnsWithCare = db.prepare("PRAGMA table_info(appointments)").all();
  if (!appointmentColumnsWithCare.some((column) => column.name === "clinician_id")) {
    db.exec("ALTER TABLE appointments ADD COLUMN clinician_id TEXT");
  }
  if (!appointmentColumnsWithCare.some((column) => column.name === "clinician_name")) {
    db.exec("ALTER TABLE appointments ADD COLUMN clinician_name TEXT");
  }
  if (!appointmentColumnsWithCare.some((column) => column.name === "clinician_specialty")) {
    db.exec("ALTER TABLE appointments ADD COLUMN clinician_specialty TEXT");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS appointments_by_owner_date
      ON appointments (owner_user_id, visit_date, appointment_time);
  `);

  const insertPatient = db.prepare(`
    INSERT OR IGNORE INTO patients (id, name, initials, specialty, pathway, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertSeedAppointment = db.prepare(`
    INSERT OR IGNORE INTO appointments (id, patient_id, visit_date, appointment_time, specialty, visit_type)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const today = localDateString();
  const dateKey = today.replaceAll("-", "");
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const patient of SAMPLE_PATIENTS) insertPatient.run(...patient);
    for (const [seedId, patientId, time, specialty, type] of SAMPLE_APPOINTMENTS) {
      insertSeedAppointment.run(`${seedId}-${dateKey}`, patientId, today, time, specialty, type);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const listPatients = db.prepare(`
    SELECT id, name, initials, specialty, pathway, avatar_color AS avatarColor
    FROM patients
    WHERE is_demo = 1
    ORDER BY name
  `);
  const findPatient = db.prepare(`
    SELECT id, name, initials, specialty, pathway, avatar_color AS avatarColor
    FROM patients
    WHERE id = ? AND is_demo = 1
  `);
  const listPathways = db.prepare(`
    SELECT pathway, COUNT(*) AS patientCount
    FROM patients
    WHERE is_demo = 1
    GROUP BY pathway
    ORDER BY pathway COLLATE NOCASE
  `);
  const listAppointments = db.prepare(`
    SELECT
      appointments.id,
      appointments.patient_id AS patientId,
      patients.name AS patientName,
      patients.initials,
      patients.avatar_color AS avatarColor,
      appointments.visit_date AS visitDate,
      appointments.appointment_time AS appointmentTime,
      appointments.specialty,
      appointments.visit_type AS visitType,
      appointments.care_pathway AS carePathway,
      appointments.care_approach AS careApproach,
      appointments.clinician_id AS clinicianId,
      appointments.clinician_name AS clinicianName,
      appointments.clinician_specialty AS clinicianSpecialty
    FROM appointments
    JOIN patients ON patients.id = appointments.patient_id
    WHERE appointments.visit_date = ?
      AND appointments.is_demo = 1
      AND (appointments.owner_user_id IS NULL OR appointments.owner_user_id = ?)
    ORDER BY appointments.appointment_time, appointments.id
  `);
  const countAppointments = db.prepare(`
    SELECT COUNT(*) AS count
    FROM appointments
    WHERE visit_date = ? AND is_demo = 1 AND (owner_user_id IS NULL OR owner_user_id = ?)
  `);
  const insertAppointment = db.prepare(`
    INSERT INTO appointments (
      id, patient_id, visit_date, appointment_time, specialty, visit_type, owner_user_id, care_pathway, care_approach,
      clinician_id, clinician_name, clinician_specialty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const findAppointment = db.prepare(`
    SELECT
      appointments.id,
      appointments.patient_id AS patientId,
      patients.name AS patientName,
      patients.initials,
      patients.avatar_color AS avatarColor,
      appointments.visit_date AS visitDate,
      appointments.appointment_time AS appointmentTime,
      appointments.specialty,
      appointments.visit_type AS visitType,
      appointments.care_pathway AS carePathway,
      appointments.care_approach AS careApproach,
      appointments.clinician_id AS clinicianId,
      appointments.clinician_name AS clinicianName,
      appointments.clinician_specialty AS clinicianSpecialty
    FROM appointments
    JOIN patients ON patients.id = appointments.patient_id
    WHERE appointments.id = ?
  `);
  const findUserByEmail = db.prepare(`
    SELECT id, display_name AS displayName, email, password_hash AS passwordHash, password_salt AS passwordSalt
    FROM users
    WHERE email = ? COLLATE NOCASE
  `);
  const insertUser = db.prepare(`
    INSERT INTO users (id, display_name, email, password_hash, password_salt)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertSession = db.prepare(`
    INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
  `);
  const findSessionUser = db.prepare(`
    SELECT users.id, users.display_name AS displayName, users.email
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `);
  const deleteSession = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const deleteExpiredSessions = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  const listSelectedCareTeam = db.prepare(`
    SELECT
      id,
      pathway,
      approach_id AS approachId,
      approach_name AS approachName,
      clinician_id AS clinicianId,
      clinician_name AS clinicianName,
      specialty,
      updated_at AS updatedAt
    FROM selected_care_team
    WHERE user_id = ?
    ORDER BY pathway COLLATE NOCASE, approach_name COLLATE NOCASE
  `);
  const saveSelectedCareProfessional = db.prepare(`
    INSERT INTO selected_care_team (
      id, user_id, pathway, approach_id, approach_name, clinician_id, clinician_name, specialty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id, pathway, approach_id) DO UPDATE SET
      clinician_id = excluded.clinician_id,
      clinician_name = excluded.clinician_name,
      specialty = excluded.specialty,
      updated_at = CURRENT_TIMESTAMP
  `);
  const findSelectedCareProfessional = db.prepare(`
    SELECT
      id,
      pathway,
      approach_id AS approachId,
      approach_name AS approachName,
      clinician_id AS clinicianId,
      clinician_name AS clinicianName,
      specialty,
      updated_at AS updatedAt
    FROM selected_care_team
    WHERE user_id = ? AND pathway = ? AND approach_id = ?
  `);

  return {
    listPatients: () => listPatients.all(),
    findPatient: (id) => findPatient.get(id),
    listPathways: () => listPathways.all(),
    listAppointments: (date, userId) => listAppointments.all(date, userId),
    countAppointments: (date, userId) => countAppointments.get(date, userId).count,
    addAppointment({ id, patientId, visitDate, appointmentTime, specialty, visitType, ownerUserId, carePathway = null, careApproach = null, clinicianId = null, clinicianName = null, clinicianSpecialty = null }) {
      insertAppointment.run(id, patientId, visitDate, appointmentTime, specialty, visitType, ownerUserId, carePathway, careApproach, clinicianId, clinicianName, clinicianSpecialty);
      return findAppointment.get(id);
    },
    findUserByEmail: (email) => findUserByEmail.get(email),
    addUser({ id, displayName, email, passwordHash, passwordSalt }) {
      insertUser.run(id, displayName, email, passwordHash, passwordSalt);
    },
    createSession({ tokenHash, userId, expiresAt }) {
      insertSession.run(tokenHash, userId, expiresAt);
    },
    findSessionUser(tokenHash, now) {
      return findSessionUser.get(tokenHash, now);
    },
    deleteSession(tokenHash) {
      deleteSession.run(tokenHash);
    },
    deleteExpiredSessions(now) {
      deleteExpiredSessions.run(now);
    },
    listSelectedCareTeam(userId) {
      return listSelectedCareTeam.all(userId);
    },
    saveSelectedCareProfessional({ id, userId, pathway, approachId, approachName, clinicianId, clinicianName, specialty }) {
      saveSelectedCareProfessional.run(id, userId, pathway, approachId, approachName, clinicianId, clinicianName, specialty);
      return findSelectedCareProfessional.get(userId, pathway, approachId);
    },
    close: () => db.close(),
  };
}

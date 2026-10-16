import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { createServer } from "./server.mjs";

const activeServers = new Set();
const temporaryDirectories = new Set();

async function startServer(options) {
  const server = createServer({ databasePath: ":memory:", ...options });
  activeServers.add(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function registerAccount(baseUrl, overrides = {}) {
  const account = {
    displayName: "Alex Morgan",
    email: "alex@example.test",
    password: "a-secure-demo-password",
    ...overrides,
  };
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(account),
  });
  const payload = await response.json();
  assert.equal(response.status, 201, payload.error);
  const setCookie = response.headers.get("set-cookie") || "";
  const cookie = setCookie.split(";", 1)[0];
  assert.ok(cookie?.startsWith("careflow_session="));
  return { user: payload.user, headers: { Cookie: cookie }, account, setCookie };
}

async function loginAccount(baseUrl, account) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, payload.error);
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie?.startsWith("careflow_session="));
  return { user: payload.user, headers: { Cookie: cookie } };
}

afterEach(async () => {
  await Promise.all(
    [...activeServers].map(
      (server) =>
        new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
  activeServers.clear();
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories.clear();
});

async function postChat(baseUrl, payload, headers = {}) {
  return fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

async function postAppointment(baseUrl, payload, headers = {}) {
  return fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

async function postCareTeam(baseUrl, payload, headers = {}) {
  return fetch(`${baseUrl}/api/care-team`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
}

function nextWeekday(value) {
  const date = new Date(`${value}T12:00:00`);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

test("serves the app and sets browser security headers", async () => {
  const baseUrl = await startServer();
  const response = await fetch(baseUrl);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Careflow AI/);
  assert.match(html, /Create account/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
});

test("registers, persists, verifies, and clears secure browser sessions", async () => {
  const baseUrl = await startServer();
  const unauthenticated = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(unauthenticated.status, 200);
  assert.equal((await unauthenticated.json()).user, null);
  assert.equal((await fetch(`${baseUrl}/api/patients`)).status, 401);

  const registration = await registerAccount(baseUrl);
  assert.equal(registration.user.email, registration.account.email);
  assert.equal(registration.user.displayName, registration.account.displayName);
  assert.deepEqual(Object.keys(registration.user).sort(), ["displayName", "email", "id"]);
  assert.match(registration.setCookie, /HttpOnly/);
  assert.match(registration.setCookie, /SameSite=Strict/);
  assert.match(registration.setCookie, /Max-Age=604800/);
  assert.doesNotMatch(registration.setCookie, /Secure/);
  const currentUser = await fetch(`${baseUrl}/api/auth/me`, { headers: registration.headers });
  assert.equal((await currentUser.json()).user.id, registration.user.id);

  const invalidPassword = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...registration.account, email: "short@example.test", password: "short" }),
  });
  assert.equal(invalidPassword.status, 400);
  const duplicate = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...registration.account, email: registration.account.email.toUpperCase() }),
  });
  assert.equal(duplicate.status, 409);

  const wrongPassword = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: registration.account.email, password: "not-the-password" }),
  });
  assert.equal(wrongPassword.status, 401);
  const login = await loginAccount(baseUrl, {
    ...registration.account,
    email: registration.account.email.toUpperCase(),
  });
  assert.equal(login.user.id, registration.user.id);
  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: login.headers,
  });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await fetch(`${baseUrl}/api/patients`, { headers: login.headers })).status, 401);
});

test("requires a session for workspace APIs and scopes new appointments to their owner", async () => {
  const baseUrl = await startServer();
  const paths = [
    "/api/patients",
    "/api/pathways",
    "/api/dashboard",
    "/api/appointments",
  ];
  for (const path of paths) assert.equal((await fetch(`${baseUrl}${path}`)).status, 401);
  assert.equal((await postChat(baseUrl, { question: "What is diabetes?" })).status, 401);

  const firstAccount = await registerAccount(baseUrl);
  const secondAccount = await registerAccount(baseUrl, {
    displayName: "Sam Taylor",
    email: "sam@example.test",
  });
  const { date } = await (await fetch(`${baseUrl}/api/appointments`, { headers: firstAccount.headers })).json();
  const created = await postAppointment(baseUrl, {
    patientId: "demo-ravi",
    visitDate: date,
    appointmentTime: "18:20",
    visitType: "Care coordination",
  }, firstAccount.headers);
  assert.equal(created.status, 201);

  const firstAppointments = await (await fetch(
    `${baseUrl}/api/appointments?date=${date}`,
    { headers: firstAccount.headers },
  )).json();
  const secondAppointments = await (await fetch(
    `${baseUrl}/api/appointments?date=${date}`,
    { headers: secondAccount.headers },
  )).json();
  const [firstDashboard, secondDashboard] = await Promise.all([
    fetch(`${baseUrl}/api/dashboard?date=${date}`, { headers: firstAccount.headers }).then((response) => response.json()),
    fetch(`${baseUrl}/api/dashboard?date=${date}`, { headers: secondAccount.headers }).then((response) => response.json()),
  ]);
  assert.equal(firstAppointments.total, 5);
  assert.equal(secondAppointments.total, 4);
  assert.equal(firstDashboard.appointmentCount, firstAppointments.total);
  assert.equal(secondDashboard.appointmentCount, secondAppointments.total);
  assert.ok(firstAppointments.appointments.some((appointment) => appointment.appointmentTime === "18:20"));
  assert.ok(secondAppointments.appointments.every((appointment) => appointment.appointmentTime !== "18:20"));
});

test("lists fictional sample patients and today's seeded appointments", async () => {
  const baseUrl = await startServer();
  const { headers } = await registerAccount(baseUrl);
  const [patientsResponse, appointmentsResponse, dashboardResponse, pathwaysResponse] = await Promise.all([
    fetch(`${baseUrl}/api/patients`, { headers }),
    fetch(`${baseUrl}/api/appointments`, { headers }),
    fetch(`${baseUrl}/api/dashboard`, { headers }),
    fetch(`${baseUrl}/api/pathways`, { headers }),
  ]);
  const { patients } = await patientsResponse.json();
  const { appointments, total, date } = await appointmentsResponse.json();
  const dashboard = await dashboardResponse.json();
  const { pathways } = await pathwaysResponse.json();
  assert.equal(patientsResponse.status, 200);
  assert.equal(appointmentsResponse.status, 200);
  assert.equal(patients.length, 21);
  assert.ok(patients.every((patient) => patient.id.startsWith("demo-")));
  assert.equal(appointments.length, 4);
  assert.equal(total, 4);
  assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(dashboard.patientCount, patients.length);
  assert.equal(dashboard.appointmentCount, appointments.length);
  assert.equal(dashboard.pathwayCount, 20);
  assert.deepEqual(
    pathways.map(({ pathway, patientCount }) => [pathway, patientCount]),
    [
      ["Allergy care", 1],
      ["Arthritis support", 1],
      ["Asthma care", 1],
      ["Cancer care coordination", 1],
      ["Chronic kidney health", 1],
      ["Chronic pain support", 1],
      ["COPD support", 1],
      ["Diabetes management", 2],
      ["Digestive health", 1],
      ["Epilepsy support", 1],
      ["Heart health pathway", 1],
      ["High blood pressure care", 1],
      ["Mental wellbeing", 1],
      ["Migraine care", 1],
      ["Osteoporosis support", 1],
      ["Preventive care", 1],
      ["Skin health", 1],
      ["Sleep health", 1],
      ["Stroke recovery", 1],
      ["Thyroid health", 1],
    ],
  );
  assert.ok(patients.some((patient) => patient.pathway === "Asthma care"));
  assert.ok(patients.some((patient) => patient.pathway === "High blood pressure care"));
  assert.ok(patients.some((patient) => patient.pathway === "Arthritis support"));
  assert.ok(patients.some((patient) => patient.pathway === "Chronic kidney health"));
  assert.ok(patients.some((patient) => patient.pathway === "COPD support"));
  for (const pathway of [
    "Allergy care",
    "Cancer care coordination",
    "Chronic pain support",
    "Digestive health",
    "Epilepsy support",
    "Mental wellbeing",
    "Migraine care",
    "Osteoporosis support",
    "Skin health",
    "Sleep health",
    "Stroke recovery",
    "Thyroid health",
  ]) {
    assert.ok(patients.some((patient) => patient.pathway === pathway), `${pathway} has a fictional sample patient`);
  }
  assert.deepEqual(dashboard.pathways, pathways);
});

test("offers ten care approaches with full fictional demo clinician profiles", async () => {
  const baseUrl = await startServer();
  const firstAccount = await registerAccount(baseUrl);
  const secondAccount = await registerAccount(baseUrl, {
    displayName: "Taylor Reed",
    email: "taylor@example.test",
  });
  assert.equal((await fetch(`${baseUrl}/api/care-options`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/care-team`)).status, 401);

  const optionsResponse = await fetch(`${baseUrl}/api/care-options`, { headers: firstAccount.headers });
  const { approaches } = await optionsResponse.json();
  assert.equal(optionsResponse.status, 200);
  assert.deepEqual(approaches.map(({ name }) => name), [
    "Allopathy",
    "Ayurvedic",
    "Homeopathy",
    "Naturopathy",
    "Physiotherapy",
    "Yoga",
    "Acupressure",
    "Acupuncture",
    "Siddha",
    "Unani",
  ]);
  assert.ok(approaches.every((approach) => approach.clinicians.length > 0));
  assert.ok(approaches.every((approach) => approach.clinicians.every((clinician) =>
    clinician.credentials && clinician.experience && clinician.languages &&
    clinician.focusAreas && clinician.clinic && clinician.availableDays.length &&
    clinician.visitTypes.length && clinician.availableFrom && clinician.availableTo,
  )));

  const invalidPathway = await postCareTeam(baseUrl, {
    pathway: "Unknown condition",
    approachId: "allopathy",
    clinicianId: "allopathy-asha-mehta",
  }, firstAccount.headers);
  assert.equal(invalidPathway.status, 400);
  const invalidClinician = await postCareTeam(baseUrl, {
    pathway: "Diabetes management",
    approachId: "allopathy",
    clinicianId: "acupuncture-leena-das",
  }, firstAccount.headers);
  assert.equal(invalidClinician.status, 400);

  const saved = await postCareTeam(baseUrl, {
    pathway: "Diabetes management",
    approachId: "allopathy",
    clinicianId: "allopathy-asha-mehta",
  }, firstAccount.headers);
  assert.equal(saved.status, 201);
  assert.equal((await saved.json()).selected.clinicianName, "Asha Mehta");

  const replacement = await postCareTeam(baseUrl, {
    pathway: "Diabetes management",
    approachId: "allopathy",
    clinicianId: "allopathy-kabir-rao",
  }, firstAccount.headers);
  assert.equal(replacement.status, 201);
  const firstTeam = await (await fetch(`${baseUrl}/api/care-team`, { headers: firstAccount.headers })).json();
  const secondTeam = await (await fetch(`${baseUrl}/api/care-team`, { headers: secondAccount.headers })).json();
  assert.equal(firstTeam.careTeam.length, 1);
  assert.equal(firstTeam.careTeam[0].clinicianName, "Kabir Rao");
  assert.equal(secondTeam.careTeam.length, 0);
  assert.equal((await fetch(`${baseUrl}/api/care-team`, {
    method: "PUT",
    headers: firstAccount.headers,
  })).status, 405);
});

test("returns dashboard data only for a valid date and rejects unsupported methods", async () => {
  const baseUrl = await startServer();
  const { headers } = await registerAccount(baseUrl);
  const invalidDate = await fetch(`${baseUrl}/api/dashboard?date=2026-02-30`, { headers });
  assert.equal(invalidDate.status, 400);
  const unsupportedMethod = await fetch(`${baseUrl}/api/pathways`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: "{}",
  });
  assert.equal(unsupportedMethod.status, 405);
  assert.equal(unsupportedMethod.headers.get("allow"), "GET");
});

test("creates appointments only for sample patients and makes them queryable", async () => {
  const baseUrl = await startServer();
  const { headers } = await registerAccount(baseUrl);
  const { date: today } = await (await fetch(`${baseUrl}/api/appointments`, { headers })).json();
  const date = nextWeekday(today);
  const response = await postAppointment(baseUrl, {
    patientId: "demo-jordan",
    visitDate: date,
    appointmentTime: "15:00",
    visitType: "Follow-up",
  }, headers);
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.appointment.patientName, "Jordan Mitchell");
  assert.equal(payload.appointment.appointmentTime, "15:00");

  const list = await (await fetch(`${baseUrl}/api/appointments?date=${date}`, { headers })).json();
  assert.equal(list.total, 5);
  assert.equal(list.appointments.at(-1).id, payload.appointment.id);
});

test("books care-pathway appointments with their selected approach and matching sample patient", async () => {
  const baseUrl = await startServer();
  const { headers } = await registerAccount(baseUrl);
  const { date: today } = await (await fetch(`${baseUrl}/api/appointments`, { headers })).json();
  const date = nextWeekday(today);

  const mismatchedPatient = await postAppointment(baseUrl, {
    patientId: "demo-jordan",
    visitDate: date,
    appointmentTime: "15:20",
    visitType: "Care coordination",
    carePathway: "Allergy care",
    careApproach: "allopathy",
    clinicianId: "allopathy-asha-mehta",
  }, headers);
  assert.equal(mismatchedPatient.status, 400);

  const missingApproach = await postAppointment(baseUrl, {
    patientId: "demo-amara-thomas",
    visitDate: date,
    appointmentTime: "15:20",
    visitType: "Care coordination",
    carePathway: "Allergy care",
    clinicianId: "allopathy-asha-mehta",
  }, headers);
  assert.equal(missingApproach.status, 400);

  const unavailableDoctor = await postAppointment(baseUrl, {
    patientId: "demo-amara-thomas",
    visitDate: date,
    appointmentTime: "15:20",
    visitType: "Care coordination",
    carePathway: "Allergy care",
    careApproach: "allopathy",
    clinicianId: "allopathy-asha-mehta",
  }, headers);
  assert.equal(unavailableDoctor.status, 400);

  const created = await postAppointment(baseUrl, {
    patientId: "demo-amara-thomas",
    visitDate: date,
    appointmentTime: "13:20",
    visitType: "Care coordination",
    carePathway: "Allergy care",
    careApproach: "allopathy",
    clinicianId: "allopathy-asha-mehta",
  }, headers);
  const payload = await created.json();
  assert.equal(created.status, 201);
  assert.equal(payload.appointment.patientName, "Amara Thomas");
  assert.equal(payload.appointment.carePathway, "Allergy care");
  assert.equal(payload.appointment.careApproach, "Allopathy");
  assert.equal(payload.appointment.clinicianName, "Asha Mehta");

  const list = await (await fetch(`${baseUrl}/api/appointments?date=${date}`, { headers })).json();
  assert.ok(list.appointments.some((appointment) =>
    appointment.carePathway === "Allergy care" &&
    appointment.careApproach === "Allopathy" &&
    appointment.clinicianName === "Asha Mehta",
  ));
});

test("rejects real patient names, unsupported appointment types, and duplicate bookings", async () => {
  const baseUrl = await startServer();
  const { headers } = await registerAccount(baseUrl);
  const { date } = await (await fetch(`${baseUrl}/api/appointments`, { headers })).json();
  const invalidPatient = await postAppointment(baseUrl, {
    patientId: "real-person-name",
    visitDate: date,
    appointmentTime: "15:00",
    visitType: "Follow-up",
  }, headers);
  assert.equal(invalidPatient.status, 400);

  const invalidType = await postAppointment(baseUrl, {
    patientId: "demo-jordan",
    visitDate: date,
    appointmentTime: "15:00",
    visitType: "Prescription review",
  }, headers);
  assert.equal(invalidType.status, 400);

  const booking = {
    patientId: "demo-jordan",
    visitDate: date,
    appointmentTime: "15:00",
    visitType: "Follow-up",
  };
  const first = await postAppointment(baseUrl, booking, headers);
  assert.equal(first.status, 201);
  const duplicate = await postAppointment(baseUrl, booking, headers);
  assert.equal(duplicate.status, 409);
});

test("persists appointments after the server restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "careflow-db-test-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "careflow.sqlite");
  const firstServer = createServer({ databasePath });
  activeServers.add(firstServer);
  firstServer.listen(0, "127.0.0.1");
  await once(firstServer, "listening");
  const firstUrl = `http://127.0.0.1:${firstServer.address().port}`;
  const { headers, account } = await registerAccount(firstUrl);
  const { date: today } = await (await fetch(`${firstUrl}/api/appointments`, { headers })).json();
  const date = nextWeekday(today);
  const created = await postAppointment(firstUrl, {
    patientId: "demo-sofia",
    visitDate: date,
    appointmentTime: "16:30",
    visitType: "Primary care",
    carePathway: "Preventive care",
    careApproach: "yoga",
    clinicianId: "yoga-om-patel",
  }, headers);
  assert.equal(created.status, 201);
  await new Promise((resolve, reject) => {
    firstServer.close((error) => (error ? reject(error) : resolve()));
    firstServer.closeAllConnections();
  });
  activeServers.delete(firstServer);

  const secondUrl = await startServer({ databasePath });
  const restoredSession = await loginAccount(secondUrl, account);
  const appointments = await (await fetch(`${secondUrl}/api/appointments?date=${date}`, restoredSession)).json();
  assert.ok(appointments.total >= 1);
  assert.ok(appointments.appointments.some((appointment) => appointment.appointmentTime === "16:30"));
  assert.ok(appointments.appointments.some((appointment) =>
    appointment.appointmentTime === "16:30" &&
    appointment.carePathway === "Preventive care" &&
    appointment.careApproach === "Yoga" &&
    appointment.clinicianName === "Om Patel",
  ));
});

test("persists selected demo clinicians after the server restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "careflow-care-team-test-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "careflow.sqlite");
  const firstServer = createServer({ databasePath });
  activeServers.add(firstServer);
  firstServer.listen(0, "127.0.0.1");
  await once(firstServer, "listening");
  const firstUrl = `http://127.0.0.1:${firstServer.address().port}`;
  const { headers, account } = await registerAccount(firstUrl);
  const saved = await postCareTeam(firstUrl, {
    pathway: "Asthma care",
    approachId: "physiotherapy",
    clinicianId: "physiotherapy-rohan-iyer",
  }, headers);
  assert.equal(saved.status, 201);
  await new Promise((resolve, reject) => {
    firstServer.close((error) => (error ? reject(error) : resolve()));
    firstServer.closeAllConnections();
  });
  activeServers.delete(firstServer);

  const secondUrl = await startServer({ databasePath });
  const restoredSession = await loginAccount(secondUrl, account);
  const result = await (await fetch(`${secondUrl}/api/care-team`, { headers: restoredSession.headers })).json();
  assert.equal(result.careTeam.length, 1);
  assert.equal(result.careTeam[0].clinicianName, "Rohan Iyer");
  assert.equal(result.careTeam[0].pathway, "Asthma care");
});

test("migrates a pre-auth SQLite database without losing existing appointments", async () => {
  const directory = await mkdtemp(join(tmpdir(), "careflow-legacy-db-test-"));
  temporaryDirectories.add(directory);
  const databasePath = join(directory, "legacy.sqlite");
  const legacyDb = new DatabaseSync(databasePath);
  legacyDb.exec(`
    CREATE TABLE patients (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, initials TEXT NOT NULL,
      specialty TEXT NOT NULL, pathway TEXT NOT NULL, avatar_color TEXT NOT NULL,
      is_demo INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE appointments (
      id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
      visit_date TEXT NOT NULL, appointment_time TEXT NOT NULL, specialty TEXT NOT NULL,
      visit_type TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (patient_id, visit_date, appointment_time)
    );
    INSERT INTO patients (id, name, initials, specialty, pathway, avatar_color)
    VALUES ('demo-jordan', 'Jordan Mitchell', 'JM', 'Cardiology', 'Heart health pathway', 'avatar-blue');
  `);
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  legacyDb.prepare(`
    INSERT INTO appointments (id, patient_id, visit_date, appointment_time, specialty, visit_type)
    VALUES ('legacy-appointment', 'demo-jordan', ?, '14:50', 'Cardiology', 'Follow-up')
  `).run(date);
  legacyDb.close();

  const baseUrl = await startServer({ databasePath });
  const { headers } = await registerAccount(baseUrl);
  const result = await (await fetch(`${baseUrl}/api/appointments?date=${date}`, { headers })).json();
  assert.equal(result.total, 5);
  assert.ok(result.appointments.some((appointment) => appointment.id === "legacy-appointment"));
  assert.equal(result.appointments.length, 5);
});

test("returns a safe emergency response without calling the AI provider", async () => {
  let providerCalls = 0;
  const baseUrl = await startServer({
    env: { AI_API_KEY: "test-secret" },
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error("Should not call the provider for an emergency.");
    },
  });
  const { headers } = await registerAccount(baseUrl);
  const response = await postChat(baseUrl, { question: "I have chest pain and cannot breathe" }, headers);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.urgent, true);
  assert.match(payload.answer, /emergency number now/i);
  assert.equal(providerCalls, 0);
});

test("recognizes Hindi emergency messages before contacting the AI provider", async () => {
  let providerCalls = 0;
  const baseUrl = await startServer({
    env: { AI_API_KEY: "test-secret" },
    fetchImpl: async () => {
      providerCalls += 1;
      throw new Error("Should not call the provider for an emergency.");
    },
  });
  const { headers } = await registerAccount(baseUrl);
  const response = await postChat(baseUrl, { question: "मुझे सीने में दर्द और साँस लेने में दिक्कत है" }, headers);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.urgent, true);
  assert.match(payload.answer, /emergency number now/i);
  assert.equal(providerCalls, 0);
});

test("requires an AI key for non-emergency health questions", async () => {
  const baseUrl = await startServer({ env: {} });
  const { headers } = await registerAccount(baseUrl);
  const response = await postChat(baseUrl, { question: "What is diabetes?" }, headers);
  const payload = await response.json();
  assert.equal(response.status, 503);
  assert.equal(payload.code, "AI_NOT_CONFIGURED");
});

test("sends validated health questions to the configured AI and returns vetted links", async () => {
  let providerRequest;
  const baseUrl = await startServer({
    env: {
      AI_API_KEY: "server-only-secret",
      AI_MODEL: "test-health-model",
      AI_API_URL: "https://provider.example/v1/chat/completions",
    },
    fetchImpl: async (url, options) => {
      providerRequest = { url: String(url), options, body: JSON.parse(options.body) };
      return Response.json({
        choices: [{ message: { content: "Diabetes is a health condition; speak with a clinician about your care." } }],
      });
    },
  });
  const { headers } = await registerAccount(baseUrl);
  const response = await postChat(baseUrl, {
    question: "What is diabetes?",
    history: [{ role: "user", content: "I have a health question." }],
  }, headers);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.match(payload.answer, /not a diagnosis/);
  assert.equal(payload.sources[0].url, "https://www.cdc.gov/diabetes/about/index.html");
  assert.equal(providerRequest.url, "https://provider.example/v1/chat/completions");
  assert.equal(providerRequest.options.headers.Authorization, "Bearer server-only-secret");
  assert.equal(providerRequest.body.model, "test-health-model");
  assert.deepEqual(providerRequest.body.messages.slice(-2), [
    { role: "user", content: "I have a health question." },
    { role: "user", content: "What is diabetes?" },
  ]);
  assert.doesNotMatch(JSON.stringify(payload), /server-only-secret/);
});

test("rejects invalid payloads, cross-origin requests, and non-HTTPS provider URLs", async () => {
  const baseUrl = await startServer({
    env: { AI_API_KEY: "test-secret", AI_API_URL: "http://provider.example/v1/chat/completions" },
    fetchImpl: async () => {
      throw new Error("The provider must not be called for an insecure URL.");
    },
  });
  const { headers } = await registerAccount(baseUrl);
  const invalidJson = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ question: "x" }),
  });
  assert.equal(invalidJson.status, 400);

  const crossOrigin = await postChat(baseUrl, { question: "What is diabetes?" }, {
    ...headers,
    Origin: "https://attacker.example",
  });
  assert.equal(crossOrigin.status, 403);

  const insecureProvider = await postChat(baseUrl, { question: "What is diabetes?" }, headers);
  const payload = await insecureProvider.json();
  assert.equal(insecureProvider.status, 500);
  assert.equal(payload.code, "AI_CONFIG_INVALID");
});

test("limits repeated requests from one client", async () => {
  const baseUrl = await startServer({ env: {} });
  const { headers } = await registerAccount(baseUrl);
  let lastResponse;
  for (let request = 0; request < 21; request += 1) {
    lastResponse = await postChat(baseUrl, { question: "What is diabetes?" }, headers);
  }
  assert.equal(lastResponse.status, 429);
});

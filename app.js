let patients = [];
let pathways = [];
let careApproaches = [];

const pageContent = {
  pathways: {
    title: "Care pathways",
    subtitle: "Every next step, connected.",
    eyebrow: "CONNECTED JOURNEYS",
    action: "Explore pathways",
    intro: "Good care is a journey, not a checklist.",
    description: "Choose any sample disease pathway, select a care approach, then book an appointment. Options are informational—not a cure or personalized treatment recommendation.",
    content: `<div class="secondary-grid pathway-cards"></div>`,
  },
  appointments: {
    title: "Appointments",
    subtitle: "The right people, in the right place, at the right time.",
    eyebrow: "YOUR SCHEDULE",
    action: "New appointment",
    intro: "A little more room to focus on people.",
    description: "Your day at a glance. Book appointments for fictional sample patients and review your schedule.",
    content: `<label class="appointment-date-filter">Show appointments for <input id="appointmentScheduleDate" type="date"></label><div class="patient-list"></div>`,
  },
  insights: {
    title: "AI insights",
    subtitle: "Helpful signals to support thoughtful care.",
    eyebrow: "A CLEARER PICTURE",
    action: "Ask Careflow AI",
    intro: "Small signals. More connected care.",
    description: "Demo insights are fictional examples—not predictions, clinical recommendations, or real patient data.",
    content: `<div class="insight-list"><article class="insight-list-item"><span class="insight-icon"><svg class="icon"><use href="#i-calendar"/></svg></span><div><strong>Two follow-ups are due this week</strong><p>Sample insight for the Heart health pathway. Check the care plan with the patient's care team before taking action.</p></div></article><article class="insight-list-item"><span class="insight-icon"><svg class="icon"><use href="#i-route"/></svg></span><div><strong>A pathway milestone is coming up</strong><p>A fictional reminder to review the next step in the Diabetes management pathway.</p></div></article><article class="insight-list-item"><span class="insight-icon"><svg class="icon"><use href="#i-message"/></svg></span><div><strong>One care-team check-in could help</strong><p>Sample coordination prompt. Use your clinical judgment and existing care protocols.</p></div></article></div>`,
  },
  settings: {
    title: "Settings",
    subtitle: "Make your workspace feel like yours.",
    eyebrow: "YOUR WORKSPACE",
    action: "Save preferences",
    intro: "A workspace designed around your day.",
    description: "This demo stores only fictional sample patients and appointments in a local SQLite file. AI chats and medical records are never saved.",
    content: `<div class="secondary-grid">    <article class="secondary-card"><h3>Workspace preferences</h3><div class="setting-row"><strong>Timezone</strong><span>Local browser time</span></div><div class="setting-row"><strong>Appointment reminders</strong><span>On</span></div><div class="setting-row"><strong>Weekly care summary</strong><span>On</span></div></article><article class="secondary-card"><h3>Privacy &amp; safety</h3><p>Only fictional sample patients and demo appointments are stored in local SQLite. AI messages and medical records are not saved.</p><div class="setting-row"><strong>Sample patient data</strong><span>Fictional</span></div><div class="setting-row"><strong>Local database</strong><span>SQLite</span></div></article></div>`,
  },
};

const overviewView = document.querySelector("#overviewView");
const secondaryView = document.querySelector("#secondaryView");
const toastRegion = document.querySelector("#toastRegion");
const modal = document.querySelector("#appointmentModal");
const appointmentList = document.querySelector("#appointmentList");
const input = document.querySelector("#chatInput");
const messages = document.querySelector("#chatMessages");
const intro = document.querySelector("#assistantIntro");
const prompts = document.querySelector(".prompt-chips");
const authShell = document.querySelector("#authShell");
const appShell = document.querySelector("#appShell");
const authError = document.querySelector("#authError");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
let toastTimer;
let lastFocusedElement;
let pendingCareBooking = null;

function setAuthMode(mode) {
  const registering = mode === "register";
  loginForm.hidden = registering;
  registerForm.hidden = !registering;
  document.querySelector("#loginTab").classList.toggle("active", !registering);
  document.querySelector("#loginTab").setAttribute("aria-selected", String(!registering));
  document.querySelector("#registerTab").classList.toggle("active", registering);
  document.querySelector("#registerTab").setAttribute("aria-selected", String(registering));
  document.querySelector("#authEyebrow").textContent = registering ? "GET STARTED" : "WELCOME BACK";
  document.querySelector("#authTitle").textContent = registering ? "Create your account" : "Sign in to Careflow";
  document.querySelector("#authSubtitle").textContent = registering
    ? "Set up your private, connected care workspace."
    : "Your connected care workspace is ready.";
  authError.hidden = true;
  authError.textContent = "";
}

function renderPatientInitials() {
  const initials = document.querySelector("#patientInitials");
  initials.replaceChildren();
  patients.slice(0, 3).forEach((patient) => {
    const badge = document.createElement("i");
    badge.textContent = patient.initials;
    initials.append(badge);
  });
  if (patients.length > 3) {
    const extra = document.createElement("i");
    extra.textContent = `+${patients.length - 3}`;
    initials.append(extra);
  }
}

function showAuthScreen(message = "") {
  appShell.hidden = true;
  authShell.hidden = false;
  if (message) {
    authError.textContent = message;
    authError.hidden = false;
  }
}

function animateView(view) {
  view.classList.remove("view-enter");
  void view.offsetWidth;
  view.classList.add("view-enter");
}

function enterDashboard(user) {
  authShell.hidden = true;
  appShell.hidden = false;
  animateView(overviewView);
  const displayName = user.displayName;
  document.querySelector("#userName").textContent = displayName;
  document.querySelector("#userAvatar").textContent = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
  document.querySelector("#profileName").textContent = displayName;
  document.querySelector("#profileAvatar").textContent = document.querySelector("#userAvatar").textContent;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  document.querySelector("#greetingText").textContent = `${greeting}, ${displayName.split(/\s+/)[0]}`;
  messages.replaceChildren();
  intro.hidden = false;
  prompts.hidden = false;
  input.value = "";
  void loadPatients();
  void loadAppointments(false);
  void loadDashboard();
}

async function handleAuthSubmit(event, mode) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = form.querySelector('[type="submit"]');
  const originalButton = submit.innerHTML;
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());
  submit.disabled = true;
  submit.textContent = mode === "register" ? "Creating your account..." : "Signing in...";
  authError.hidden = true;
  try {
    const result = await apiRequest(`/api/auth/${mode}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    enterDashboard(result.user);
  } catch (error) {
    authError.textContent = error.message || "Unable to complete your account request.";
    authError.hidden = false;
  } finally {
    submit.innerHTML = originalButton;
    submit.disabled = false;
  }
}

document.querySelector("#loginTab").addEventListener("click", () => setAuthMode("login"));
document.querySelector("#registerTab").addEventListener("click", () => setAuthMode("register"));
loginForm.addEventListener("submit", (event) => void handleAuthSubmit(event, "login"));
registerForm.addEventListener("submit", (event) => void handleAuthSubmit(event, "register"));
document.querySelector("#signOutButton").addEventListener("click", async () => {
  try {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setAuthMode("login");
    showAuthScreen();
  } catch (error) {
    showToast(error.message || "Unable to sign out. Please try again.");
  }
});

function showToast(message) {
  toastRegion.replaceChildren();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = '<svg class="icon"><use href="#i-check"></use></svg>';
  const label = document.createElement("span");
  label.textContent = message;
  toast.append(label);
  toastRegion.append(toast);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 3500);
}

function navigate(page) {
  if (page === "overview") {
    overviewView.hidden = false;
    secondaryView.hidden = true;
    document.querySelector("#breadcrumbCurrent").textContent = "Overview";
  } else {
    const config = pageContent[page];
    if (!config) return;
    overviewView.hidden = true;
    secondaryView.hidden = false;
    document.querySelector("#breadcrumbCurrent").textContent = config.title;
    document.querySelector("#secondaryTitle").textContent = config.title;
    document.querySelector("#secondarySubtitle").textContent = config.subtitle;
    document.querySelector("#secondaryEyebrow").textContent = config.eyebrow;
    document.querySelector("#secondaryContent").innerHTML = `<section class="section-banner"><div><h2>${config.intro}</h2><p>${config.description}</p></div></section>${config.content}`;
    const action = document.querySelector("#secondaryAction");
    action.querySelector("span").textContent = config.action;
    action.dataset.pageAction = page;
    if (page === "appointments") {
      const dateFilter = document.querySelector("#appointmentScheduleDate");
      if (dateFilter) dateFilter.value = dateFilter.value || getLocalDate();
      void loadAppointments(true, dateFilter?.value || getLocalDate());
    }
    if (page === "pathways") {
      renderPathways(pathways);
      void loadDashboard();
    }
  }
  animateView(page === "overview" ? overviewView : secondaryView);
  document.querySelectorAll("[data-nav]").forEach((item) => {
    const isActive = item.dataset.nav === page;
    item.classList.toggle("active", isActive && item.classList.contains("nav-link"));
    if (item.classList.contains("nav-link")) {
      if (isActive) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
  });
  document.querySelector("#sidebar").classList.remove("mobile-open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-nav]").forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(item.dataset.nav);
  });
});

document.querySelector("#secondaryContent").addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const pathwayButton = target.closest("[data-pathway-select]");
  if (pathwayButton) {
    await startCarePathway(pathwayButton.dataset.pathwaySelect);
    return;
  }
  const approachButton = target.closest("[data-care-approach]");
  if (approachButton) {
    const approach = careApproaches.find((item) => item.id === approachButton.dataset.careApproach);
    if (!approach) {
      showToast("That care approach is not available. Please choose another.");
      return;
    }
    updateCareWorkflowHeading("New appointment", `${activeCarePathway} · ${approach.name}`);
    navigate("appointments");
    void openAppointmentModal({ pathway: activeCarePathway, approach });
    return;
  }
  const clinicianButton = target.closest("[data-select-doctor]");
  if (clinicianButton && pendingCareBooking) {
    const approach = careApproaches.find((item) => item.id === pendingCareBooking.careApproach);
    const clinician = approach?.clinicians.find((item) => item.id === clinicianButton.dataset.selectDoctor);
    if (!clinician) {
      showToast("This demo clinician is no longer available. Please search again.");
      return;
    }
    clinicianButton.disabled = true;
    await saveAppointment({
      ...pendingCareBooking,
      clinicianId: clinician.id,
    });
    return;
  }
  const backButton = target.closest("[data-care-back]");
  if (backButton) {
    if (backButton.dataset.careBack === "2") navigate("pathways");
    else startCarePathway(activeCarePathway);
  }
});

document.querySelector("#secondaryContent").addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "appointmentScheduleDate" && target.value) {
    void loadAppointments(true, target.value);
  }
});

document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
}).format(new Date()).toUpperCase();
const currentHour = new Date().getHours();
const greeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";
document.querySelector("#greetingText").textContent = greeting;

document.querySelector("#secondaryAction").addEventListener("click", (event) => {
  const page = event.currentTarget.dataset.pageAction;
  if (page === "appointments") openAppointmentModal();
  else if (page === "insights") {
    navigate("overview");
    window.setTimeout(() => input.focus(), 50);
  } else showToast(page === "settings" ? "Preferences are for demo only and were not saved." : "You're viewing fictional sample pathways.");
});

document.querySelectorAll("[data-open-appointment]").forEach((button) => button.addEventListener("click", () => void openAppointmentModal()));
document.querySelector("#closeModal").addEventListener("click", closeAppointmentModal);
document.querySelector("#cancelModal").addEventListener("click", closeAppointmentModal);
document.querySelector("#doctorSuggestionsBack").addEventListener("click", () => {
  document.querySelector("#doctorSuggestions").hidden = true;
  document.querySelector("#doctorSuggestions").replaceChildren();
  document.querySelector("#doctorSuggestionsBack").hidden = true;
  document.querySelector("#appointmentForm").hidden = false;
});
modal.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const clinicianButton = target.closest("[data-select-doctor]");
  if (!clinicianButton || !pendingCareBooking) return;
  const approach = careApproaches.find((item) => item.id === pendingCareBooking.careApproach);
  const clinician = approach?.clinicians.find((item) => item.id === clinicianButton.dataset.selectDoctor);
  if (!clinician) {
    showToast("This demo clinician is no longer available. Please search again.");
    return;
  }
  clinicianButton.disabled = true;
  const saved = await saveAppointment({
    ...pendingCareBooking,
    clinicianId: clinician.id,
  });
  if (!saved) clinicianButton.disabled = false;
});
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeAppointmentModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeAppointmentModal();
    document.querySelector("#searchResults").hidden = true;
    document.querySelector("#sidebar").classList.remove("mobile-open");
  }
});

async function openAppointmentModal(careContext = null) {
  if (!patients.length) {
    try {
      const result = await apiRequest("/api/patients");
      renderPatientList(result.patients);
    } catch (error) {
      showToast(error.message || "Could not load fictional sample patients.");
      return;
    }
  }
  const patientSelect = document.querySelector("#appointmentPatient");
  const form = document.querySelector("#appointmentForm");
  const contextBanner = document.querySelector("#appointmentCareContext");
  const eligiblePatients = careContext
    ? patients.filter((patient) => patient.pathway === careContext.pathway)
    : patients;
  if (careContext && !eligiblePatients.length) {
    showToast("There is no fictional sample patient for this pathway yet, so an appointment cannot be booked.");
    return;
  }
  patientSelect.replaceChildren(new Option(
    careContext ? "Choose a sample patient in this pathway" : "Choose a fictional sample patient",
    "",
  ));
  eligiblePatients.forEach((patient) => patientSelect.add(new Option(patient.name, patient.id)));
  form.elements.namedItem("carePathway").value = careContext?.pathway || "";
  form.elements.namedItem("careApproach").value = careContext?.approach.id || "";
  form.reset();
  form.elements.namedItem("carePathway").value = careContext?.pathway || "";
  form.elements.namedItem("careApproach").value = careContext?.approach.id || "";
  form.elements.namedItem("visitDate").value = getLocalDate();
  form.elements.namedItem("visitDate").min = getLocalDate();
  form.elements.namedItem("appointmentTime").value = "13:00";
  form.elements.namedItem("visitType").value = "Care coordination";
  document.querySelector("#appointmentSubmitLabel").textContent = careContext
    ? "Find suggested clinicians"
    : "Add appointment";
  form.hidden = false;
  document.querySelector("#doctorSuggestions").hidden = true;
  document.querySelector("#doctorSuggestions").replaceChildren();
  document.querySelector("#doctorSuggestionsBack").hidden = true;
  pendingCareBooking = null;
  contextBanner.hidden = !careContext;
  contextBanner.textContent = careContext
    ? `Pathway appointment · ${careContext.pathway} · ${careContext.approach.name}`
    : "";
  lastFocusedElement = document.activeElement;
  modal.hidden = false;
  patientSelect.focus();
}

function closeAppointmentModal() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.querySelector("#appointmentForm").reset();
  document.querySelector("#appointmentCareContext").hidden = true;
  document.querySelector("#doctorSuggestions").replaceChildren();
  document.querySelector("#doctorSuggestions").hidden = true;
  document.querySelector("#doctorSuggestionsBack").hidden = true;
  document.querySelector("#appointmentForm").hidden = false;
  pendingCareBooking = null;
  if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
}

document.querySelector("#appointmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const patientId = String(form.get("patientId") || "");
  const patientName = document.querySelector("#appointmentPatient").selectedOptions[0]?.textContent || "Sample patient";
  const appointmentTime = String(form.get("appointmentTime") || "");
  const visitType = String(form.get("visitType") || "");
  const carePathway = String(form.get("carePathway") || "");
  const careApproach = String(form.get("careApproach") || "");
  const visitDate = String(form.get("visitDate") || "");
  const appointmentDetails = { patientId, patientName, appointmentTime, visitType, visitDate };
  if (carePathway && careApproach) {
    pendingCareBooking = {
      ...appointmentDetails,
      carePathway,
      careApproach,
    };
    showSuggestedClinicians(pendingCareBooking);
    return;
  }
  await saveAppointment(appointmentDetails);
});

function showSuggestedClinicians(booking) {
  const approach = careApproaches.find((item) => item.id === booking.careApproach);
  const results = document.querySelector("#doctorSuggestions");
  results.replaceChildren();
  if (!approach) {
    showToast("Could not find this care approach. Choose it again from Care pathways.");
    return;
  }
  const weekday = new Date(`${booking.visitDate}T12:00:00`).getDay();
  const suggestions = approach.clinicians.filter((clinician) =>
    clinician.availableDays.includes(weekday) &&
    clinician.visitTypes.includes(booking.visitType) &&
    booking.appointmentTime >= clinician.availableFrom &&
    booking.appointmentTime <= clinician.availableTo,
  );
  const heading = document.createElement("h3");
  heading.textContent = "Suggested demo doctors";
  const summary = document.createElement("p");
  summary.className = "doctor-results-summary";
  summary.textContent = `${booking.patientName} · ${booking.carePathway} · ${approach.name} · ${booking.visitType} · ${booking.visitDate} at ${booking.appointmentTime}`;
  results.append(heading, summary);
  if (!suggestions.length) {
    const empty = document.createElement("p");
    empty.className = "empty-appointments";
    empty.textContent = "No demo doctors are available for this date and time. Go back and choose another time.";
    results.append(empty);
  } else {
    suggestions.forEach((clinician) => {
      const card = document.createElement("article");
      card.className = "doctor-suggestion-card";
      const header = document.createElement("div");
      header.className = "doctor-suggestion-header";
      const title = document.createElement("div");
      const name = document.createElement("h4");
      name.textContent = clinician.name;
      const specialty = document.createElement("p");
      specialty.textContent = clinician.specialty;
      title.append(name, specialty);
      const available = document.createElement("span");
      available.className = "doctor-available-badge";
      available.textContent = "Available at selected time";
      header.append(title, available);

      const details = document.createElement("details");
      details.className = "doctor-details";
      const summaryLine = document.createElement("summary");
      summaryLine.textContent = "View doctor details";
      const detailList = document.createElement("dl");
      [
        ["Credentials", clinician.credentials],
        ["Experience", clinician.experience],
        ["Languages", clinician.languages],
        ["Focus areas", clinician.focusAreas],
        ["Clinic", clinician.clinic],
        ["Availability", `${clinician.availableFrom}–${clinician.availableTo}, ${clinician.availableDays.map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]).join(", ")}`],
        ["Visit types", clinician.visitTypes.join(", ")],
        ["Appointment type", booking.visitType],
      ].forEach(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = value;
        detailList.append(term, description);
      });
      const demoNote = document.createElement("p");
      demoNote.className = "doctor-demo-note";
      demoNote.textContent = "Fictional demo profile. Credentials and experience are examples, not real or verified.";
      details.append(summaryLine, detailList, demoNote);

      const choose = document.createElement("button");
      choose.className = "button button-primary";
      choose.type = "button";
      choose.dataset.selectDoctor = clinician.id;
      choose.textContent = "Select doctor & book appointment";
      card.append(header, details, choose);
      results.append(card);
    });
  }
  document.querySelector("#appointmentForm").hidden = true;
  results.hidden = false;
  document.querySelector("#doctorSuggestionsBack").hidden = false;
}

async function saveAppointment(booking) {
  const requestBody = {
    patientId: booking.patientId,
    appointmentTime: booking.appointmentTime,
    visitDate: booking.visitDate,
    visitType: booking.visitType,
    ...(booking.carePathway && booking.careApproach
      ? { carePathway: booking.carePathway, careApproach: booking.careApproach, clinicianId: booking.clinicianId }
      : {}),
  };
  try {
    const result = await apiRequest("/api/appointments", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    closeAppointmentModal();
    navigate("appointments");
    const scheduleDate = document.querySelector("#appointmentScheduleDate");
    if (scheduleDate) scheduleDate.value = booking.visitDate;
    await loadAppointments(true, booking.visitDate);
    if (booking.visitDate === getLocalDate()) await loadDashboard();
    const clinician = result.appointment.clinicianName;
    showToast(clinician
      ? `${booking.patientName}'s appointment with ${clinician} was booked.`
      : `${booking.patientName}'s appointment was saved in the local database.`);
    return true;
  } catch (error) {
    showToast(error.message || "The appointment could not be saved. Please try again.");
    return false;
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...options.headers },
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The server returned an invalid response. Please try again.");
  }
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/api/auth/")) showAuthScreen();
    const error = new Error(payload?.error || "The request could not be completed.");
    error.code = payload?.code;
    throw error;
  }
  return payload;
}

function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAppointmentTime(value) {
  const [hours, minutes] = value.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return { clock: `${String(displayHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`, period };
}

function createAppointmentRow(appointment, full = false) {
  const row = document.createElement("article");
  row.className = full ? "patient-row database-appointment-row" : "appointment-row";
  const avatar = document.createElement("div");
  avatar.className = `appointment-avatar ${appointment.avatarColor}`;
  avatar.textContent = appointment.initials;
  const info = document.createElement("div");
  info.className = full ? "" : "appointment-info";
  const name = document.createElement("strong");
  name.textContent = appointment.patientName;
  const detail = document.createElement(full ? "small" : "span");
  detail.textContent = [
    appointment.appointmentTime,
    appointment.specialty,
    appointment.visitType,
    appointment.carePathway,
    appointment.careApproach,
    appointment.clinicianName ? `Doctor: ${appointment.clinicianName} (${appointment.clinicianSpecialty})` : "",
  ].filter(Boolean).join(" · ");
  info.append(name, detail);
  if (full) {
    const state = document.createElement("span");
    state.textContent = "Fictional demo";
    row.append(avatar, info, state);
    return row;
  }
  const time = formatAppointmentTime(appointment.appointmentTime);
  const appointmentTime = document.createElement("div");
  appointmentTime.className = "appointment-time";
  const clock = document.createElement("strong");
  clock.textContent = time.clock;
  const period = document.createElement("span");
  period.textContent = time.period;
  appointmentTime.append(clock, period);
  const line = document.createElement("span");
  line.className = "timeline-line";
  const status = document.createElement("span");
  status.className = "appointment-status status-upcoming";
  status.textContent = "Scheduled";
  const more = document.createElement("button");
  more.className = "icon-button row-more";
  more.type = "button";
  more.setAttribute("aria-label", `Appointment for ${appointment.patientName}`);
  more.innerHTML = '<svg class="icon"><use href="#i-more"></use></svg>';
  row.append(appointmentTime, line, avatar, info, status, more);
  return row;
}

function renderPatientList(samplePatients) {
  patients = samplePatients;
  renderPatientInitials();
  document.querySelector("#patientCount").textContent = String(samplePatients.length);
  const patientList = document.querySelector("#secondaryContent .patient-list");
  if (patientList) {
    patientList.replaceChildren();
    samplePatients.forEach((patient) => {
      const row = document.createElement("article");
      row.className = "patient-row";
      const avatar = document.createElement("div");
      avatar.className = `appointment-avatar ${patient.avatarColor}`;
      avatar.textContent = patient.initials;
      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = patient.name;
      const details = document.createElement("small");
      details.textContent = `${patient.specialty} · ${patient.pathway}`;
      info.append(name, details);
      const label = document.createElement("span");
      label.textContent = "Fictional demo";
      row.append(avatar, info, label);
      patientList.append(row);
    });
  }
  const patientSelect = document.querySelector("#appointmentPatient");
  patientSelect.replaceChildren(new Option("Choose a fictional sample patient", ""));
  samplePatients.forEach((patient) => patientSelect.add(new Option(patient.name, patient.id)));
}

async function loadPatients() {
  try {
    const patientResult = await apiRequest("/api/patients");
    renderPatientList(patientResult.patients);
  } catch (error) {
    showToast(error.message || "Could not load fictional sample patients.");
  }
}

async function loadCareApproaches() {
  try {
    const result = await apiRequest("/api/care-options");
    careApproaches = result.approaches;
    return true;
  } catch (error) {
    showToast(error.message || "Could not load care approaches.");
    return false;
  }
}

function renderPathways(samplePathways) {
  pathways = samplePathways;
  const overviewList = document.querySelector("#pathwayOverviewList");
  const pathwayCards = document.querySelector("#secondaryContent .pathway-cards");
  const renderEmpty = (container, message) => {
    if (!container) return;
    const empty = document.createElement("p");
    empty.className = "empty-appointments";
    empty.textContent = message;
    container.replaceChildren(empty);
  };
  if (!samplePathways.length) {
    renderEmpty(overviewList, "No sample care pathways are available.");
    renderEmpty(pathwayCards, "No sample care pathways are available.");
    return;
  }
  const overviewColors = ["symbol-mint", "symbol-lavender"];
  const overviewIcons = ["i-heart", "i-activity"];
  const cardColors = ["mint", "lavender", "peach", "blue"];
  const pathwayDescriptions = {
    "Arthritis support": "A fictional care-coordination example for follow-ups, mobility check-ins, and communication with a qualified care team.",
    "Allergy care": "A fictional care-coordination example for organizing allergy reviews and questions for a qualified clinician.",
    "Asthma care": "A fictional care-coordination example for routine reviews and keeping the person's clinician-provided asthma plan in view.",
    "Cancer care coordination": "A fictional support example for coordinating appointments and conversations with a person's oncology team.",
    "Chronic kidney health": "A fictional care-coordination example for organizing clinician visits and follow-up conversations.",
    "Chronic pain support": "A fictional care-coordination example for tracking follow-ups and discussing daily-life concerns with a qualified care team.",
    "COPD support": "A fictional care-coordination example for respiratory follow-ups and communication with the person's care team.",
    "Diabetes management": "A fictional care-coordination example for routine reviews and follow-ups with the person's diabetes care team.",
    "Digestive health": "A fictional care-coordination example for organizing digestive-health visits and follow-up questions.",
    "Epilepsy support": "A fictional care-coordination example for neurology follow-ups and communication with the person's care team.",
    "Heart health pathway": "A fictional care-coordination example for heart-health follow-ups and preventive-care conversations.",
    "High blood pressure care": "A fictional care-coordination example for regular reviews and discussing blood-pressure questions with a clinician.",
    "Mental wellbeing": "A fictional support example for organizing wellbeing check-ins and accessing qualified mental-health support.",
    "Migraine care": "A fictional care-coordination example for follow-up conversations about recurring headaches with a qualified clinician.",
    "Osteoporosis support": "A fictional care-coordination example for organizing bone-health reviews and clinician follow-ups.",
    "Preventive care": "A fictional care-coordination example for organizing routine wellness visits and preventive-care discussions.",
    "Skin health": "A fictional care-coordination example for dermatology appointments and follow-up questions.",
    "Sleep health": "A fictional care-coordination example for organizing sleep-related reviews with a qualified care team.",
    "Stroke recovery": "A fictional recovery-support example for coordinating follow-ups with the person's rehabilitation and clinical team.",
    "Thyroid health": "A fictional care-coordination example for organizing thyroid-related reviews and clinician follow-ups.",
  };
  const makePathwayIcon = (className, iconName) => {
    const icon = document.createElement("span");
    icon.className = className;
    icon.innerHTML = `<svg class="icon"><use href="#${iconName}"></use></svg>`;
    return icon;
  };
  if (overviewList) {
    overviewList.replaceChildren();
    samplePathways.slice(0, 2).forEach((pathway, index) => {
      const item = document.createElement("article");
      item.className = "pathway-item";
      const detail = document.createElement("div");
      detail.className = "pathway-detail";
      const title = document.createElement("div");
      title.className = "pathway-title";
      const name = document.createElement("strong");
      name.textContent = pathway.pathway;
      const count = document.createElement("span");
      count.textContent = `${pathway.patientCount} ${pathway.patientCount === 1 ? "patient" : "patients"}`;
      title.append(name, count);
      const note = document.createElement("div");
      note.className = "pathway-meta";
      note.textContent = "Based on fictional sample records";
      detail.append(title, note);
      const open = document.createElement("button");
      open.className = "icon-button";
      open.type = "button";
      open.dataset.nav = "pathways";
      open.setAttribute("aria-label", `View ${pathway.pathway} pathway`);
      open.innerHTML = '<svg class="icon"><use href="#i-chevron"></use></svg>';
      item.append(makePathwayIcon(`pathway-symbol ${overviewColors[index % overviewColors.length]}`, overviewIcons[index % overviewIcons.length]), detail, open);
      overviewList.append(item);
    });
  }
  if (pathwayCards) {
    pathwayCards.replaceChildren();
    samplePathways.forEach((pathway, index) => {
      const card = document.createElement("article");
      card.className = "secondary-card";
      const eyebrow = document.createElement("span");
      eyebrow.className = "section-eyebrow";
      eyebrow.textContent = `${pathway.patientCount} ${pathway.patientCount === 1 ? "FICTIONAL PATIENT" : "FICTIONAL PATIENTS"}`;
      const heading = document.createElement("h3");
      heading.textContent = pathway.pathway;
      const note = document.createElement("p");
      note.textContent = pathwayDescriptions[pathway.pathway] || "A fictional care-coordination example based on sample records; consult a qualified care team for individual advice.";
      const choose = document.createElement("button");
      choose.className = "button button-light pathway-select";
      choose.type = "button";
      choose.dataset.pathwaySelect = pathway.pathway;
      choose.textContent = "Explore care approaches";
      card.append(makePathwayIcon(`insight-icon ${cardColors[index % cardColors.length]}`, "i-route"), eyebrow, heading, note, choose);
      pathwayCards.append(card);
    });
  }
}

function createCareWorkflow(step, pathway, title, description) {
  const content = document.querySelector("#secondaryContent");
  content.replaceChildren();
  const banner = document.createElement("section");
  banner.className = "section-banner care-workflow-banner";
  const bannerCopy = document.createElement("div");
  const heading = document.createElement("h2");
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = description;
  bannerCopy.append(heading, copy);
  const back = document.createElement("button");
  back.className = "button button-light";
  back.type = "button";
  back.dataset.careBack = String(step);
  back.textContent = step === 2 ? "Back to pathways" : "Back to approaches";
  banner.append(bannerCopy, back);

  const progress = document.createElement("ol");
  progress.className = "care-workflow-steps";
  ["Disease pathway", "Care approach", "Appointment"].forEach((label, index) => {
    const item = document.createElement("li");
    item.classList.toggle("is-current", index + 1 === step);
    item.classList.toggle("is-complete", index + 1 < step);
    item.textContent = `${index + 1}. ${label}`;
    progress.append(item);
  });
  const pathwayLabel = document.createElement("p");
  pathwayLabel.className = "care-workflow-pathway";
  pathwayLabel.textContent = `Selected pathway: ${pathway}`;
  content.append(banner, progress, pathwayLabel);
  return content;
}

function updateCareWorkflowHeading(title, subtitle) {
  document.querySelector("#secondaryTitle").textContent = title;
  document.querySelector("#secondarySubtitle").textContent = subtitle;
  document.querySelector("#secondaryEyebrow").textContent = "CARE PATHWAY";
  document.querySelector("#breadcrumbCurrent").textContent = title;
}

async function startCarePathway(pathway) {
  if (!careApproaches.length && !(await loadCareApproaches())) return;
  activeCarePathway = pathway;
  updateCareWorkflowHeading(pathway, "Explore options for this sample care pathway.");
  const content = createCareWorkflow(
    2,
    pathway,
    "Choose a care approach",
    "These options are for information and care coordination. They do not promise a cure or replace advice from a qualified clinician.",
  );
  const grid = document.createElement("div");
  grid.className = "care-option-grid";
  careApproaches.forEach((approach) => {
    const card = document.createElement("article");
    card.className = "secondary-card care-option-card";
    const heading = document.createElement("h3");
    heading.textContent = approach.name;
    const description = document.createElement("p");
    description.textContent = approach.description;
    const note = document.createElement("p");
    note.className = "care-safety-copy";
    note.textContent = approach.note;
    const choose = document.createElement("button");
    choose.className = "button button-primary";
    choose.type = "button";
    choose.dataset.careApproach = approach.id;
    choose.textContent = "New appointment";
    card.append(heading, description, note, choose);
    grid.append(card);
  });
  content.append(grid);
}

let activeCarePathway = "";

async function loadDashboard() {
  try {
    const date = getLocalDate();
    const result = await apiRequest(`/api/dashboard?date=${encodeURIComponent(date)}`);
    document.querySelector("#patientCount").textContent = String(result.patientCount);
    document.querySelector("#appointmentCount").textContent = String(result.appointmentCount);
    document.querySelector("#pathwayCount").textContent = String(result.pathwayCount);
    document.querySelector("#patientTeamSummary").textContent = "Fictional records in SQLite";
    renderPatientInitials();
    renderPathways(result.pathways);
  } catch (error) {
    showToast(error.message || "Could not load the dashboard summary from the database.");
  }
}

function renderAppointments(appointments, total) {
  appointmentList.replaceChildren();
  const overviewVisible = !overviewView.hidden;
  const now = new Date();
  const upcoming = appointments.filter((appointment) =>
    new Date(`${appointment.visitDate}T${appointment.appointmentTime}:00`) >= now,
  );
  const visibleAppointments = overviewVisible ? upcoming : appointments;
  if (!visibleAppointments.length) {
    const empty = document.createElement("p");
    empty.className = "empty-appointments";
    empty.textContent = overviewVisible
      ? "No upcoming sample appointments remain for today."
      : "No sample appointments are scheduled for this day yet.";
    appointmentList.append(empty);
  } else {
    visibleAppointments.forEach((appointment) => appointmentList.append(createAppointmentRow(appointment)));
  }
  document.querySelector("#appointmentCount").textContent = String(total);
  const nextAppointment = upcoming[0];
  document.querySelector("#nextAppointmentLabel").textContent = nextAppointment
    ? `Next: ${formatAppointmentTime(nextAppointment.appointmentTime).clock} ${formatAppointmentTime(nextAppointment.appointmentTime).period}`
    : "No appointments left today";
  const appointmentPageList = document.querySelector("#secondaryContent .patient-list");
  if (appointmentPageList) {
    appointmentPageList.replaceChildren();
    if (!appointments.length) {
      const empty = document.createElement("p");
      empty.className = "empty-appointments";
      empty.textContent = "No sample appointments are scheduled for this day yet.";
      appointmentPageList.append(empty);
    } else {
      appointments.forEach((appointment) => appointmentPageList.append(createAppointmentRow(appointment, true)));
    }
  }
}

async function loadAppointments(showError = true, requestedDate = getLocalDate()) {
  try {
    const result = await apiRequest(`/api/appointments?date=${encodeURIComponent(requestedDate)}`);
    renderAppointments(result.appointments, result.total);
  } catch (error) {
    if (showError) showToast(error.message || "Could not load appointments from the database.");
  }
}

async function initializeSession() {
  try {
    const result = await apiRequest("/api/auth/me");
    if (result.user) enterDashboard(result.user);
    else showAuthScreen();
  } catch (error) {
    showAuthScreen(error.message || "Unable to connect to Careflow. Please refresh and try again.");
  }
}

void initializeSession();

const healthSources = {
  nhsFever: { name: "NHS: Fever in adults", url: "https://www.nhs.uk/symptoms/fever-in-adults/" },
  nhsCold: { name: "NHS: Common cold", url: "https://www.nhs.uk/conditions/common-cold/" },
  nhsHeadache: { name: "NHS: Headaches", url: "https://www.nhs.uk/symptoms/headaches/" },
  nhsBloodPressure: { name: "NHS: High blood pressure", url: "https://www.nhs.uk/conditions/high-blood-pressure/" },
  nhsCholesterol: { name: "NHS: High cholesterol", url: "https://www.nhs.uk/conditions/high-cholesterol/" },
  nciCancer: { name: "NCI: What is cancer?", url: "https://www.cancer.gov/about-cancer/understanding/what-is-cancer" },
  cdcDiabetes: { name: "CDC: About diabetes", url: "https://www.cdc.gov/diabetes/about/index.html" },
  whoDiet: { name: "WHO: Healthy diet", url: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet" },
  cdcActivity: { name: "CDC: Adult physical activity", url: "https://www.cdc.gov/physical-activity-basics/guidelines/adults.html" },
  cdcSleep: { name: "CDC: About sleep", url: "https://www.cdc.gov/sleep/about/index.html" },
  whoMentalHealth: { name: "WHO: Mental health", url: "https://www.who.int/news-room/fact-sheets/detail/mental-health-strengthening-our-response" },
  nhsAsthma: { name: "NHS: Asthma", url: "https://www.nhs.uk/conditions/asthma/" },
  nhsStomach: { name: "NHS: Diarrhoea and vomiting", url: "https://www.nhs.uk/symptoms/diarrhoea-and-vomiting/" },
  nhsPregnancy: { name: "NHS: Keeping well in pregnancy", url: "https://www.nhs.uk/pregnancy/keeping-well/" },
  nhsMedicines: { name: "NHS: Medicines A to Z", url: "https://www.nhs.uk/medicines/" },
  whoVaccines: { name: "WHO: Vaccines and immunization", url: "https://www.who.int/health-topics/vaccines-and-immunization" },
  whoHealth: { name: "WHO: Health topics", url: "https://www.who.int/health-topics/" },
  medlineplus: { name: "MedlinePlus: Health topics", url: "https://medlineplus.gov/healthtopics.html" },
};

const healthTopics = [
  {
    pattern: /\b(fever|high temperature|temperature|bukhar|taap|बुखार)\b/,
    en: "A fever is often the body's response to an infection; in adults, 38°C or higher is commonly considered a high temperature. Rest and drink fluids if you can. A temperature alone does not identify the cause. Get medical advice if symptoms are worsening, you are worried, or the person is very young, pregnant, immunocompromised, or has a serious long-term condition.",
    hi: "बुखार अक्सर संक्रमण के प्रति शरीर की प्रतिक्रिया होता है। वयस्कों में 38°C या उससे अधिक तापमान को आम तौर पर तेज़ बुखार माना जाता है। आराम करें और, यदि संभव हो, तरल पदार्थ लें। केवल तापमान से कारण पता नहीं चलता। लक्षण बढ़ें, चिंता हो, या मरीज बहुत छोटा बच्चा, गर्भवती, कमज़ोर प्रतिरक्षा वाला हो, तो डॉक्टर से सलाह लें।",
    source: "nhsFever",
  },
  {
    pattern: /\b(cold|flu|cough|sore throat|runny nose|blocked nose|zukam|khansi|सर्दी|जुकाम|खांसी|खाँसी|गला दर्द)\b/,
    en: "Common colds usually cause a runny or blocked nose, sneezing, sore throat, and cough; flu often comes on more suddenly and can feel more severe. Rest, fluids, and avoiding close contact while unwell may help. Seek medical advice if breathing becomes difficult, symptoms worsen significantly, or you are at higher risk. This can't tell which infection you have.",
    hi: "सामान्य सर्दी-जुकाम में नाक बहना या बंद होना, छींक, गले में दर्द और खाँसी हो सकती है; फ्लू अक्सर अचानक शुरू होता है और अधिक गंभीर लग सकता है। आराम करें, तरल पदार्थ लें और अस्वस्थ होने पर दूसरों से नज़दीकी संपर्क कम करें। साँस लेने में दिक्कत हो या लक्षण बहुत बिगड़ें तो डॉक्टर से सलाह लें। केवल इन लक्षणों से संक्रमण की पुष्टि नहीं की जा सकती।",
    source: "nhsCold",
  },
  {
    pattern: /\b(headache|migraine|sir dard|सिर दर्द|सिरदर्द|आधे सिर)\b/,
    en: "Headaches have many possible causes, and most are not emergencies. Rest, water, and regular meals may help some ordinary headaches. I can't identify the cause or recommend a medicine for you. Arrange medical advice for a new, recurring, worsening, or persistent headache. A sudden, extremely severe headache or one with weakness, confusion, fainting, or vision/speech trouble needs urgent emergency assessment.",
    hi: "सिरदर्द के कई कारण हो सकते हैं; अधिकतर आपातकालीन नहीं होते। सामान्य सिरदर्द में आराम, पानी और नियमित भोजन कुछ लोगों को मदद कर सकते हैं। मैं कारण नहीं बता सकता या आपके लिए दवा नहीं चुन सकता। नया, बार-बार होने वाला, बढ़ता या लगातार सिरदर्द हो तो डॉक्टर से सलाह लें। अचानक बहुत तेज़ सिरदर्द, कमजोरी, भ्रम, बेहोशी या देखने/बोलने में परेशानी हो तो तुरंत आपातकालीन मदद लें।",
    source: "nhsHeadache",
  },
  {
    pattern: /\b(blood pressure|hypertension|bp|high bp|low bp|ब्लड प्रेशर|रक्तचाप|बीपी)\b/,
    en: "High blood pressure often has no obvious symptoms, so a proper measurement is the way to know. One reading alone may not establish a diagnosis. Have readings checked and discussed with a healthcare professional; don't start, stop, or change blood-pressure medicine based on a chat. Sudden chest pain, severe breathlessness, fainting, or stroke-like symptoms require emergency help.",
    hi: "उच्च रक्तचाप में अक्सर कोई साफ़ लक्षण नहीं होते; इसे जानने का तरीका सही माप लेना है। केवल एक रीडिंग से निदान तय नहीं होता। अपनी रीडिंग स्वास्थ्यकर्मी से जाँचें और समझें। चैट के आधार पर रक्तचाप की दवा शुरू, बंद या बदलें नहीं। अचानक सीने में दर्द, तेज़ साँस फूलना, बेहोशी या स्ट्रोक जैसे लक्षण हों तो तुरंत आपातकालीन मदद लें।",
    source: "nhsBloodPressure",
  },
  {
    pattern: /\b(cholesterol|कोलेस्ट्रॉल|कोलेस्टेरॉल)\b/,
    en: "High cholesterol usually has no symptoms and is found with a blood test. Your result and overall risk should be discussed with a clinician; lifestyle changes help some people, while others may also need prescribed medicine. Don't start or stop cholesterol medicine based on a chat.",
    hi: "उच्च कोलेस्ट्रॉल में आम तौर पर लक्षण नहीं होते; इसका पता रक्त-जाँच से चलता है। अपनी रिपोर्ट और कुल जोखिम डॉक्टर से समझें। जीवनशैली में बदलाव कुछ लोगों की मदद करते हैं; कुछ को डॉक्टर की लिखी दवा भी चाहिए। चैट के आधार पर कोलेस्ट्रॉल की दवा शुरू या बंद न करें।",
    source: "nhsCholesterol",
  },
  {
    pattern: /\b(cancer|tumou?r|कैंसर|ट्यूमर)\b/,
    en: "Cancer is a group of diseases in which some cells grow uncontrollably and may invade or spread to other parts of the body. There are many different cancers; a lump or symptom alone does not prove cancer. Diagnosis and treatment depend on medical tests and the cancer type, so discuss a personal concern with a qualified clinician.",
    hi: "कैंसर कई बीमारियों का समूह है, जिसमें कुछ कोशिकाएँ अनियंत्रित रूप से बढ़ती हैं और आसपास या शरीर के अन्य हिस्सों में फैल सकती हैं। कैंसर कई प्रकार के होते हैं; केवल गाँठ या लक्षण से कैंसर की पुष्टि नहीं होती। निदान और इलाज के लिए जाँच और विशेषज्ञ की सलाह ज़रूरी है।",
    source: "nciCancer",
  },
  {
    pattern: /\b(diabetes|diabetic|blood sugar|blood glucose|insulin|shugar|madhumeh|मधुमेह|शुगर|डायबिटीज|ब्लड शुगर)\b/,
    en: "Diabetes is a long-term condition affecting how the body uses blood glucose. The main types include type 1, type 2, and gestational diabetes. Symptoms and personal glucose targets vary, and a blood test is needed for diagnosis. A clinician can explain your results and make a safe care plan; don't change insulin or other medicines based on chat advice.",
    hi: "डायबिटीज़ एक दीर्घकालिक स्थिति है जिसमें शरीर रक्त-शर्करा का उपयोग ठीक से नहीं कर पाता। इसके मुख्य प्रकार टाइप 1, टाइप 2 और गर्भावस्था में होने वाली डायबिटीज़ हैं। लक्षण और व्यक्तिगत लक्ष्य अलग-अलग होते हैं; निदान के लिए जाँच ज़रूरी है। रिपोर्ट और इलाज डॉक्टर से समझें। चैट के आधार पर इंसुलिन या दूसरी दवा न बदलें।",
    source: "cdcDiabetes",
  },
  {
    pattern: /\b(sleep|insomnia|can't sleep|cannot sleep|neend|नींद|सो नहीं पा|अनिद्रा)\b/,
    en: "Sleep needs vary with age and the individual. A regular sleep and wake time, a calm wind-down routine, and a comfortable, dark, quiet room can support better sleep. Ongoing sleep trouble, loud snoring with breathing pauses, or daytime sleepiness is worth discussing with a clinician. Don't use someone else's sleep medicine.",
    hi: "नींद की ज़रूरत उम्र और व्यक्ति के अनुसार बदलती है। सोने-जागने का नियमित समय, सोने से पहले शांत दिनचर्या, और आरामदायक, अँधेरा व शांत कमरा मदद कर सकते हैं। नींद की परेशानी लगातार रहे, साँस रुकने के साथ तेज़ खर्राटे हों या दिन में बहुत नींद आए तो डॉक्टर से बात करें। किसी और की नींद की दवा न लें।",
    source: "cdcSleep",
  },
  {
    pattern: /\b(stress|anxiety|anxious|depress|panic|mental health|chinta|ghabrahat|tanav|मनोस्वास्थ्य|तनाव|चिंता|घबराहट|डिप्रेशन|उदासी)\b/,
    en: "Stress and mental health struggles are real health concerns, and support is available. Talking with someone you trust and reaching out to a qualified mental-health professional can be useful. I can't diagnose a mental-health condition. If you may hurt yourself or someone else, or cannot stay safe, contact local emergency services or a crisis service now and stay with a trusted person.",
    hi: "तनाव और मानसिक स्वास्थ्य की परेशानी वास्तविक स्वास्थ्य समस्याएँ हैं; सहायता उपलब्ध है। किसी भरोसेमंद व्यक्ति से बात करना और मानसिक स्वास्थ्य विशेषज्ञ से संपर्क करना उपयोगी हो सकता है। मैं मानसिक बीमारी का निदान नहीं कर सकता। अगर आपको खुद को या किसी और को नुकसान पहुँचने का खतरा हो, या आप सुरक्षित न रह पा रहे हों, तो अभी स्थानीय आपातकालीन सेवा या संकट-सहायता से संपर्क करें और किसी भरोसेमंद व्यक्ति के साथ रहें।",
    source: "whoMentalHealth",
  },
  {
    pattern: /\b(healthy diet|nutrition|eat healthy|food|diet|balanced diet|healthy eating|khana|bhojan|poshan|पोषण|खाना|भोजन|खानपान|संतुलित आहार)\b/,
    en: "Healthy eating is about an overall pattern, not one “perfect” food. WHO guidance emphasizes variety, balance, and mostly minimally processed foods, with individual needs differing by age, health, culture, and access. If you have diabetes, allergies, an eating disorder, are pregnant, or have a medical diet, get advice tailored by a clinician or dietitian.",
    hi: "स्वस्थ भोजन किसी एक “सुपरफूड” से नहीं, बल्कि कुल खान-पान से बनता है। WHO विविधता, संतुलन और कम-प्रसंस्कृत खाद्य पदार्थों पर ज़ोर देता है; ज़रूरतें उम्र, स्वास्थ्य, संस्कृति और उपलब्धता से बदलती हैं। डायबिटीज़, एलर्जी, खाने से जुड़ी बीमारी, गर्भावस्था या चिकित्सकीय आहार हो तो व्यक्तिगत सलाह लें।",
    source: "whoDiet",
  },
  {
    pattern: /\b(exercise|workout|physical activity|walk|fitness|vyayam|kasrat|चलना|व्यायाम|कसरत|फिटनेस)\b/,
    en: "For many adults, public-health guidance suggests working toward 150 minutes of moderate activity per week plus muscle-strengthening activity on 2 days. Any movement is better than none, and activity can be built up gradually. The right level depends on age, health, pregnancy, disability, and fitness. Stop if you feel seriously unwell, and ask a clinician before starting if you have relevant health concerns.",
    hi: "कई वयस्कों के लिए सार्वजनिक स्वास्थ्य मार्गदर्शन में सप्ताह में लगभग 150 मिनट मध्यम गतिविधि और 2 दिन मांसपेशियों को मज़बूत करने वाला व्यायाम सुझाया जाता है। थोड़ी गतिविधि भी लाभदायक है; धीरे-धीरे बढ़ाएँ। सही स्तर उम्र, स्वास्थ्य, गर्भावस्था, दिव्यांगता और फिटनेस पर निर्भर करता है। स्वास्थ्य संबंधी चिंता हो तो नया कार्यक्रम शुरू करने से पहले डॉक्टर से पूछें।",
    source: "cdcActivity",
  },
  {
    pattern: /\b(asthma|wheez|inhaler|dama|दम|दमा|अस्थमा|घरघराहट)\b/,
    en: "Asthma can cause wheezing, cough, chest tightness, or shortness of breath, and triggers vary. Follow the asthma action plan and use only medication prescribed for that person; I can't set inhaler doses. If breathing is severely difficult or the prescribed reliever/action plan is not helping, seek emergency help.",
    hi: "अस्थमा में घरघराहट, खाँसी, सीने में जकड़न या साँस फूलना हो सकता है; कारण अलग-अलग हो सकते हैं। डॉक्टर की दी हुई अस्थमा योजना और उसी व्यक्ति की निर्धारित दवा का पालन करें; मैं इनहेलर की खुराक तय नहीं कर सकता। साँस बहुत मुश्किल हो या निर्धारित राहत/योजना से आराम न मिले तो तुरंत आपातकालीन मदद लें।",
    source: "nhsAsthma",
  },
  {
    pattern: /\b(diarrh?ea|vomit|vomiting|loose motion|stomach bug|dast|ultee|दस्त|उल्टी|पेट खराब)\b/,
    en: "Vomiting or diarrhoea can lead to dehydration. If you can, take small, frequent sips of fluids. Seek medical advice if you can't keep fluids down, have very little urine, feel unusually drowsy, see blood, or are concerned—especially for a baby, young child, older adult, or someone with long-term illness. I can't assess the cause here.",
    hi: "उल्टी या दस्त से शरीर में पानी की कमी हो सकती है। यदि संभव हो, थोड़ी-थोड़ी मात्रा में बार-बार तरल लें। तरल न रुकें, पेशाब बहुत कम हो, असामान्य सुस्ती हो, खून आए या चिंता हो तो डॉक्टर से सलाह लें—खासकर शिशु, छोटे बच्चे, बुज़ुर्ग या लंबे समय की बीमारी वाले व्यक्ति के लिए। मैं यहाँ कारण का आकलन नहीं कर सकता।",
    source: "nhsStomach",
  },
  {
    pattern: /\b(pregnan|pregnancy|garbh|pregnant|गर्भवती|गर्भावस्था|प्रेग्नेंट|प्रेगनेंसी)\b/,
    en: "Pregnancy care is individual. Arrange antenatal care with a qualified local provider, and check any medicine, supplement, food-safety, or vaccine question with them before making changes. Seek urgent care for heavy bleeding, severe pain, fainting, or any symptom your maternity team has told you is urgent.",
    hi: "गर्भावस्था की देखभाल हर व्यक्ति के लिए अलग होती है। योग्य स्थानीय स्वास्थ्यकर्मी से नियमित जाँच तय करें। दवा, सप्लीमेंट, भोजन-सुरक्षा या टीके से जुड़े बदलाव पहले उनसे पूछें। बहुत ज़्यादा रक्तस्राव, तेज़ दर्द, बेहोशी या आपकी मातृत्व टीम द्वारा बताए गए किसी आपात लक्षण पर तुरंत मदद लें।",
    source: "nhsPregnancy",
  },
  {
    pattern: /\b(medicine|medication|drug|dose|dosage|antibiotic|tablet|dawa|goli|khurak|दवा|गोली|खुराक|एंटीबायोटिक)\b/,
    en: "Medicine safety depends on the exact product, dose, age, pregnancy status, allergies, and other medicines. Follow the package or prescription and ask a pharmacist or prescriber before starting, stopping, sharing, or changing a medicine. I can't recommend a personal dose or check drug interactions safely from a chat.",
    hi: "दवा की सुरक्षा सही दवा, खुराक, उम्र, गर्भावस्था, एलर्जी और साथ ली जा रही दूसरी दवाओं पर निर्भर करती है। पर्चे/लेबल का पालन करें और दवा शुरू, बंद, साझा या बदलने से पहले डॉक्टर या फार्मासिस्ट से पूछें। मैं चैट में आपके लिए सुरक्षित खुराक या दवाओं के परस्पर असर की पुष्टि नहीं कर सकता।",
    source: "nhsMedicines",
  },
  {
    pattern: /\b(vaccin|immuni[sz]|tika|teeka|टीका|टीकाकरण|वैक्सीन)\b/,
    en: "Vaccines help the immune system build protection against specific infections. Which vaccines are recommended depends on age, health, pregnancy, travel, previous doses, and your country's schedule. Check with a qualified local clinician or public-health service for your personal schedule; don't rely on a generic chat answer.",
    hi: "टीके प्रतिरक्षा तंत्र को कुछ संक्रमणों से बचाव बनाने में मदद करते हैं। कौन-सा टीका चाहिए, यह उम्र, स्वास्थ्य, गर्भावस्था, यात्रा, पहले लगे टीकों और देश की सलाह पर निर्भर करता है। अपना टीकाकरण कार्यक्रम स्थानीय स्वास्थ्यकर्मी या सार्वजनिक स्वास्थ्य सेवा से जाँचें।",
    source: "whoVaccines",
  },
];

const healthQuestionPattern = /\b(symptom\w*|caus\w*|why|what is|what are|how|feeling|sick|health|condition\w*|treat\w*|prevent\w*|risk\w*|fever|pain|लक्षण|बुखार|दर्द|क्यों|कैसे|क्या|स्वास्थ्य|बीमारी|इलाज|रोकथाम|खाँसी|खांसी|उल्टी|दवा)\b/i;
const hindiQuestionPattern = /[\u0900-\u097f]|\b(kya|kaise|hai|hain|kyun|mujhe|mere|mera|meri|ko|ka|ki|ke|batao|bataye|hota|hoti|hote|chahiye|kare|karu|sehat|tabiyat|bukhar|dard|dawa|neend|khansi|ultee|garbh|shugar|ghabrahat)\b/i;

function matchesMedicalPattern(pattern, text) {
  pattern.lastIndex = 0;
  if (pattern.test(text)) return true;
  if (!/[\u0900-\u097f]/.test(text)) return false;
  return new RegExp(pattern.source.replace(/\\b/g, ""), pattern.flags.replace("g", "")).test(text);
}

function healthResponse(query, isHindi) {
  const topic = healthTopics.find((item) => matchesMedicalPattern(item.pattern, query));
  if (!topic) {
    const answer = isHindi
      ? "यह स्थानीय स्वास्थ्य-शिक्षा डेमो है, लाइव AI नहीं; मैं हर बीमारी या व्यक्तिगत लक्षण का जवाब भरोसे से नहीं दे सकता। आम स्वास्थ्य विषयों—बुखार, सर्दी, डायबिटीज़, रक्तचाप, नींद, मानसिक स्वास्थ्य, भोजन, व्यायाम, दवाएँ, अस्थमा और गर्भावस्था—के बारे में पूछें। किसी खास समस्या के लिए उम्र, लक्षण और कितने समय से हैं बताएं (नाम, पता या रिपोर्ट जैसी निजी जानकारी न भेजें)। भरोसेमंद सामान्य जानकारी के लिए नीचे WHO या MedlinePlus देखें।"
      : "I don't recognize that topic well enough to answer safely. This is a curated local health guide, not a live AI, and it can't cover every disease or individual symptom. Try asking about fever, colds, diabetes, blood pressure, sleep, mental wellbeing, nutrition, exercise, medicines, asthma, or pregnancy. For a symptom question, share age range, symptoms, and how long they've been present—never names, addresses, or record details. For other topics, see the trusted references below.";
    return { text: answer, sources: ["whoHealth", "medlineplus"] };
  }
  return {
    text: `${isHindi ? topic.hi : topic.en} ${isHindi ? "यह सामान्य जानकारी है, व्यक्तिगत जाँच या चिकित्सकीय सलाह का विकल्प नहीं।" : "This is general information, not a personal assessment or a substitute for professional medical advice."}`,
    sources: [topic.source],
  };
}

async function responseFor(question) {
  const history = [...messages.querySelectorAll(".chat-message")]
    .slice(-8)
    .map((message) => ({
      role: message.classList.contains("user") ? "user" : "assistant",
      content: message.querySelector(":scope > span")?.textContent || "",
    }))
    .filter((message) => message.content);
  try {
    const payload = await apiRequest("/api/chat", {
      method: "POST",
      body: JSON.stringify({ question, history }),
      signal: AbortSignal.timeout(30_000),
    });
    if (typeof payload.answer !== "string") {
      throw new Error("The health assistant returned an invalid answer.");
    }
    return payload;
  } catch (error) {
    if (error.code !== "AI_NOT_CONFIGURED") throw error;
    const isHindi = hindiQuestionPattern.test(question);
    const fallback = healthResponse(question, isHindi);
    return {
      answer: `${isHindi
        ? "लाइव AI उपलब्ध नहीं है; यह चुने हुए विषयों के लिए स्थानीय स्वास्थ्य-शिक्षा गाइड का उत्तर है।"
        : "Live AI is not configured; this is an answer from the curated offline health guide."} ${fallback.text}`,
      sources: fallback.sources,
    };
  }
}

function addMessage(text, kind, sources = []) {
  const message = document.createElement("div");
  message.className = `chat-message ${kind}`;
  const copy = document.createElement("span");
  copy.textContent = text;
  message.append(copy);
  if (sources.length) {
    const sourceList = document.createElement("span");
    sourceList.className = "chat-sources";
    const label = document.createElement("span");
    label.textContent = "Sources:";
    sourceList.append(label);
    sources.forEach((item) => {
      const source = typeof item === "string" ? healthSources[item] : item;
      if (!source) return;
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.name;
      sourceList.append(link);
    });
    message.append(sourceList);
  }
  messages.append(message);
  messages.scrollTop = messages.scrollHeight;
}

async function sendMessage(rawText) {
  const text = rawText.trim();
  if (!text) return;
  intro.hidden = true;
  prompts.hidden = true;
  addMessage(text, "user");
  input.value = "";
  const pending = document.createElement("div");
  pending.className = "chat-message assistant chat-pending";
  pending.setAttribute("role", "status");
  pending.textContent = "Checking health guidance...";
  messages.append(pending);
  messages.scrollTop = messages.scrollHeight;
  try {
    const response = await responseFor(text);
    pending.remove();
    addMessage(response.answer, "assistant", response.sources || []);
  } catch (error) {
    pending.remove();
    const message = error.name === "TimeoutError"
      ? "The request timed out. Please try again."
      : error.message || "The health assistant could not connect. Please try again.";
    addMessage(message, "assistant");
  }
}

document.querySelector("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(input.value);
});
document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => sendMessage(button.dataset.prompt));
});

document.querySelector("#aiInfoButton").addEventListener("click", () => {
  showToast("Live AI uses the configured provider; a cited offline guide is available for common topics when no provider is configured. Avoid sharing identifying or sensitive health information.");
});
document.querySelector("#notificationButton").addEventListener("click", () => {
  showToast("No new notifications. This demo uses fictional sample data.");
});
document.addEventListener("click", (event) => {
  const appointmentDetails = event.target.closest(".row-more");
  if (appointmentDetails) showToast("Appointment details are read-only in this demo.");
});

const searchInput = document.querySelector("#globalSearch");
const searchResults = document.querySelector("#searchResults");

function renderSearchResults(query) {
  searchResults.replaceChildren();
  if (!query.trim()) {
    searchResults.hidden = true;
    return;
  }
  const matches = patients.filter((patient) =>
    `${patient.name} ${patient.specialty} ${patient.pathway}`.toLowerCase().includes(query.toLowerCase()),
  );
  if (matches.length === 0) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.textContent = "No sample patients found";
    empty.disabled = true;
    searchResults.append(empty);
  } else {
    matches.forEach((patient) => {
      const result = document.createElement("button");
      result.type = "button";
      result.innerHTML = '<svg class="icon"><use href="#i-users"></use></svg>';
      const label = document.createElement("span");
      label.textContent = `${patient.name} · ${patient.specialty}`;
      result.append(label);
      result.addEventListener("click", () => {
        searchInput.value = "";
        searchResults.hidden = true;
        navigate("pathways");
        showToast(`${patient.pathway} is available in Care pathways. Sample patient details remain in the demo database.`);
      });
      searchResults.append(result);
    });
  }
  searchResults.hidden = false;
}

searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") searchResults.hidden = true;
  if (event.key === "Enter" && !searchResults.hidden) searchResults.querySelector("button:not(:disabled)")?.click();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-box")) searchResults.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

document.querySelector("#mobileMenu").addEventListener("click", () => {
  document.querySelector("#sidebar").classList.toggle("mobile-open");
});

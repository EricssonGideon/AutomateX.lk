const API_BASE = "/api";

function sanitizeHTML(html) {
  // DOMPurify is used anywhere we intentionally inject HTML snippets.
  if (window.DOMPurify) {
    return window.DOMPurify.sanitize(html);
  }

  return html;
}

// Floating micro-dots
const container = document.getElementById("floatDots");
for (let index = 0; index < 22; index += 1) {
  const dot = document.createElement("span");
  dot.className = "fdot";
  dot.style.cssText = `left:${Math.random() * 100}vw;top:${Math.random() * 100}vh;width:${2 + Math.random() * 5}px;height:${2 + Math.random() * 5}px;animation-duration:${6 + Math.random() * 14}s;animation-delay:-${Math.random() * 10}s;opacity:${0.08 + Math.random() * 0.22};`;
  container.appendChild(dot);
}

// Scroll reveal
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.1 }
);

document
  .querySelectorAll(
    ".service-card,.project-card,.timeline article,.architecture-card,.review-card,.rating-hero,.rating-bars,.review-counts,.booking-feature,.contact-detail-item"
  )
  .forEach((element, index) => {
    element.style.setProperty("--delay", `${index * 0.07}s`);
    element.classList.add("scroll-hide");
    observer.observe(element);
  });

// Review card tilt
document.querySelectorAll(".review-card").forEach((card) => {
  card.addEventListener("mousemove", (event) => {
    const rect = card.getBoundingClientRect();
    card.style.transform = `perspective(800px) rotateY(${((event.clientX - rect.left) / rect.width - 0.5) * 6}deg) rotateX(${-((event.clientY - rect.top) / rect.height - 0.5) * 6}deg) translateY(-4px)`;
  });

  card.addEventListener("mouseleave", () => {
    card.style.transform = "";
  });
});

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Request failed.");
    error.details = payload.details || [];
    throw error;
  }

  return payload;
}

function buildErrorMessage(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  if (Array.isArray(error.details) && error.details.length) {
    return error.details.join(" ");
  }

  return error.message || fallbackMessage;
}

// Reviews
let userRating = 0;
const reviewsGrid = document.querySelector(".reviews-grid");

const submitHTML = `
  <div class="review-submit-block" id="reviewSubmitBlock">
    <p class="eyebrow" style="margin-bottom:10px">Leave a Review</p>
    <div class="star-picker" id="starPicker">
      <span data-v="1">&#9733;</span><span data-v="2">&#9733;</span><span data-v="3">&#9733;</span><span data-v="4">&#9733;</span><span data-v="5">&#9733;</span>
    </div>
    <input type="text" id="rvName" placeholder="Your name" maxlength="40">
    <input type="text" id="rvRole" placeholder="Your role / company" maxlength="50">
    <textarea id="rvMsg" placeholder="Write your review..." rows="3" maxlength="280"></textarea>
    <button class="btn btn-primary" id="submitReview">Post Review</button>
    <p class="form-success hidden" id="rvFeedback"></p>
  </div>`;

reviewsGrid.insertAdjacentHTML("beforeend", sanitizeHTML(submitHTML));

document.querySelectorAll("#starPicker span").forEach((star) => {
  star.addEventListener("click", () => {
    userRating = Number(star.dataset.v);
    document.querySelectorAll("#starPicker span").forEach((item, index) => {
      item.style.color = index < userRating ? "#f5b944" : "rgba(255,255,255,0.2)";
    });
  });

  star.addEventListener("mouseover", () => {
    document.querySelectorAll("#starPicker span").forEach((item, index) => {
      item.style.color = index < Number(star.dataset.v) ? "#f5b944" : "rgba(255,255,255,0.2)";
    });
  });
});

document.getElementById("starPicker").addEventListener("mouseleave", () => {
  document.querySelectorAll("#starPicker span").forEach((item, index) => {
    item.style.color = index < userRating ? "#f5b944" : "rgba(255,255,255,0.2)";
  });
});

function renderUserReview(review) {
  const initials = review.name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const stars = "★".repeat(review.rating) + "☆".repeat(5 - review.rating);
  const colors = ["#ff6b3d", "#4fd1c5", "#a78bfa", "#f59e0b", "#34d399"];
  const background = colors[review.name.charCodeAt(0) % colors.length];

  const card = document.createElement("article");
  card.className = "review-card user-review-card";
  card.style.animation = "reviewPop 0.5s cubic-bezier(0.34,1.56,0.64,1) both";

  const header = document.createElement("div");
  header.className = "review-header";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.background = background;
  avatar.style.color = "#fff";
  avatar.textContent = initials;

  const meta = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = review.name;
  const role = document.createElement("p");
  role.textContent = review.role || "AutomateX Client";
  meta.appendChild(name);
  meta.appendChild(role);

  const starBlock = document.createElement("div");
  starBlock.className = "review-stars";
  starBlock.style.color = "#f5b944";
  // textContent prevents user data from turning into executable markup.
  starBlock.textContent = stars;

  header.appendChild(avatar);
  header.appendChild(meta);
  header.appendChild(starBlock);

  const quote = document.createElement("blockquote");
  quote.textContent = `"${review.text}"`;

  const tag = document.createElement("div");
  tag.className = "review-tag";
  tag.style.display = "flex";
  tag.style.alignItems = "center";
  tag.style.gap = "6px";

  const dot = document.createElement("span");
  dot.style.width = "6px";
  dot.style.height = "6px";
  dot.style.borderRadius = "50%";
  dot.style.background = "#4fd1c5";
  dot.style.display = "inline-block";

  const tagText = document.createElement("span");
  tagText.textContent = `Verified Review • ${new Date(review.createdAt || review.ts).toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  )}`;

  tag.appendChild(dot);
  tag.appendChild(tagText);

  card.appendChild(header);
  card.appendChild(quote);
  card.appendChild(tag);

  return card;
}

function refreshUserReviews(reviews) {
  document.querySelectorAll(".user-review-card").forEach((card) => card.remove());
  const submitBlock = document.getElementById("reviewSubmitBlock");
  reviews.forEach((review) => {
    const card = renderUserReview(review);
    reviewsGrid.insertBefore(card, submitBlock);
  });
}

async function loadReviewsFromServer() {
  try {
    const payload = await apiRequest("/reviews/public");
    refreshUserReviews(payload.reviews || []);
  } catch (_error) {
    document.getElementById("rvFeedback").textContent = "Live reviews could not be loaded right now.";
    document.getElementById("rvFeedback").classList.remove("hidden");
    document.getElementById("rvFeedback").classList.add("is-error");
  }
}

loadReviewsFromServer();

document.getElementById("submitReview").addEventListener("click", async () => {
  const name = document.getElementById("rvName").value.trim();
  const role = document.getElementById("rvRole").value.trim();
  const text = document.getElementById("rvMsg").value.trim();
  const submitReviewButton = document.getElementById("submitReview");
  const reviewFeedback = document.getElementById("rvFeedback");

  if (!name || !text || userRating === 0) {
    reviewFeedback.textContent = "Please fill in your name, review, and select a star rating.";
    reviewFeedback.classList.remove("hidden");
    reviewFeedback.classList.add("is-error");
    return;
  }

  submitReviewButton.textContent = "Posting...";
  submitReviewButton.disabled = true;
  reviewFeedback.textContent = "";
  reviewFeedback.classList.add("hidden");
  reviewFeedback.classList.remove("is-error");

  try {
    await apiRequest("/reviews/public", {
      method: "POST",
      body: JSON.stringify({
        name,
        role,
        text,
        rating: userRating
      })
    });

    document.getElementById("rvName").value = "";
    document.getElementById("rvRole").value = "";
    document.getElementById("rvMsg").value = "";
    userRating = 0;
    document
      .querySelectorAll("#starPicker span")
      .forEach((item) => (item.style.color = "rgba(255,255,255,0.2)"));

    reviewFeedback.textContent = "Review submitted successfully and is awaiting moderation.";
    reviewFeedback.classList.remove("hidden");
    reviewFeedback.classList.remove("is-error");
    await loadReviewsFromServer();
  } catch (error) {
    reviewFeedback.textContent = buildErrorMessage(
      error,
      "Unable to post your review right now."
    );
    reviewFeedback.classList.remove("hidden");
    reviewFeedback.classList.add("is-error");
  } finally {
    submitReviewButton.textContent = "Post Review";
    submitReviewButton.disabled = false;
  }
});

// Contact form
document.getElementById("contactForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("cfSubmit");
  const feedback = document.getElementById("cfSuccess");
  const name = document.getElementById("cfName").value.trim();
  const email = document.getElementById("cfEmail").value.trim();
  const message = document.getElementById("cfMessage").value.trim();

  button.textContent = "Sending...";
  button.disabled = true;
  feedback.classList.add("hidden");
  feedback.classList.remove("is-error");

  try {
    await apiRequest("/inquiries", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        message
      })
    });

    feedback.textContent = "Message sent! We will be in touch within 24 hours.";
    feedback.classList.remove("hidden");
    document.getElementById("cfName").value = "";
    document.getElementById("cfEmail").value = "";
    document.getElementById("cfMessage").value = "";
  } catch (error) {
    feedback.textContent = buildErrorMessage(
      error,
      "Unable to send your inquiry right now."
    );
    feedback.classList.remove("hidden");
    feedback.classList.add("is-error");
  } finally {
    button.textContent = "Send Project Inquiry";
    button.disabled = false;
  }
});

// Booking system
let calendarDate = new Date();
let selectedDate = null;
let selectedTime = null;
let bookedSlots = {};

const TIMES = [
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "14:00",
  "14:30",
  "15:00",
  "15:30",
  "16:00",
  "16:30"
];

const bookingFeedback = document.getElementById("bookingFeedback");
const confirmBookingButton = document.getElementById("confirmBooking");

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMonthKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function setBookingFeedback(message, type = "info") {
  bookingFeedback.textContent = message;
  bookingFeedback.classList.remove("hidden", "is-success", "is-error", "is-warning");
  bookingFeedback.classList.add(`is-${type}`);
}

function clearBookingFeedback() {
  bookingFeedback.textContent = "";
  bookingFeedback.classList.add("hidden");
  bookingFeedback.classList.remove("is-success", "is-error", "is-warning");
}

async function fetchAvailability() {
  const month = formatMonthKey(calendarDate);

  try {
    const data = await apiRequest(`/bookings/public/availability?month=${month}`);
    bookedSlots = (data.bookedSlots || []).reduce((accumulator, slotKey) => {
      accumulator[slotKey] = true;
      return accumulator;
    }, {});
  } catch (_error) {
    bookedSlots = {};
  }
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  document.getElementById("calMonthLabel").textContent = calendarDate.toLocaleDateString(
    "en-GB",
    { month: "long", year: "numeric" }
  );

  const grid = document.getElementById("calGrid");
  grid.innerHTML = sanitizeHTML(
    "<span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>"
  );

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let index = 0; index < firstDay; index += 1) {
    grid.appendChild(Object.assign(document.createElement("span"), { className: "cal-empty" }));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const button = document.createElement("button");
    button.className = "cal-day";
    button.textContent = day;

    const date = new Date(year, month, day);
    date.setHours(0, 0, 0, 0);

    if (date < today || date.getDay() === 0 || date.getDay() === 6) {
      button.disabled = true;
      button.classList.add("cal-disabled");
    } else {
      button.addEventListener("click", () => {
        selectedDate = new Date(year, month, day);
        document.getElementById("selectedDateLabel").textContent = selectedDate.toLocaleDateString(
          "en-GB",
          { weekday: "long", day: "numeric", month: "long" }
        );
        clearBookingFeedback();
        showStep("step-time");
        renderTimes();
      });
    }

    grid.appendChild(button);
  }
}

function renderTimes() {
  const dateKey = formatDateKey(selectedDate);
  const slots = document.getElementById("timeSlots");
  slots.textContent = "";

  TIMES.forEach((time) => {
    const slotKey = `${dateKey}_${time}`;
    const button = document.createElement("button");
    button.className = "time-slot";
    button.textContent = time;

    if (bookedSlots[slotKey]) {
      button.disabled = true;
      button.classList.add("slot-taken");
      button.textContent = `${time} (Taken)`;
    } else {
      button.addEventListener("click", () => {
        selectedTime = time;
        document.getElementById("bookingSummary").textContent = `${selectedDate.toLocaleDateString(
          "en-GB",
          { weekday: "short", day: "numeric", month: "short" }
        )} at ${time}`;
        clearBookingFeedback();
        showStep("step-form");
      });
    }

    slots.appendChild(button);
  });
}

function showStep(stepId) {
  document.querySelectorAll(".booking-step").forEach((step) => step.classList.add("hidden"));
  document.getElementById(stepId).classList.remove("hidden");
}

async function changeMonth(offset) {
  calendarDate.setMonth(calendarDate.getMonth() + offset);
  await fetchAvailability();
  renderCalendar();
}

document.getElementById("prevMonth").addEventListener("click", () => {
  changeMonth(-1);
});

document.getElementById("nextMonth").addEventListener("click", () => {
  changeMonth(1);
});

document.getElementById("backToDate").addEventListener("click", () => {
  clearBookingFeedback();
  showStep("step-date");
});

document.getElementById("backToTime").addEventListener("click", () => {
  clearBookingFeedback();
  showStep("step-time");
});

confirmBookingButton.addEventListener("click", async () => {
  const name = document.getElementById("bkName").value.trim();
  const email = document.getElementById("bkEmail").value.trim();
  const phone = document.getElementById("bkPhone").value.trim();
  const service = document.getElementById("bkService").value.trim();

  if (!selectedDate || !selectedTime) {
    setBookingFeedback("Please choose a date and time before confirming.", "error");
    return;
  }

  if (!name || !email) {
    setBookingFeedback("Please fill in your name and email.", "error");
    return;
  }

  const bookingDate = formatDateKey(selectedDate);
  confirmBookingButton.textContent = "Saving booking...";
  confirmBookingButton.disabled = true;
  setBookingFeedback("Sending your booking to the server...", "warning");

  try {
    const payload = await apiRequest("/bookings/public", {
      method: "POST",
      body: JSON.stringify({
        name,
        email,
        phone,
        service,
        date: bookingDate,
        time: selectedTime
      })
    });

    bookedSlots[`${bookingDate}_${selectedTime}`] = true;
    document.getElementById("successMsg").textContent = `${payload.booking.name}, your call is booked for ${selectedDate.toLocaleDateString(
      "en-GB",
      { weekday: "long", day: "numeric", month: "long" }
    )} at ${selectedTime}. A confirmation has been sent back from the server.`;
    document.getElementById("bkName").value = "";
    document.getElementById("bkEmail").value = "";
    document.getElementById("bkPhone").value = "";
    document.getElementById("bkService").value = "";
    clearBookingFeedback();
    showStep("step-success");
  } catch (error) {
    const message = buildErrorMessage(
      error,
      "The booking server could not be reached. Start the Express server and try again."
    );
    setBookingFeedback(message, "error");

    if (message.toLowerCase().includes("already booked")) {
      await fetchAvailability();
      showStep("step-time");
      renderTimes();
    }
  } finally {
    confirmBookingButton.textContent = "Confirm Booking";
    confirmBookingButton.disabled = false;
  }
});

const chatBox = document.getElementById("chatBox");
const chatMessages = document.getElementById("chatMessages");
const chatToggle = document.getElementById("chatToggle");
const chatBadge = document.getElementById("chatBadge");
const chatInput = document.getElementById("chatInput");
const chatSend = document.getElementById("chatSend");
const chatMic = document.getElementById("chatMic");
const chatVoiceStatus = document.getElementById("chatVoiceStatus");
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceRecognitionLanguages = {
  en: "en-US",
  si: "si-LK",
  ta: "ta-LK"
};
let chatOpen = false;
let badgeDismissed = false;
let conversationHistory = [];
let typingIndicatorNode = null;
let voiceRecognition = null;
let voiceListening = false;
let voiceTranscript = "";
let voiceShouldSend = false;
let voiceCancelled = false;

function getChatAuthToken() {
  return (
    localStorage.getItem("automatex_client_token") ||
    localStorage.getItem("automatex_token") ||
    localStorage.getItem("automatex_admin_token") ||
    ""
  );
}

function addMessage(text, from = "bot", link = null, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-msg chat-msg-${from}`;
  if (options.variant) {
    wrapper.classList.add(`chat-msg-${options.variant}`);
  }

  if (link) {
    const anchor = document.createElement("a");
    anchor.href = link;
    anchor.target = "_blank";
    anchor.textContent = text;
    anchor.className = "chat-link";
    wrapper.appendChild(anchor);
  } else {
    wrapper.textContent = text;
  }

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addTypingIndicator() {
  removeTypingIndicator();
  const wrapper = document.createElement("div");
  wrapper.className = "chat-msg chat-msg-bot";
  wrapper.textContent = "Typing...";
  typingIndicatorNode = wrapper;
  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeTypingIndicator() {
  if (typingIndicatorNode && typingIndicatorNode.parentNode) {
    typingIndicatorNode.parentNode.removeChild(typingIndicatorNode);
  }
  typingIndicatorNode = null;
}

function setVoiceStatus(message = "", type = "info") {
  chatVoiceStatus.textContent = message;
  chatVoiceStatus.dataset.type = type;
  chatVoiceStatus.classList.toggle("hidden", !message);
}

function setMicListeningState(isListening) {
  voiceListening = isListening;
  chatMic.classList.toggle("is-listening", isListening);
  chatMic.setAttribute("aria-label", isListening ? "Cancel voice chat" : "Start voice chat");
  chatMic.title = isListening ? "Cancel voice chat" : "Start voice chat";
}

function stopVoiceRecognition({ send = false, cancelled = false } = {}) {
  if (!voiceRecognition || !voiceListening) {
    return;
  }

  voiceShouldSend = send;
  voiceCancelled = cancelled;
  voiceRecognition.stop();
}

function handleVoiceUnsupported() {
  chatMic.classList.add("is-unsupported");
  chatMic.setAttribute("aria-disabled", "true");
  chatMic.title = "Voice chat is not supported in this browser.";
  setVoiceStatus("Voice chat is not supported in this browser. Please type your message.", "error");
}

function createVoiceRecognition() {
  if (!SpeechRecognition) {
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = voiceRecognitionLanguages.en;
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    voiceTranscript = "";
    voiceShouldSend = false;
    voiceCancelled = false;
    setMicListeningState(true);
    setVoiceStatus("Listening...", "listening");
  };

  recognition.onresult = (event) => {
    let interimTranscript = "";
    let finalTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) {
        finalTranscript += `${transcript} `;
      } else {
        interimTranscript += `${transcript} `;
      }
    }

    voiceTranscript = `${voiceTranscript} ${finalTranscript}`.trim();
    const visibleTranscript = (voiceTranscript || interimTranscript).trim();
    if (visibleTranscript) {
      chatInput.value = visibleTranscript;
    }

    if (finalTranscript.trim()) {
      voiceShouldSend = true;
    }
  };

  recognition.onerror = (event) => {
    voiceShouldSend = false;
    voiceCancelled = true;

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      setVoiceStatus("Microphone access was blocked. Please allow microphone access to use voice chat.", "error");
      return;
    }

    if (event.error === "no-speech") {
      setVoiceStatus("No speech detected. Please try again.", "error");
      return;
    }

    setVoiceStatus("Voice chat could not start. Please type your message.", "error");
  };

  recognition.onend = () => {
    const shouldSend = voiceShouldSend && !voiceCancelled && chatInput.value.trim();
    setMicListeningState(false);

    if (shouldSend) {
      setVoiceStatus("", "info");
      sendChat();
      return;
    }

    if (voiceCancelled && !chatVoiceStatus.textContent) {
      setVoiceStatus("", "info");
    }
  };

  return recognition;
}

function startVoiceRecognition() {
  if (!SpeechRecognition) {
    handleVoiceUnsupported();
    return;
  }

  if (voiceListening) {
    stopVoiceRecognition({ cancelled: true });
    setVoiceStatus("", "info");
    return;
  }

  if (chatInput.disabled || chatSend.disabled) {
    return;
  }

  voiceRecognition = createVoiceRecognition();

  try {
    voiceRecognition.start();
  } catch {
    setMicListeningState(false);
    setVoiceStatus("Voice chat could not start. Please type your message.", "error");
  }
}

const recommendationCatalog = {
  starter: {
    name: "AutomateX Starter Solution",
    price: "LKR 25,000 launch offer",
    summary: "Best for small businesses that need a simple professional online presence.",
    features: [
      "Business website with up to 5 pages",
      "Mobile responsive design",
      "WhatsApp integration",
      "Basic SEO and Google Maps setup",
      "Contact form"
    ]
  },
  standard: {
    name: "AutomateX Standard Solution",
    price: "LKR 55,000 limited-time pricing",
    summary: "Best for growing businesses that need website, lead capture, WhatsApp, and operational tracking.",
    features: [
      "Everything in Starter",
      "Lead capture and inquiry flow",
      "WhatsApp contact path",
      "Basic CRM and sales dashboard",
      "Booking, invoice, or admin tracking setup"
    ]
  },
  pro: {
    name: "AutomateX Pro Solution",
    price: "LKR 120,000+ depending on scope",
    summary: "Best for businesses that need advanced automation, AI chatbot, dashboards, and custom workflows.",
    features: [
      "Everything in Standard",
      "AI chatbot for web and WhatsApp",
      "Advanced analytics dashboard",
      "Automation workflow stack",
      "Custom integrations and multi-user support"
    ]
  },
  posStarter: {
    name: "AutomateX POS Starter",
    price: "Starting price depends on your requirements.",
    summary: "Best for retail shops that need simple billing and daily sales control.",
    features: [
      "Billing workflow",
      "Product and price setup",
      "Daily sales summary",
      "Basic inventory view",
      "Upgrade path to barcode and dashboard features"
    ]
  },
  posStandard: {
    name: "AutomateX POS Standard",
    price: "Starting price depends on your requirements.",
    summary: "Best for retail shops that need billing, barcode, inventory, and sales tracking.",
    features: [
      "POS system with billing and barcode",
      "Inventory management",
      "Sales dashboard",
      "Invoice support",
      "Basic CRM or customer tracking"
    ]
  },
  hotelBooking: {
    name: "AutomateX Hotel Website + Booking System",
    price: "Starting price depends on your requirements.",
    summary: "Best for hotels, villas, and stays that need booking inquiries and room/service presentation.",
    features: [
      "Hotel or villa website",
      "Room and service sections",
      "Booking inquiry flow",
      "WhatsApp contact button",
      "Admin inquiry tracking can be added later"
    ]
  },
  ecommerce: {
    name: "AutomateX Ecommerce Website",
    price: "Starting price depends on your catalog, payment, and delivery needs.",
    summary: "Best for businesses that sell products online.",
    features: [
      "Product catalog",
      "Order inquiry or checkout flow",
      "WhatsApp sales support",
      "Mobile-first shopping experience",
      "Admin order/product management can be scoped"
    ]
  },
  whatsapp: {
    name: "AutomateX WhatsApp Automation",
    price: "From LKR 45,000",
    summary: "Best for businesses that need faster replies, lead triage, and follow-up prompts.",
    features: [
      "Auto replies",
      "Lead triage questions",
      "Follow-up prompts",
      "Team routing",
      "Website inquiry connection can be added"
    ]
  },
  aiAssistant: {
    name: "AutomateX AI Assistant Setup",
    price: "From LKR 95,000",
    summary: "Best for businesses that want a customer support assistant or FAQ bot tuned to their services.",
    features: [
      "Business-specific FAQ assistant",
      "Customer support chat flow",
      "Lead qualification prompts",
      "Website chatbot setup",
      "WhatsApp AI can be scoped if needed"
    ]
  },
  uiRefresh: {
    name: "AutomateX Brand-Focused UI Refresh",
    price: "Starting price depends on your current website.",
    summary: "Best for businesses with an existing website that needs a more premium, trustworthy look.",
    features: [
      "Modern visual refresh",
      "Clearer service presentation",
      "Better call-to-action flow",
      "Mobile polish",
      "Trust-focused page improvements"
    ]
  },
  launchSupport: {
    name: "AutomateX Launch Support",
    price: "Starting price depends on launch scope.",
    summary: "Best for businesses preparing a new digital launch or campaign.",
    features: [
      "Launch planning",
      "Landing page support",
      "Lead capture setup",
      "WhatsApp inquiry path",
      "Post-launch improvement checklist"
    ]
  }
};

let recommendationState = {
  active: false,
  answers: {},
  lastRecommendationKey: null
};

function normalizeRecommendationText(text) {
  return String(text || "").toLowerCase().replace(/[^\w\s+-]/g, " ");
}

function textHasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectRecommendationIntent(rawText) {
  const text = normalizeRecommendationText(rawText);
  return textHasAny(text, [
    "recommend",
    "package",
    "what is good",
    "what is best",
    "good for me",
    "need a website",
    "need website",
    "want a website",
    "want website",
    "build a website",
    "business software",
    "improve my business",
    "retail",
    "shop",
    "store",
    "supermarket",
    "grocery",
    "pos",
    "billing",
    "inventory",
    "hotel",
    "booking system",
    "ecommerce",
    "online store",
    "sell products",
    "whatsapp automation",
    "ai chatbot",
    "admin dashboard",
    "crm"
  ]);
}

function detectRecommendationCommand(rawText) {
  const text = normalizeRecommendationText(rawText);
  if (textHasAny(text, ["compare", "comparison", "difference"])) {
    return "compare";
  }
  if (textHasAny(text, ["cheaper", "low budget", "less expensive", "starter option"])) {
    return "cheaper";
  }
  if (textHasAny(text, ["advanced", "upgrade", "more powerful", "pro option"])) {
    return "advanced";
  }
  if (textHasAny(text, ["included", "include", "features", "what do i get", "what is inside"])) {
    return "included";
  }
  return "";
}

function updateRecommendationAnswers(rawText) {
  const text = normalizeRecommendationText(rawText);
  const answers = recommendationState.answers;

  if (textHasAny(text, ["hotel", "villa", "guest house", "resort", "room"])) {
    answers.businessType = "hotel";
  } else if (textHasAny(text, ["retail", "shop", "store", "supermarket", "grocery", "pharmacy"])) {
    answers.businessType = "retail";
  } else if (textHasAny(text, ["restaurant", "cafe", "food"])) {
    answers.businessType = "restaurant";
  } else if (textHasAny(text, ["salon", "clinic", "agency", "consultant", "service business"])) {
    answers.businessType = "service";
  }

  answers.goals = answers.goals || [];
  const goalMap = [
    { key: "website", words: ["website", "site", "online presence", "landing page"] },
    { key: "leads", words: ["lead", "inquiry", "enquiry", "contact form", "customer inquiries"] },
    { key: "booking", words: ["booking", "appointment", "reservation", "room"] },
    { key: "sales", words: ["sales", "orders", "sell", "products", "ecommerce", "online store"] },
    { key: "automation", words: ["automation", "automate", "workflow", "follow up"] },
    { key: "support", words: ["support", "faq", "customer service"] },
    { key: "pos", words: ["pos", "billing", "barcode", "inventory", "invoice"] },
    { key: "chatbot", words: ["ai chatbot", "chatbot", "ai assistant", "bot"] },
    { key: "whatsapp", words: ["whatsapp", "messaging"] },
    { key: "dashboard", words: ["dashboard", "admin", "crm", "tracking"] },
    { key: "uiRefresh", words: ["redesign", "refresh", "improve my website", "modernize", "make it premium"] },
    { key: "launch", words: ["launch", "campaign", "go live"] }
  ];

  goalMap.forEach((goal) => {
    if (textHasAny(text, goal.words) && !answers.goals.includes(goal.key)) {
      answers.goals.push(goal.key);
    }
  });

  if (textHasAny(text, ["yes whatsapp", "need whatsapp", "with whatsapp", "whatsapp integration"])) {
    answers.needsWhatsApp = true;
  } else if (textHasAny(text, ["no whatsapp", "without whatsapp"])) {
    answers.needsWhatsApp = false;
  }

  if (textHasAny(text, ["admin", "dashboard", "crm", "track", "tracking", "manage leads", "inquiry tracking"])) {
    answers.needsDashboard = true;
  } else if (textHasAny(text, ["no dashboard", "without dashboard"])) {
    answers.needsDashboard = false;
  }

  if (textHasAny(text, ["low budget", "cheap", "cheaper", "small budget", "basic", "starter", "simple"])) {
    answers.budget = "low";
  } else if (textHasAny(text, ["mid", "standard", "growing", "medium"])) {
    answers.budget = "mid";
  } else if (textHasAny(text, ["advanced", "pro", "large", "high budget", "scale"])) {
    answers.budget = "advanced";
  }
}

function countRecommendationSignals() {
  const answers = recommendationState.answers;
  let count = 0;
  if (answers.businessType) count += 1;
  if (answers.goals && answers.goals.length) count += 1;
  if (typeof answers.needsWhatsApp === "boolean") count += 1;
  if (typeof answers.needsDashboard === "boolean") count += 1;
  if (answers.budget) count += 1;
  return count;
}

function buildRecommendationQuestions() {
  const answers = recommendationState.answers;
  const questions = [];

  if (!answers.businessType) {
    questions.push("What type of business do you have?");
  }
  if (!answers.goals || !answers.goals.length) {
    questions.push("What is your main goal: website, leads, booking, sales, automation, or support?");
  }
  if (typeof answers.needsWhatsApp !== "boolean") {
    questions.push("Do you need WhatsApp integration?");
  }
  if (typeof answers.needsDashboard !== "boolean" && questions.length < 4) {
    questions.push("Do you need an admin dashboard or inquiry tracking?");
  }
  if (!answers.budget && questions.length < 4) {
    questions.push("What is your approximate budget range: low, mid-range, or advanced?");
  }

  return `I can recommend the best AutomateX package. To guide you properly, please answer these:\n\n${questions
    .slice(0, 4)
    .map((question, index) => `${index + 1}. ${question}`)
    .join("\n")}`;
}

function hasEnoughRecommendationInfo() {
  const { answers } = recommendationState;
  const goals = answers.goals || [];

  if (answers.businessType === "hotel" && (goals.includes("booking") || goals.includes("website"))) {
    return true;
  }
  if (answers.businessType === "retail" && goals.includes("pos")) {
    return true;
  }
  if (goals.includes("sales")) {
    return true;
  }
  if (goals.includes("whatsapp") || goals.includes("chatbot") || goals.includes("uiRefresh") || goals.includes("launch")) {
    return countRecommendationSignals() >= 2;
  }
  if (goals.includes("website")) {
    return countRecommendationSignals() >= 2;
  }

  return countRecommendationSignals() >= 3;
}

function selectRecommendationKey() {
  const { answers } = recommendationState;
  const goals = answers.goals || [];
  const isLowBudget = answers.budget === "low";

  if (answers.businessType === "retail" && goals.includes("pos")) {
    return isLowBudget ? "posStarter" : "posStandard";
  }
  if (answers.businessType === "hotel" && (goals.includes("booking") || goals.includes("website") || goals.includes("leads"))) {
    return "hotelBooking";
  }
  if (goals.includes("sales")) {
    return "ecommerce";
  }
  if (goals.includes("chatbot") && (goals.includes("automation") || goals.includes("dashboard") || answers.needsDashboard)) {
    return "pro";
  }
  if (goals.includes("chatbot")) {
    return "aiAssistant";
  }
  if (goals.includes("whatsapp") && !goals.includes("website")) {
    return "whatsapp";
  }
  if (goals.includes("uiRefresh")) {
    return "uiRefresh";
  }
  if (goals.includes("launch")) {
    return "launchSupport";
  }
  if (goals.includes("automation") || goals.includes("dashboard") || answers.needsDashboard) {
    return answers.budget === "advanced" ? "pro" : "standard";
  }
  if (goals.includes("website") && (answers.needsWhatsApp || goals.includes("leads"))) {
    return isLowBudget ? "starter" : "standard";
  }
  if (goals.includes("website")) {
    return isLowBudget ? "starter" : "standard";
  }

  return isLowBudget ? "starter" : "standard";
}

function buildRecommendationReply(packageKey) {
  const selectedPackage = recommendationCatalog[packageKey];
  const { answers } = recommendationState;
  const goals = answers.goals || [];
  const why = [];

  if (answers.businessType) {
    why.push(`You run a ${answers.businessType} business`);
  }
  if (goals.includes("website")) {
    why.push("You need a professional online presence");
  }
  if (goals.includes("leads")) {
    why.push("You need customer inquiries from your website");
  }
  if (goals.includes("booking")) {
    why.push("A booking or inquiry flow will reduce manual follow-up");
  }
  if (goals.includes("pos")) {
    why.push("Billing, inventory, and sales tracking are core operational needs");
  }
  if (goals.includes("chatbot")) {
    why.push("An AI assistant can answer customer questions faster");
  }
  if (goals.includes("automation")) {
    why.push("Automation can reduce repetitive daily work");
  }
  if (answers.needsWhatsApp || goals.includes("whatsapp")) {
    why.push("WhatsApp contact can help convert visitors faster");
  }
  if (answers.needsDashboard || goals.includes("dashboard")) {
    why.push("Admin tracking can help manage leads and operations");
  }
  if (!why.length) {
    why.push(selectedPackage.summary);
  }

  recommendationState.lastRecommendationKey = packageKey;

  return `Recommended Solution:\n${selectedPackage.name}\n\nWhy this fits you:\n${why
    .slice(0, 4)
    .map((item) => `- ${item}`)
    .join("\n")}\n\nSuggested Features:\n${selectedPackage.features
    .slice(0, 5)
    .map((feature) => `- ${feature}`)
    .join("\n")}\n\nInvestment Note:\n${selectedPackage.price}\n\nNext Step:\nPlease share your name, business type, WhatsApp number, and a short requirement summary so the AutomateX team can contact you.`;
}

function buildIncludedReply(packageKey) {
  const selectedPackage = recommendationCatalog[packageKey || recommendationState.lastRecommendationKey || "standard"];
  return `${selectedPackage.name} includes:\n\n${selectedPackage.features.map((feature) => `- ${feature}`).join("\n")}\n\nInvestment Note:\n${selectedPackage.price}`;
}

function buildComparisonReply() {
  return `Quick Package Comparison:\n\nStarter Solution:\n- Best for a simple professional website\n- Includes responsive website, WhatsApp integration, SEO basics, Google Maps, and contact form\n\nStandard Solution:\n- Best for website + lead capture + WhatsApp + admin-style tracking\n- Includes stronger inquiry flow, basic CRM, sales dashboard, booking/invoice options, and 3 months support\n\nPro Solution:\n- Best for advanced automation, AI chatbot, dashboards, and custom systems\n- Includes AI chatbot, analytics dashboard, workflow automation, integrations, and multi-user support\n\nI recommend starting with one best-fit option first, then upgrading only if your workflow needs it.`;
}

function buildAdjacentRecommendation(direction) {
  const currentKey = recommendationState.lastRecommendationKey || selectRecommendationKey();
  const cheaperMap = {
    pro: "standard",
    standard: "starter",
    starter: "starter",
    posStandard: "posStarter",
    posStarter: "starter",
    aiAssistant: "starter",
    whatsapp: "starter",
    hotelBooking: "starter",
    ecommerce: "starter",
    uiRefresh: "starter",
    launchSupport: "starter"
  };
  const advancedMap = {
    starter: "standard",
    standard: "pro",
    pro: "pro",
    posStarter: "posStandard",
    posStandard: "pro",
    aiAssistant: "pro",
    whatsapp: "pro",
    hotelBooking: "pro",
    ecommerce: "pro",
    uiRefresh: "standard",
    launchSupport: "standard"
  };
  const nextKey = direction === "cheaper" ? cheaperMap[currentKey] : advancedMap[currentKey];
  return buildRecommendationReply(nextKey || currentKey);
}

function handlePackageRecommendation(rawText) {
  const command = detectRecommendationCommand(rawText);
  if (command === "compare") {
    recommendationState.active = true;
    return { text: buildComparisonReply(), variant: "recommendation" };
  }
  if (command === "included" && recommendationState.lastRecommendationKey) {
    return { text: buildIncludedReply(), variant: "recommendation" };
  }
  if (command === "cheaper" && recommendationState.lastRecommendationKey) {
    return { text: buildAdjacentRecommendation("cheaper"), variant: "recommendation" };
  }
  if (command === "advanced" && recommendationState.lastRecommendationKey) {
    return { text: buildAdjacentRecommendation("advanced"), variant: "recommendation" };
  }

  if (!recommendationState.active && !detectRecommendationIntent(rawText)) {
    return null;
  }

  recommendationState.active = true;
  updateRecommendationAnswers(rawText);

  if (!hasEnoughRecommendationInfo()) {
    return { text: buildRecommendationQuestions(), variant: "recommendation" };
  }

  return {
    text: buildRecommendationReply(selectRecommendationKey()),
    variant: "recommendation"
  };
}

function pushConversationEntry(role, content) {
  conversationHistory.push({ role, content });
  conversationHistory = conversationHistory.slice(-10);
}

async function requestChatReply(message, historySnapshot) {
  const payload = await apiRequest("/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      conversationHistory: historySnapshot
    })
  });

  return payload.reply;
}

chatToggle.addEventListener("click", () => {
  chatOpen = !chatOpen;
  chatBox.classList.toggle("hidden", !chatOpen);
  document.querySelector(".chat-icon-open").classList.toggle("hidden", chatOpen);
  document.querySelector(".chat-icon-close").classList.toggle("hidden", !chatOpen);

  if (!badgeDismissed) {
    chatBadge.style.display = "none";
    badgeDismissed = true;
  }

  if (chatOpen && chatMessages.children.length === 0) {
    setTimeout(() => {
      if (!getChatAuthToken()) {
        addMessage("Hi! I can help recommend the right AutomateX package. Tell me what you want to build, or use WhatsApp for the fastest direct reply.");
        return;
      }

      addMessage("Hi! Ask me anything and I'll do my best to help.");
    }, 300);
  }
});

async function sendChat() {
  const value = chatInput.value.trim();
  if (!value) {
    return;
  }

  chatInput.value = "";
  addMessage(value, "user");

  const recommendationReply = handlePackageRecommendation(value);
  if (recommendationReply) {
    pushConversationEntry("user", value);
    addMessage(recommendationReply.text, "bot", null, { variant: recommendationReply.variant });
    pushConversationEntry("assistant", recommendationReply.text);
    return;
  }

  const historySnapshot = conversationHistory.slice(-10);
  addTypingIndicator();

  try {
    const reply = await requestChatReply(value, historySnapshot);
    removeTypingIndicator();
    pushConversationEntry("user", value);
    addMessage(reply, "bot");
    pushConversationEntry("assistant", reply);
  } catch (_error) {
    removeTypingIndicator();
    pushConversationEntry("user", value);
    const fallback = "Thanks for your message. I can still help you with AutomateX services. Please tell me your business type, what you need - website, system, automation, or chatbot - and your WhatsApp number so our team can guide you.";
    addMessage(fallback, "bot", "https://wa.me/94711861722");
    pushConversationEntry("assistant", fallback);
  }
}

chatSend.addEventListener("click", () => {
  sendChat();
});
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    stopVoiceRecognition({ cancelled: true });
    sendChat();
  }
});
chatMic.addEventListener("click", () => {
  startVoiceRecognition();
});

if (!SpeechRecognition) {
  chatMic.classList.add("is-unsupported");
  chatMic.setAttribute("aria-disabled", "true");
  chatMic.title = "Voice chat is not supported in this browser.";
}

setTimeout(() => {
  if (!chatOpen) {
    chatBadge.style.display = "flex";
  }
}, 4000);

(async function initBooking() {
  await fetchAvailability();
  renderCalendar();
})();

const API_BASE = "/api";

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

reviewsGrid.insertAdjacentHTML("beforeend", submitHTML);

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
  card.innerHTML = `
    <div class="review-header">
      <div class="avatar" style="background:${background};color:#fff">${initials}</div>
      <div><strong>${review.name}</strong><p>${review.role || "AutomateX Client"}</p></div>
      <div class="review-stars" style="color:#f5b944">${stars}</div>
    </div>
    <blockquote>"${review.text}"</blockquote>
    <div class="review-tag" style="display:flex;align-items:center;gap:6px">
      <span style="width:6px;height:6px;border-radius:50%;background:#4fd1c5;display:inline-block"></span>
      Verified Review &bull; ${new Date(review.createdAt || review.ts).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric"
      })}
    </div>`;
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
    const payload = await apiRequest("/reviews");
    refreshUserReviews(payload.reviews || []);
  } catch (error) {
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
    await apiRequest("/reviews", {
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

    reviewFeedback.textContent = "Review posted successfully.";
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
    const data = await apiRequest(`/bookings/availability?month=${month}`);
    bookedSlots = (data.bookedSlots || []).reduce((accumulator, slotKey) => {
      accumulator[slotKey] = true;
      return accumulator;
    }, {});
  } catch (error) {
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
  grid.innerHTML = "<span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>";

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
  slots.innerHTML = "";

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
    const payload = await apiRequest("/bookings", {
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

// Chatbot
const FLOWS = {
  start: {
    msg: "Hi! Welcome to AutomateX. What service do you need?",
    opts: [
      "Website Development",
      "Business Automation",
      "AI Chatbot",
      "WhatsApp Flows",
      "Book a Call",
      "Talk to a human"
    ]
  },
  "Website Development": {
    msg: "Great choice! We build high-converting websites tailored to your brand. Typical delivery is 3–5 days. What's your budget range?",
    opts: ["Under $500", "$500-$1,500", "$1,500+", "Book a free call"]
  },
  "Business Automation": {
    msg: "We automate lead capture, follow-up flows, and internal processes. What do you want to automate?",
    opts: ["Lead follow-up", "Inquiry handling", "Internal workflows", "Book a call"]
  },
  "AI Chatbot": {
    msg: "Our AI chatbots work 24/7 - handling FAQs, lead capture, and support. What platform do you need?",
    opts: ["Website chatbot", "WhatsApp bot", "Both", "Book a call"]
  },
  "WhatsApp Flows": {
    msg: "WhatsApp automation is one of our most popular services! We can set up lead flows, booking confirmations, and follow-ups. Ready to start?",
    opts: ["Yes, let's go!", "Tell me more", "Book a call"]
  },
  "Book a Call": {
    msg: "Awesome! Our discovery calls are free and only 15 minutes. Click below to pick a time.",
    opts: ["Go to booking", "Maybe later"]
  },
  "Go to booking": {
    msg: "Redirecting you to our booking calendar...",
    opts: [],
    action: "booking"
  },
  "Talk to a human": {
    msg: "Sure! Reach us directly:",
    opts: ["WhatsApp us", "Email us", "Back to start"],
    links: {
      "WhatsApp us": "https://wa.me/94711861722",
      "Email us": "mailto:automatex100@gmail.com"
    }
  },
  "Back to start": {
    msg: "No problem! What else can I help with?",
    opts: ["Website Development", "Business Automation", "AI Chatbot", "WhatsApp Flows", "Book a Call"]
  },
  default: {
    msg: "Thanks! A team member will follow up with you shortly. Anything else?",
    opts: ["Website Development", "Business Automation", "Book a Call", "Talk to a human"]
  }
};

const chatBox = document.getElementById("chatBox");
const chatMessages = document.getElementById("chatMessages");
const chatToggle = document.getElementById("chatToggle");
const chatBadge = document.getElementById("chatBadge");
let chatOpen = false;
let badgeDismissed = false;

function addMessage(text, from = "bot", link = null) {
  const wrapper = document.createElement("div");
  wrapper.className = `chat-msg chat-msg-${from}`;

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

function addOptions(options, links = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-options";

  options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "chat-opt";
    button.textContent = option;
    button.addEventListener("click", () => {
      wrapper.remove();
      addMessage(option, "user");

      if (links[option]) {
        setTimeout(() => window.open(links[option], "_blank"), 300);
        return;
      }

      setTimeout(() => respond(option), 600);
    });

    wrapper.appendChild(button);
  });

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function respond(flowKey) {
  const flow = FLOWS[flowKey] || FLOWS.default;
  addMessage(flow.msg, "bot");

  if (flow.action === "booking") {
    setTimeout(() => document.getElementById("booking").scrollIntoView({ behavior: "smooth" }), 800);
  }

  if (flow.opts && flow.opts.length) {
    setTimeout(() => addOptions(flow.opts, flow.links || {}), 400);
  }
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
    setTimeout(() => respond("start"), 300);
  }
});

function sendChat() {
  const input = document.getElementById("chatInput");
  const value = input.value.trim();
  if (!value) {
    return;
  }

  input.value = "";
  addMessage(value, "user");
  setTimeout(() => respond("default"), 700);
}

document.getElementById("chatSend").addEventListener("click", sendChat);
document.getElementById("chatInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendChat();
  }
});

setTimeout(() => {
  if (!chatOpen) {
    chatBadge.style.display = "flex";
  }
}, 4000);

(async function initBooking() {
  await fetchAvailability();
  renderCalendar();
})();

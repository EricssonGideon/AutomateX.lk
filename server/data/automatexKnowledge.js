const automatexKnowledge = {
  company: {
    name: "AutomateX",
    shortDescription:
      "AutomateX is a digital solutions and AI automation company that builds premium websites, business management systems, AI chatbots, WhatsApp automation, business automation workflows, SaaS-level admin dashboards, and industry-specific digital solutions for modern businesses.",
    contactNumber: "+94 71 186 1722",
    email: "automatex100@gmail.com",
    website: "automatex.lk",
    serviceArea:
      "AutomateX is based in Sri Lanka and provides digital solutions for local and international businesses."
  },
  services: [
    {
      category: "Website Development",
      description: "For any business that needs a professional online presence.",
      examples: [
        "Business websites",
        "Service websites",
        "Landing pages",
        "Portfolio websites",
        "Product showcase websites",
        "Hotel websites",
        "Restaurant websites",
        "Cake and bakery websites",
        "Tuition class websites",
        "Clinic websites",
        "Real estate websites",
        "Construction websites",
        "Salon websites",
        "Gym websites",
        "Shop websites",
        "Company profile websites"
      ],
      features: [
        "Mobile-friendly design",
        "Premium UI/UX",
        "Contact forms",
        "WhatsApp button",
        "Service pages",
        "Gallery",
        "Testimonials",
        "Google Maps",
        "Booking form",
        "Inquiry form",
        "SEO-friendly structure"
      ]
    },
    {
      category: "Business Management Systems",
      description: "Custom systems for daily business operations.",
      examples: [
        "POS system",
        "Pharmacy management system",
        "Retail shop system",
        "Supermarket system",
        "Grocery shop system",
        "Restaurant billing system",
        "Gym management system",
        "Tuition class management system",
        "Clinic/channeling system",
        "Hotel booking system",
        "Inventory management system",
        "Customer management system",
        "Employee management system",
        "Supplier management system",
        "Invoice and billing system",
        "Appointment booking system",
        "Attendance system"
      ],
      features: [
        "Admin dashboard",
        "Login system",
        "Billing",
        "Stock management",
        "Reports",
        "Customer records",
        "Payment tracking",
        "Expense tracking",
        "Profit calculation",
        "Role-based access",
        "Daily/monthly reports",
        "Backup system"
      ]
    },
    {
      category: "AI Chatbots",
      description:
        "Smart chatbots for websites and businesses that can answer questions, collect leads, guide customers, and support business communication.",
      examples: [
        "Customer support chatbot",
        "Lead capture chatbot",
        "Product recommendation chatbot",
        "Service recommendation chatbot",
        "Appointment assistant",
        "FAQ chatbot",
        "Package recommendation chatbot",
        "Client support chatbot"
      ],
      features: [
        "Sinhala/Tamil/English support",
        "Voice chat",
        "WhatsApp integration",
        "Inquiry tracking",
        "Auto replies",
        "Business information answering",
        "Lead collection",
        "Admin dashboard connection"
      ]
    },
    {
      category: "WhatsApp & Messaging Automation",
      description: "Automation for customer communication through WhatsApp and messaging platforms.",
      examples: [
        "WhatsApp inquiry automation",
        "Booking confirmation messages",
        "Payment reminder messages",
        "Order status messages",
        "Customer follow-up messages",
        "Appointment reminders",
        "Support request handling"
      ],
      usefulFor: [
        "Hotels",
        "Clinics",
        "Tuition classes",
        "Retail shops",
        "Restaurants",
        "Gyms",
        "Service businesses"
      ]
    },
    {
      category: "Business Automation",
      description:
        "Automating repeated work inside a business to save time, reduce manual work, and make the business look more professional.",
      examples: [
        "Auto lead collection",
        "Auto inquiry routing",
        "Auto customer replies",
        "Auto booking flow",
        "Auto invoice generation",
        "Auto payment reminders",
        "Auto report generation",
        "Auto customer follow-up",
        "Auto WhatsApp messages",
        "Auto email notifications"
      ],
      mainValue:
        "Business automation helps save time, reduce manual work, improve customer response speed, and create a more professional business workflow."
    },
    {
      category: "SaaS-Level Admin Dashboards",
      description:
        "Professional dashboards for business owners to manage sales, bookings, inquiries, customers, inventory, payments, staff, reports, and client operations.",
      examples: [
        "Sales dashboard",
        "Booking dashboard",
        "Inquiry dashboard",
        "Customer dashboard",
        "Inventory dashboard",
        "Payment dashboard",
        "Staff dashboard",
        "Reports dashboard",
        "Admin approval dashboard",
        "Client management dashboard"
      ],
      features: [
        "Charts",
        "Tables",
        "Search and filters",
        "Status updates",
        "Export reports",
        "Notifications",
        "Dark/light mode",
        "Role-based access"
      ]
    },
    {
      category: "Industry-Specific Digital Solutions",
      description:
        "AutomateX can build custom websites, systems, dashboards, and automation flows for many real-life industries.",
      industries: [
        "Pharmacy",
        "Gym",
        "Retail shop",
        "Supermarket",
        "Hotel",
        "Restaurant",
        "Bakery",
        "Cake business",
        "Tuition class",
        "School/institute",
        "Clinic",
        "Doctor channeling",
        "Salon",
        "Spa",
        "Real estate",
        "Vehicle rental",
        "Construction company",
        "Repair service",
        "Delivery business",
        "Small factory",
        "Wholesale business",
        "Travel agency",
        "Event management",
        "Photography business"
      ]
    }
  ],
  chatbotRules: [
    "The chatbot must answer only about AutomateX, websites, business systems, AI chatbots, WhatsApp automation, business automation, dashboards, digital solutions, pricing guidance, project discussion, and contact details.",
    "If the user asks about a service, explain how AutomateX can help.",
    "If the user asks whether AutomateX can build a system for a specific business, answer positively if it is related to business websites, systems, AI, automation, dashboards, or digital transformation.",
    "If the exact industry is not listed, explain that AutomateX can build custom solutions based on the client's real workflow.",
    "If the user asks for pricing, do not invent exact prices unless pricing data exists in the knowledge base. Say pricing depends on features, business type, and project size.",
    "If the user seems interested, ask for their name, business type, location, phone number, and requirement.",
    "If the chatbot does not know something, it must not guess. It should politely ask the user to contact AutomateX.",
    "Keep answers short, professional, friendly, and business-focused.",
    "Do not give random unrelated answers.",
    "Do not answer politics, personal advice, medical advice, legal advice, or unrelated topics.",
    "Always guide serious clients to contact AutomateX."
  ],
  smartAssistant: {
    quickReplies: [
      "What services do you provide?",
      "I need a website",
      "I need a business system",
      "Can you help my shop?",
      "Can you build WhatsApp automation?",
      "I need an AI chatbot",
      "How much does it cost?",
      "Contact AutomateX"
    ],
    defaultReply:
      "I’m the AutomateX assistant, so I’m focused on websites, business systems, AI chatbots, WhatsApp automation, dashboards, and digital business solutions. Tell me your business type and I can suggest the best digital solution.",
    safeErrorReply:
      "Thanks for contacting AutomateX. I can help with websites, business systems, AI chatbots, WhatsApp automation, dashboards, and digital business solutions. What would you like to build?",
    leadCapture:
      "Please share your name, business type, location, phone number, and requirement. AutomateX can guide you with the best solution.",
    industrySolutions: {
      cakeBakery: {
        label: "cake or bakery business",
        aliases: ["cake", "bakery", "bake", "cupcake", "pastry"],
        recommendationTitle: "Product showcase website + WhatsApp order flow",
        solution: "a premium product showcase website with a smooth WhatsApp order flow",
        features: ["product showcase", "inquiry form", "customer follow-up", "delivery/order status messages", "optional e-commerce", "admin dashboard for orders"],
        addOns: ["online payment", "delivery tracking", "admin order dashboard"],
        question: "Do you mainly take orders through WhatsApp, calls, or walk-in customers?"
      },
      gym: {
        label: "gym or fitness business",
        aliases: ["gym", "fitness", "member", "membership"],
        recommendationTitle: "Gym management system + member dashboard",
        solution: "a gym management system with a professional admin dashboard",
        features: ["member management", "attendance tracking", "subscription/payment tracking", "payment reminders", "staff access", "reports dashboard"],
        addOns: ["WhatsApp reminders", "online registration", "trainer schedule"],
        question: "Do you need only member/payment tracking, or a full website plus gym system?"
      },
      hotel: {
        label: "hotel or room booking business",
        aliases: ["hotel", "room", "room booking", "guest", "villa", "resort"],
        recommendationTitle: "Hotel website + room booking system",
        solution: "a room booking website connected to guest and payment management",
        features: ["room booking", "guest management", "payment tracking", "booking confirmations", "housekeeping tasks", "WhatsApp reminders"],
        addOns: ["housekeeping task system", "WhatsApp reminders", "online payment"],
        question: "How many rooms do you manage, and do you need online booking or inquiry-based booking?"
      },
      restaurantCafe: {
        label: "restaurant or cafe",
        aliases: ["restaurant", "cafe", "food", "menu", "qr menu", "table"],
        recommendationTitle: "Restaurant website + QR menu/order flow",
        solution: "a restaurant website or ordering system built around your daily workflow",
        features: ["QR menu", "table booking", "food ordering", "billing/POS", "kitchen order flow", "delivery support"],
        addOns: ["delivery tracking", "WhatsApp order updates", "customer loyalty"],
        question: "Do you need dine-in table booking, delivery orders, or billing/POS first?"
      },
      pharmacy: {
        label: "pharmacy",
        aliases: ["pharmacy", "medicine", "drug store", "chemist"],
        recommendationTitle: "Pharmacy POS + medicine inventory",
        solution: "a pharmacy POS and stock management system",
        features: ["medicine stock", "expiry alerts", "billing", "supplier management", "reports", "customer records"],
        addOns: ["barcode support", "backup", "advanced analytics"],
        question: "Do you need barcode billing, expiry alerts, or supplier stock reports as the main priority?"
      },
      clinicDoctor: {
        label: "clinic or doctor channeling business",
        aliases: ["clinic", "doctor", "channeling", "medical", "patient"],
        recommendationTitle: "Clinic/channeling system",
        solution: "a clinic appointment and patient management system",
        features: ["appointment booking", "patient records", "doctor channeling", "billing", "reports", "WhatsApp reminders"],
        addOns: ["online booking", "patient portal", "prescription records"],
        question: "Do you need appointments for one doctor or multiple doctors?"
      },
      education: {
        label: "tuition, school, or institute",
        aliases: ["tuition", "school", "institute", "class", "student", "teacher", "course"],
        recommendationTitle: "Institute management system",
        solution: "an education management system for students, fees, and class operations",
        features: ["student records", "attendance", "fee tracking", "exam results", "parent/student notifications", "class schedules"],
        addOns: ["online class registration", "WhatsApp reminders", "reports dashboard"],
        question: "Do you manage individual classes, a full institute, or an online course business?"
      },
      retail: {
        label: "retail, supermarket, or grocery shop",
        aliases: ["shop", "retail", "supermarket", "grocery", "store", "mini mart", "pos"],
        recommendationTitle: "POS billing + inventory management system",
        solution: "a POS billing and inventory system",
        features: ["POS billing", "barcode support", "inventory", "stock alerts", "sales reports", "supplier management"],
        addOns: ["supplier management", "profit reports", "expense tracking", "cloud backup"],
        question: "Do you need barcode billing, stock alerts, or daily sales reports first?"
      },
      salonSpa: {
        label: "salon or spa",
        aliases: ["salon", "spa", "beauty", "barber", "appointment"],
        recommendationTitle: "Salon/spa booking website + customer management",
        solution: "a service website with appointment and customer management",
        features: ["appointment booking", "staff schedule", "customer records", "package/membership tracking", "WhatsApp reminders", "service website"],
        addOns: ["online booking", "membership tracking", "service package dashboard"],
        question: "Do you need online appointment booking or staff schedule management first?"
      },
      realEstate: {
        label: "real estate business",
        aliases: ["real estate", "property", "land", "house sale", "apartment"],
        recommendationTitle: "Property listing website + lead dashboard",
        solution: "a property listing website with lead and agent management",
        features: ["property listings", "inquiry management", "agent dashboard", "viewing requests", "WhatsApp lead follow-up"],
        addOns: ["agent login", "featured listings", "lead status tracking"],
        question: "Do you list properties for sale, rent, or both?"
      },
      construction: {
        label: "construction business",
        aliases: ["construction", "contractor", "building", "project showcase"],
        recommendationTitle: "Construction company website + project workflow",
        solution: "a company profile website with project and quotation workflows",
        features: ["project showcase", "inquiry system", "quotation workflow", "worker/project tracking", "expense tracking dashboard"],
        addOns: ["project tracker", "quotation dashboard", "expense reports"],
        question: "Do you mainly need a premium website, or internal project tracking too?"
      },
      repairService: {
        label: "repair service business",
        aliases: ["repair", "service center", "job card", "technician", "maintenance"],
        recommendationTitle: "Repair tracking + job card system",
        solution: "a repair tracking and job card system",
        features: ["job cards", "repair tracking", "customer notifications", "payment tracking", "service history"],
        addOns: ["technician access", "WhatsApp status updates", "warranty records"],
        question: "What type of repairs do you handle, and do customers need status updates?"
      },
      vehicleRental: {
        label: "vehicle rental business",
        aliases: ["vehicle rental", "car rental", "bike rental", "rent a car", "rental"],
        recommendationTitle: "Vehicle rental website + booking tracker",
        solution: "a rental website with booking and vehicle availability tracking",
        features: ["vehicle listings", "booking inquiries", "availability tracking", "payment records", "customer follow-up"],
        addOns: ["driver schedule", "online booking", "WhatsApp reminders"],
        question: "Do you rent cars, bikes, vans, or mixed vehicles?"
      },
      travelAgency: {
        label: "travel agency",
        aliases: ["travel", "tour", "tour package", "agency", "trip"],
        recommendationTitle: "Tour package website + inquiry automation",
        solution: "a tour package website with booking inquiry and follow-up automation",
        features: ["tour packages", "booking inquiries", "customer follow-up", "payment tracking", "WhatsApp automation"],
        addOns: ["custom trip builder", "payment tracking", "lead dashboard"],
        question: "Do you sell fixed packages, custom trips, or both?"
      },
      eventBusiness: {
        label: "event business",
        aliases: ["event", "wedding", "party", "event management"],
        recommendationTitle: "Event portfolio website + booking workflow",
        solution: "an event portfolio website with inquiry and booking management",
        features: ["event showcase", "package inquiries", "booking calendar", "customer follow-up", "payment tracking"],
        addOns: ["package comparison", "team task tracking", "WhatsApp follow-up"],
        question: "Do you need more leads, better booking tracking, or both?"
      },
      photography: {
        label: "photography business",
        aliases: ["photography", "photographer", "photo studio", "studio"],
        recommendationTitle: "Photography portfolio website + booking inquiries",
        solution: "a premium portfolio website with booking inquiries and package management",
        features: ["portfolio gallery", "package showcase", "booking inquiries", "WhatsApp follow-up", "client records"],
        addOns: ["client gallery", "package dashboard", "booking calendar"],
        question: "Do you focus on weddings, events, products, or studio shoots?"
      },
      delivery: {
        label: "delivery business",
        aliases: ["delivery", "courier", "dispatch", "order delivery"],
        recommendationTitle: "Delivery workflow + order status system",
        solution: "a delivery workflow system for orders, status, and customer updates",
        features: ["order tracking", "status updates", "driver/task assignment", "customer notifications", "reports dashboard"],
        addOns: ["driver dashboard", "customer tracking page", "automated status messages"],
        question: "Do you need customer order tracking, rider tracking, or internal dispatch first?"
      },
      wholesaleFactory: {
        label: "wholesale or factory business",
        aliases: ["wholesale", "factory", "manufacturing", "production"],
        recommendationTitle: "Wholesale/factory operations dashboard",
        solution: "an operations dashboard for stock, orders, expenses, and reports",
        features: ["inventory", "order tracking", "supplier/customer records", "expense tracking", "production or sales reports"],
        addOns: ["production tracking", "profit reports", "role-based access"],
        question: "Do you need stock control, order management, or production tracking first?"
      }
    },
    faqs: [
      {
        topics: ["maintenance", "support", "after support", "help after"],
        answer: "Yes, AutomateX can provide ongoing maintenance and support after launch.\nSupport can cover updates, fixes, content changes, backups, and feature improvements depending on the project scope.\nDo you need support for an existing system or a new project?"
      },
      {
        topics: ["admin dashboard", "dashboard", "admin panel"],
        answer: "Yes, AutomateX can build admin dashboards for managing customers, bookings, orders, payments, staff, inventory, reports, and status updates.\nDashboards can include charts, filters, exports, notifications, and role-based access.\nWhat do you want to track first?"
      },
      {
        topics: ["custom system", "custom software", "customized", "bespoke"],
        answer: "Yes, AutomateX builds custom systems around your real business workflow.\nA custom system can manage billing, stock, bookings, customers, staff, payments, reports, and automation.\nWhat business process do you want to manage?"
      },
      {
        topics: ["old website", "upgrade website", "redesign", "outdated"],
        answer: "Yes, AutomateX can upgrade outdated websites into modern, mobile-friendly, premium interfaces with stronger sections, service pages, contact flow, and brand presentation.\nDo you want a full redesign or improvements to the existing site?"
      },
      {
        topics: ["mobile responsive", "responsive", "mobile friendly", "phone view"],
        answer: "Yes, AutomateX websites are built to work well on mobile, tablet, and desktop screens.\nThe layout can include fast contact actions like WhatsApp, call buttons, forms, and maps.\nIs your main audience using mobile phones?"
      },
      {
        topics: ["sinhala", "tamil", "english", "language"],
        answer: "Yes, AutomateX can support Sinhala, Tamil, and English content depending on your business audience.\nFor chatbots and websites, language support can be planned based on your customers.\nWhich language do your customers prefer most?"
      },
      {
        topics: ["whatsapp integration", "whatsapp button", "whatsapp order"],
        answer: "Yes, AutomateX can add WhatsApp integration for inquiries, order flow, booking confirmations, reminders, follow-ups, and support messages.\nDo you want simple WhatsApp buttons or automated message flows?"
      },
      {
        topics: ["payment gateway", "online payment", "card payment", "pay online"],
        answer: "Yes, payment gateway integration can be added when the project needs online payments.\nThe best setup depends on your business type, payment provider, and checkout workflow.\nDo you need full online checkout or payment tracking only?"
      },
      {
        topics: ["domain", "hosting", "host", "server"],
        answer: "AutomateX can guide you with domain and hosting setup for websites and systems.\nThe recommended setup depends on traffic, features, storage, security, and whether the project needs a database or dashboard.\nDo you already have a domain?"
      },
      {
        topics: ["seo", "google ranking", "search engine"],
        answer: "AutomateX can build websites with SEO-friendly structure, page titles, service sections, contact flow, mobile-friendly layout, and fast navigation.\nSEO growth also depends on content, competition, and ongoing updates.\nWhich services or locations do you want customers to find on Google?"
      },
      {
        topics: ["delivery time", "how long", "timeline", "finish"],
        answer: "Delivery time depends on project size, pages/modules, content readiness, integrations, and revisions.\nA simple website is faster than a custom system with dashboards and automation.\nWhat do you want to build first?"
      },
      {
        topics: ["backup", "cloud backup", "data backup"],
        answer: "Yes, backup planning can be included for business systems and dashboards.\nBackup options depend on the hosting setup, database, and how critical your daily data is.\nDo you need daily business data backup?"
      },
      {
        topics: ["training", "teach", "how to use"],
        answer: "Yes, AutomateX can guide your team on how to use the website, dashboard, or system after launch.\nTraining can focus on orders, customers, reports, payments, staff access, or content updates.\nWho will use the system daily?"
      },
      {
        topics: ["client login", "customer login", "user login", "staff login"],
        answer: "Yes, AutomateX can add client, customer, staff, or admin login depending on your workflow.\nRole-based access can protect sensitive areas and show each user only what they need.\nWho needs login access?"
      },
      {
        topics: ["reports", "reporting", "sales report", "profit report"],
        answer: "Yes, AutomateX systems can include daily, monthly, sales, stock, payment, customer, expense, and profit reports.\nReports can be filtered and connected to dashboards where needed.\nWhich reports matter most for your business?"
      },
      {
        topics: ["security", "secure", "safe", "privacy"],
        answer: "AutomateX can design systems with secure login, role-based access, safer data handling, and protected admin areas.\nSecurity requirements depend on the project type and user roles.\nWill staff, customers, or admins need separate access?"
      }
    ]
  },
  contactCTA:
    "Would you like AutomateX to suggest the best digital solution for your business? Please share your business type, requirement, location, and phone number. Our team can guide you with the best option."
};

module.exports = automatexKnowledge;

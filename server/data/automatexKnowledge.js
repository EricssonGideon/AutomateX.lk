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
  contactCTA:
    "Would you like AutomateX to suggest the best digital solution for your business? Please share your business type, requirement, location, and phone number. Our team can guide you with the best option."
};

module.exports = automatexKnowledge;

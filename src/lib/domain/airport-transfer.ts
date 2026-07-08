import type {
  BookingSummary,
  BossInboxItem,
  BusinessConfiguration,
  ConversationMessage,
  DemoSnapshot,
  TripDetails,
} from "./types";
import { buildBookingConfirmationText } from "./booking-confirmation";

export const airportTransferConfiguration: BusinessConfiguration = {
  companyProfile: {
    id: "company_skybridge",
    name: "天桥机场接送",
    industry: "airport_transfer",
    serviceArea: "市中心、郊区及国际机场路线",
    languages: ["英语", "中文", "马来语"],
    paymentMethods: ["现金", "银行转账", "到付刷卡"],
  },
  services: [
    {
      id: "svc_airport_pickup",
      name: "Airport pickup",
      description: "Meet-and-greet airport pickup with waiting time rules.",
      active: true,
    },
    {
      id: "svc_airport_dropoff",
      name: "Airport drop-off",
      description: "Scheduled transfer from home, hotel, or office to the airport.",
      active: true,
    },
    {
      id: "svc_hourly_transfer",
      name: "Hourly transfer",
      description: "Private driver service for flexible local trips.",
      active: true,
    },
    {
      id: "svc_city_transfer",
      name: "City-to-city transfer",
      description: "Point-to-point transfer between hotels, attractions, and cities.",
      active: true,
    },
    {
      id: "svc_day_tour",
      name: "Private day tour",
      description: "Custom itinerary with an English-speaking driver when available.",
      active: true,
    },
  ],
  businessHours: "每日 06:00-23:30，深夜紧急请求需老板审核。",
  pricingRules: [
    {
      id: "price_standard_airport",
      label: "Standard airport route",
      description: "Base sedan transfer for normal city-to-airport routes.",
      basePrice: 78,
      currency: "USD",
    },
    {
      id: "price_van_airport",
      label: "Van airport route",
      description: "Larger vehicle for families, groups, or extra luggage.",
      basePrice: 118,
      currency: "USD",
    },
    {
      id: "price_day_tour",
      label: "Private day tour",
      description: "Up to 10 hours with a private vehicle and driver.",
      basePrice: 420,
      currency: "USD",
    },
  ],
  escalationRules: [
    {
      id: "esc_discount",
      eventType: "Discount Request",
      description: "Customer asks for a lower price or special discount.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_urgent",
      eventType: "Urgent Booking",
      description: "Customer needs same-day or immediate pickup.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_route",
      eventType: "Route Change",
      description: "Customer changes pickup, drop-off, or route after quote discussion.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_delay",
      eventType: "Flight Delay",
      description: "Customer reports flight delay that may affect driver schedule.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_complaint",
      eventType: "Complaint",
      description: "Customer complains about service, price, driver, or timing.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_cancel",
      eventType: "Cancellation Request",
      description: "Customer asks to cancel a booking or quote.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_receipt",
      eventType: "Receipt Request",
      description: "Customer asks for a receipt or invoice name.",
      requiresOwnerApproval: false,
    },
    {
      id: "esc_pickup_time",
      eventType: "Pickup Time Change",
      description: "Customer changes the pickup time or asks what time to leave.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_driver",
      eventType: "Driver Assignment Needed",
      description: "Booking is confirmed and driver details need to be shared.",
      requiresOwnerApproval: true,
    },
    {
      id: "esc_multileg",
      eventType: "Multi-leg Itinerary Request",
      description: "Customer asks for multiple route legs, a tour, or a return trip.",
      requiresOwnerApproval: true,
    },
  ],
  contactCaptureRules: [
    {
      id: "capture_quote_intent",
      trigger: "Ask after the customer requests a price, availability, or booking.",
      preferredMethods: ["WhatsApp", "Telegram", "Email"],
    },
  ],
  requiredBookingFields: [
    { key: "serviceType", label: "Service type", requiredForQuote: false },
    { key: "pickupLocation", label: "Pickup location", requiredForQuote: true },
    { key: "dropoffLocation", label: "Drop-off location", requiredForQuote: true },
    { key: "airport", label: "Airport", requiredForQuote: false },
    { key: "terminal", label: "Terminal", requiredForQuote: false },
    { key: "date", label: "Transfer date", requiredForQuote: true },
    { key: "time", label: "Pickup time", requiredForQuote: true },
    { key: "flightNumber", label: "Flight number", requiredForQuote: false },
    { key: "flightTime", label: "Flight time", requiredForQuote: false },
    { key: "passengerCount", label: "Passengers", requiredForQuote: true },
    { key: "luggageCount", label: "Luggage", requiredForQuote: false },
    { key: "vehiclePreference", label: "Vehicle preference", requiredForQuote: false },
  ],
  faq: [
    {
      id: "faq_waiting",
      question: "司机可以等待多长时间？",
      answer: "标准等待时间为航班降落后 60 分钟。",
    },
    {
      id: "faq_payment",
      question: "客户如何支付？",
      answer: "客户可通过现金、银行转账或到付刷卡支付。",
    },
    {
      id: "faq_child_seat",
      question: "可以要求儿童座椅吗？",
      answer: "儿童座椅可提前申请，可能会影响车型可用性。",
    },
  ],
  aiBehaviorBoundaries: [
    "Never approve discounts without owner approval.",
    "Never confirm cancellations without owner approval.",
    "Always capture contact information after purchase intent appears.",
    "Ask one main follow-up question at a time.",
    "Generate quote suggestions, not final commercial decisions.",
  ],
  vehicles: [
    {
      id: "vehicle_alphard",
      name: "丰田阿尔法",
      type: "Alphard",
      capacity: {
        passengers: 6,
        luggage: 4,
      },
      description: "高端舒适MPV，空间宽敞，适合家庭或3-6人商务乘客，乘坐体验好。",
    },
    {
      id: "vehicle_hiace",
      name: "丰田海狮",
      type: "HiAce",
      capacity: {
        passengers: 8,
        luggage: 6,
      },
      description: "大型商务车，行李空间充足，适合多人出行或携带较多行李。",
    },
  ],
};

const initialTripDetails: TripDetails = {
  serviceType: "airport_pickup",
  pickupLocation: "国际机场 T2 航站楼",
  dropoffLocation: "中央商务酒店",
  airport: "国际机场",
  terminal: "T2",
  date: "明天",
  time: "18:30",
  flightNumber: "SQ 318",
  flightTime: "18:30 到达",
  passengerCount: 3,
  luggageCount: 4,
  vehiclePreference: "丰田阿尔法",
  routeDistanceKm: 76,
  estimatedDriveTimeMinutes: 78,
  specialRequests: ["司机提前到达", "服务后现金支付"],
};

const initialConversation: ConversationMessage[] = [
  {
    id: "msg_001",
    role: "ai",
    text: "您好，我可以帮您安排机场接送。请问上车地点和目的地是哪里？",
    createdAt: "09:12",
    channel: "website_widget",
  },
  {
    id: "msg_002",
    role: "customer",
    text: "我需要明天18:30机场接机，航班SQ318，3名乘客4件行李。下车地点是中央商务酒店。",
    createdAt: "09:13",
    channel: "website_widget",
  },
  {
    id: "msg_003",
    role: "ai",
    text: "谢谢。3名乘客加4件行李，丰田阿尔法空间合适。请问用WhatsApp、Telegram还是邮箱发送报价更新比较好？",
    createdAt: "09:13",
    channel: "website_widget",
  },
];

const initialBossInbox: BossInboxItem[] = [
  {
    id: "boss_quote_001",
    type: "quote_approval",
    decisionType: "Approve quote",
    status: "pending",
    customerName: "Website visitor",
    summary: "3名乘客4件行李的机场接机，T2航站楼至中央商务酒店。",
    recommendation: "批准 USD 118 丰田阿尔法报价。",
    reason: "乘客和行李数量适合丰田阿尔法车型。",
    confidence: 88,
    createdAt: "09:14",
    quote: {
      id: "quote_001",
      serviceType: "airport_pickup",
      suggestedPrice: 118,
      currency: "USD",
      vehicleType: "丰田阿尔法",
      includedFees: ["过路费", "停车费", "税费"],
      routeDistanceKm: 76,
      estimatedDriveTimeMinutes: 78,
      reason: "因为乘客和行李数量适中，丰田阿尔法可以提供舒适接送体验。",
      confidence: 88,
      missingFields: [],
    },
  },
];

const initialBookingSummaryBase: BookingSummary = {
  id: "booking_draft_001",
  customerName: "Website visitor",
  tripDetails: initialTripDetails,
  serviceType: "airport_pickup",
  approvedPrice: 118,
  currency: "USD",
  includedFees: ["过路费", "停车费", "税费"],
  paymentMethod: "Cash to driver after service",
  receiptRequest: {
    needed: false,
  },
  specialNotes: ["仍待老板批准。"],
  status: "draft",
};

const initialBookingSummary: BookingSummary = {
  ...initialBookingSummaryBase,
  confirmationText: buildBookingConfirmationText(initialBookingSummaryBase),
};

export function getDemoSnapshot(): DemoSnapshot {
  return {
    businessConfiguration: airportTransferConfiguration,
    conversation: initialConversation,
    tripDetails: initialTripDetails,
    detectedEvents: [],
    bossInbox: initialBossInbox,
    bookingSummary: initialBookingSummary,
  };
}

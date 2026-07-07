export interface RealChatScenario {
  id: string;
  label: string;
  category: "quote" | "event" | "contact" | "operations";
  message: string;
}

export const realChatScenarios: RealChatScenario[] = [
  {
    id: "airport-arrival-full",
    label: "机场报价",
    category: "quote",
    message:
      "I am inquiring about a private vehicle transfer to collect 4 persons from Narita International Airport terminal three at approximately 6:30 PM on 4 July. Flight JQ9. Traveling to Royal Park Canvas Ginza 8. We will have four medium sized suitcases.",
  },
  {
    id: "discount-request",
    label: "折扣请求",
    category: "event",
    message: "The price is a bit too high. Is there any discount or special price if we book both transfers?",
  },
  {
    id: "multi-leg-itinerary",
    label: "多段行程",
    category: "operations",
    message:
      "We also require a car for 6 July from Tokyo hotel to Mt Fuji, then 7 July from Mt Fuji to Kyoto. Can you confirm costs and availability?",
  },
  {
    id: "receipt-request",
    label: "发票请求",
    category: "operations",
    message: "Can you ask the driver to prepare a receipt? Please put the receipt name as Company Guest.",
  },
  {
    id: "driver-change",
    label: "司机信息",
    category: "operations",
    message: "Can you send the driver's name, phone number, vehicle color, and license plate before pickup?",
  },
  {
    id: "early-pickup",
    label: "提前接机",
    category: "event",
    message: "Hi, we are ready to leave now. Can the driver come earlier than the planned pickup time?",
  },
  {
    id: "contact-capture",
    label: "联系方式",
    category: "contact",
    message: "Please send updates to WhatsApp +1 415 555 0198.",
  },
];

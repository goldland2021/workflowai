-- Replace the generic seed profile for JP VIP Charter with the live JPY rules.
-- The company scope keeps the unrelated airport project in the shared database untouched.
UPDATE public.business_config
SET
  company_name = 'JP VIP Charter',
  config = config || $config$
  {
    "companyProfile": {
      "id": "company_jpairport",
      "name": "JP VIP Charter",
      "industry": "airport_transfer",
      "serviceArea": "Tokyo, Yokohama, Kyoto, Osaka and major airports in Japan",
      "languages": ["English", "中文"],
      "paymentMethods": ["Cash to the driver after service", "PayPal by arrangement"]
    },
    "pricingRules": [
      {"id": "price_standard_airport", "label": "Standard airport route", "description": "Standard airport transfer base rate.", "basePrice": 21000, "currency": "JPY"},
      {"id": "price_van_airport", "label": "Van airport route", "description": "Larger vehicle for groups or additional luggage.", "basePrice": 31000, "currency": "JPY"},
      {"id": "price_day_tour", "label": "Private day tour", "description": "Private vehicle and driver; final price depends on the itinerary.", "basePrice": 42000, "currency": "JPY"}
    ],
    "requiredBookingFields": [
      {"key": "serviceType", "label": "Service type", "requiredForQuote": false},
      {"key": "pickupLocation", "label": "Pickup location", "requiredForQuote": true},
      {"key": "dropoffLocation", "label": "Drop-off location", "requiredForQuote": true},
      {"key": "airport", "label": "Airport", "requiredForQuote": false},
      {"key": "terminal", "label": "Terminal", "requiredForQuote": false},
      {"key": "date", "label": "Transfer date", "requiredForQuote": false},
      {"key": "time", "label": "Pickup time", "requiredForQuote": false},
      {"key": "flightNumber", "label": "Flight number", "requiredForQuote": false},
      {"key": "flightTime", "label": "Flight time", "requiredForQuote": false},
      {"key": "passengerCount", "label": "Passengers", "requiredForQuote": true},
      {"key": "luggageCount", "label": "Luggage", "requiredForQuote": false},
      {"key": "vehiclePreference", "label": "Vehicle preference", "requiredForQuote": false}
    ],
    "faq": [
      {"id": "faq_waiting", "question": "司机可以等待多长时间？", "answer": "航班实际落地后提供90分钟免费等候。"},
      {"id": "faq_payment", "question": "客户如何支付？", "answer": "通常在服务完成后现金支付给司机，也可另行安排 PayPal。"},
      {"id": "faq_child_seat", "question": "可以要求儿童座椅吗？", "answer": "儿童座椅可提前申请，可能会影响车型可用性。"}
    ],
    "vehicles": [
      {"id": "vehicle_alphard", "name": "Toyota Alphard", "type": "Alphard", "capacity": {"passengers": 6, "luggage": 4}, "description": "Comfortable premium MPV for up to 6 passengers."},
      {"id": "vehicle_hiace", "name": "Toyota HiAce", "type": "HiAce", "capacity": {"passengers": 8, "luggage": 12}, "description": "Spacious van for groups and additional luggage."}
    ],
    "pricingPolicy": {
      "engineVersion": "workflowai-pricing-v2",
      "currency": "JPY",
      "cityRateYenPerKm": 200,
      "cityTransferMinimumYen": 18000,
      "priceBufferYen": 2000,
      "hiaceSurchargeYen": 5000,
      "standardTollAllowanceYen": 3000,
      "autoQuoteEnabled": true,
      "autoQuoteMinConfidence": 90,
      "airports": {
        "haneda": {"aliases": ["haneda", "hnd", "羽田"], "baseYen": 6500, "minimumYen": 10000, "standardTollYen": 1500},
        "narita": {"aliases": ["narita", "nrt", "成田"], "baseYen": 6500, "minimumYen": 20000, "standardTollYen": 3000},
        "yokohamaPort": {"aliases": ["yokohamaport", "横浜港", "大さん橋", "osambashi"], "baseYen": 8500, "minimumYen": 18000, "standardTollYen": 1800},
        "kansai": {"aliases": ["kansai", "kix", "関西", "関西空港"], "baseYen": 8000, "minimumYen": 16000, "standardTollYen": 2200},
        "itami": {"aliases": ["itami", "itm", "伊丹", "大阪空港"], "baseYen": 7000, "minimumYen": 10000, "standardTollYen": 1500}
      },
      "fixedRoutes": [
        {"id": "fuji", "label": "Fuji area fixed route", "keywords": ["fuji", "富士", "河口湖", "kawaguchiko", "山中湖", "yamanakako", "gotemba", "御殿場"], "pricesByAirport": {"haneda": 45000, "narita": 59000, "yokohamaPort": 53000}},
        {"id": "hakone", "label": "Hakone area fixed route", "keywords": ["hakone", "箱根", "gora", "強羅", "仙石原", "ashinoko", "芦ノ湖"], "pricesByAirport": {"haneda": 40000, "narita": 60000, "yokohamaPort": 45000}}
      ],
      "cityRoutes": [
        {"id": "kyoto-usj", "label": "Kyoto to Universal Studios Japan", "pickupKeywords": ["ritz-carlton kyoto", "kyoto"], "dropoffKeywords": ["universal studios japan", "usj"], "oneWayYen": 22000, "roundTripYen": 40000},
        {"id": "tokinoyu-hyatt-regency-tokyo", "label": "Tokinoyu Setsugetsuka to Hyatt Regency Tokyo", "pickupKeywords": ["tokinoyu", "setsugetsuka", "kyoritsu resort"], "dropoffKeywords": ["hyatt regency tokyo"], "oneWayYen": 40000}
      ],
      "interAirportFares": {"haneda:narita": 25000, "narita:haneda": 25000, "haneda:yokohamaPort": 18000, "yokohamaPort:haneda": 18000, "narita:yokohamaPort": 37000, "yokohamaPort:narita": 37000}
    }
  }
  $config$::jsonb
WHERE company_id = '40757cc5-5d3e-4997-be2b-767820c326c6';

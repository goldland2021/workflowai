import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPlanForStripePrice, subscriptionStatusFromStripe } from "./stripe";

describe("Stripe billing mapping", () => {
  const originalStarterPrice = process.env.STRIPE_STARTER_PRICE_ID;
  const originalGrowthPrice = process.env.STRIPE_GROWTH_PRICE_ID;

  beforeEach(() => {
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter_test";
    process.env.STRIPE_GROWTH_PRICE_ID = "price_growth_test";
  });

  afterEach(() => {
    process.env.STRIPE_STARTER_PRICE_ID = originalStarterPrice;
    process.env.STRIPE_GROWTH_PRICE_ID = originalGrowthPrice;
  });

  it("maps configured Stripe prices to internal plans", () => {
    expect(getPlanForStripePrice("price_starter_test")).toBe("starter");
    expect(getPlanForStripePrice("price_growth_test")).toBe("growth");
    expect(getPlanForStripePrice("price_unknown")).toBeNull();
  });

  it("maps Stripe subscription states to supported database states", () => {
    expect(subscriptionStatusFromStripe("active")).toBe("active");
    expect(subscriptionStatusFromStripe("past_due")).toBe("past_due");
    expect(subscriptionStatusFromStripe("canceled")).toBe("cancelled");
  });
});

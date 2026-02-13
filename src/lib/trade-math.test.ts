import { describe, expect, it } from "vitest";
import {
  calculateDisplayedPotentialProfit,
  calculateSignalRr,
  calculateSignalRrForTarget,
} from "@/lib/trade-math";

describe("trade math", () => {
  it("calculates BUY rr correctly", () => {
    const rr = calculateSignalRr({
      signal: {
        direction: "BUY",
        entry_price: 100,
        stop_loss: 90,
        take_profit: 120,
      },
    });

    expect(rr).toBe(2);
  });

  it("calculates SELL rr correctly", () => {
    const rr = calculateSignalRr({
      signal: {
        direction: "SELL",
        entry_price: 100,
        stop_loss: 110,
        take_profit: 80,
      },
    });

    expect(rr).toBe(2);
  });

  it("calculates rr against a dynamic target TP", () => {
    const rr = calculateSignalRrForTarget(
      {
        direction: "BUY",
        entry_price: 100,
        stop_loss: 90,
        take_profit: 120,
      },
      115,
    );

    expect(rr).toBe(1.5);
  });

  it("uses risk * rr for open trades", () => {
    const value = calculateDisplayedPotentialProfit({
      result: "pending",
      pnl: null,
      risk_amount: 100,
      signal: {
        direction: "BUY",
        entry_price: 100,
        stop_loss: 90,
        take_profit: 120,
      },
    });

    expect(value).toBe(200);
  });

  it("uses realized upside for closed winning trades", () => {
    const value = calculateDisplayedPotentialProfit({
      result: "win",
      pnl: 84.5,
      risk_amount: 100,
      signal: {
        direction: "BUY",
        entry_price: 100,
        stop_loss: 90,
        take_profit: 120,
      },
    });

    expect(value).toBe(84.5);
  });

  it("never shows negative potential for closed losing trades", () => {
    const value = calculateDisplayedPotentialProfit({
      result: "loss",
      pnl: -50,
      risk_amount: 100,
      signal: {
        direction: "BUY",
        entry_price: 100,
        stop_loss: 90,
        take_profit: 120,
      },
    });

    expect(value).toBe(0);
  });
});

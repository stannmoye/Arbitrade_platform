import {describe,expect,it} from "vitest";
import {isPopupExecutionEligible} from "./popup-execution-policy";

describe("popup presentation and execution isolation",()=>{
  const delivered={deliveryStatus:"rendered",executionStatus:"PENDING"};
  it("keeps noticed, opened and dismissed popups eligible for automatic execution",()=>{
    expect(isPopupExecutionEligible({...delivered,eventStatus:"NOTICED"})).toBe(true);
    expect(isPopupExecutionEligible({...delivered,eventStatus:"OPENED"})).toBe(true);
    expect(isPopupExecutionEligible({...delivered,eventStatus:"DISMISSED"})).toBe(true);
  });
  it("does not execute when delivery failed or execution is terminal or already running",()=>{
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"failed",executionStatus:"PENDING"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"SUCCEEDED"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"FAILED"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"RUNNING"})).toBe(false);
  });
  it("does not make an unrecognized lifecycle status eligible",()=>{
    expect(isPopupExecutionEligible({...delivered,eventStatus:"WITHDRAWN"})).toBe(false);
  });
});

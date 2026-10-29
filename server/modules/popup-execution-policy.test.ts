import {describe,expect,it} from "vitest";
import {isPopupExecutionEligible} from "./popup-execution-policy";

describe("popup presentation and execution isolation",()=>{
  const delivered={deliveryStatus:"rendered",executionStatus:"READY"};
  it("keeps noticed, opened and dismissed popups eligible for automatic execution",()=>{
    expect(isPopupExecutionEligible({...delivered,eventStatus:"NOTICED"})).toBe(true);
    expect(isPopupExecutionEligible({...delivered,eventStatus:"OPENED"})).toBe(true);
    expect(isPopupExecutionEligible({...delivered,eventStatus:"DISMISSED"})).toBe(true);
  });
  it("keeps retryable execution eligible and fails closed for terminal, running, or unknown states",()=>{
    expect(isPopupExecutionEligible({...delivered,eventStatus:"DISMISSED",executionStatus:"RETRYING"})).toBe(true);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"failed",executionStatus:"PENDING"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"SUCCEEDED"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"FAILED"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"RUNNING"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"PENDING"})).toBe(false);
    expect(isPopupExecutionEligible({eventStatus:"DISMISSED",deliveryStatus:"rendered",executionStatus:"UNKNOWN"})).toBe(false);
  });
  it("does not make an unrecognized lifecycle status eligible",()=>{
    expect(isPopupExecutionEligible({...delivered,eventStatus:"WITHDRAWN"})).toBe(false);
  });
});

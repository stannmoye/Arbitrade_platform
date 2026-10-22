import { ARBITRADE_THEMES, type ArbitradeTheme } from "../components/appearance-policy";

/** Resolve an untrusted stored preference against the currently published customer policy. */
export function resolveCustomerTheme(input: {
  storedTheme: unknown;
  policyDefault: ArbitradeTheme;
  enabledThemes: readonly ArbitradeTheme[];
  customerCanSelect: boolean;
}): ArbitradeTheme {
  const { storedTheme, policyDefault, enabledThemes, customerCanSelect } = input;
  if (
    customerCanSelect &&
    typeof storedTheme === "string" &&
    (ARBITRADE_THEMES as readonly string[]).includes(storedTheme) &&
    enabledThemes.includes(storedTheme as ArbitradeTheme)
  ) {
    return storedTheme as ArbitradeTheme;
  }
  return policyDefault;
}

/** A customer may change theme only when the administrator explicitly permits it. */
export function canCustomerSelectTheme(
  candidate: unknown,
  enabledThemes: readonly ArbitradeTheme[],
  customerCanSelect: boolean,
): candidate is ArbitradeTheme {
  return customerCanSelect &&
    typeof candidate === "string" &&
    (ARBITRADE_THEMES as readonly string[]).includes(candidate) &&
    enabledThemes.includes(candidate as ArbitradeTheme);
}

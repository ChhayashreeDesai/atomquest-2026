const THRUST_AREA_MAP: Record<string, string> = {
  "Digital Transformation": "DIGITAL_TRANSFORMATION",
  "Customer Experience": "CUSTOMER_EXPERIENCE",
  "Operational Excellence": "OPERATIONAL_EXCELLENCE",
  "Innovation & R&D": "INNOVATION_RD",
  "Talent Development": "TALENT_DEVELOPMENT",
  Sustainability: "SUSTAINABILITY",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(THRUST_AREA_MAP).map(([label, value]) => [value, label])
);

export function normalizeThrustArea(input: string): string {
  if (THRUST_AREA_MAP[input]) {
    return THRUST_AREA_MAP[input];
  }
  if (REVERSE_MAP[input]) {
    return input;
  }
  return input
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function thrustAreaToLabel(value: string): string {
  return REVERSE_MAP[value] || value.replace(/_/g, " ");
}

export { THRUST_AREA_MAP, REVERSE_MAP };

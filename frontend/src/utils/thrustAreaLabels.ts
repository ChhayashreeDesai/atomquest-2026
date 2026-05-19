const REVERSE_MAP: Record<string, string> = {
  DIGITAL_TRANSFORMATION: 'Digital Transformation',
  CUSTOMER_EXPERIENCE: 'Customer Experience',
  OPERATIONAL_EXCELLENCE: 'Operational Excellence',
  INNOVATION_RD: 'Innovation & R&D',
  TALENT_DEVELOPMENT: 'Talent Development',
  SUSTAINABILITY: 'Sustainability',
};

export function thrustAreaToLabel(value: string): string {
  return REVERSE_MAP[value] || value.replace(/_/g, ' ');
}

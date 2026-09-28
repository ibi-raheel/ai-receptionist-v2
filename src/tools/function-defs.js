export const CAPTURE_LEAD_SCHEMA = {
  name: 'capture_lead',
  description: 'Capture lead information from the caller. Call this as soon as you have name, phone, address, and issue type.',
  parameters: {
    type: 'object',
    properties: {
      caller_name: { type: 'string', description: 'Full name of the caller' },
      phone: { type: 'string', description: 'Phone number' },
      address: { type: 'string', description: 'Property address' },
      issue_type: { type: 'string', description: 'Type of water damage issue' },
      water_source: { type: 'string', description: 'Source of water (pipe, appliance, etc.)' },
      still_active: { type: 'boolean', description: 'Whether water is still flowing' },
      duration: { type: 'string', description: 'How long the issue has been going on' },
      property_type: { type: 'string', enum: ['residential', 'commercial'] },
      insurance: { type: 'string', description: 'Insurance status or provider' },
      area_affected: { type: 'string', description: 'Rooms/areas affected' },
      flooring_type: { type: 'string', description: 'Type of flooring affected' },
      urgency: { type: 'string', enum: ['low', 'medium', 'high', 'emergency'] },
    },
    required: ['caller_name', 'phone', 'address', 'issue_type'],
  },
};

// Format for OpenAI chat completions API
export const TOOLS_FOR_OPENAI = [
  {
    type: 'function',
    function: CAPTURE_LEAD_SCHEMA,
  },
];

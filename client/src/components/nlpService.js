// Simple local NLP fallback and rephrase helper
// Replace with Dialogflow/Wit.ai/OpenAI as needed

export async function sendMessageToNLP(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('booking')) {
    return "Absolutely! Please provide your booking details or specify what you'd like to book.";
  } else if (t.includes('tracking')) {
    return "May I kindly ask you to share your tracking or LR/Booking ID so we can fetch the shipment status?";
  } else if (t.includes('estimated')) {
    return "Could you please provide your order or booking ID? We'll share the expected delivery date.";
  } else if (t.includes('contact')) {
    return "Would you like to speak to the owner or manager? Please specify and share your name and phone number.";
  }
  return "Thank you for reaching out! May I kindly ask you to clarify your request so I can assist further?";
}

export function rephraseForProfessionalTone(text) {
  return String(text || '')
    .replace("What's", 'Could you please provide')
    .replace('Sure', 'Absolutely')
    .replace('Could you', 'May I kindly ask you to');
}

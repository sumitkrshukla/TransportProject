import { NlpManager } from 'node-nlp';

let manager;
let trainingPromise;

function getManager() {
  if (!manager) {
    manager = new NlpManager({ languages: ['en'], forceNER: true });

    // Intents and sample utterances
    manager.addDocument('en', 'hello', 'greeting');
    manager.addDocument('en', 'hi', 'greeting');
    manager.addDocument('en', 'hey', 'greeting');

    manager.addDocument('en', 'track %veh%', 'tracking');
    manager.addDocument('en', 'where is %veh%', 'tracking');
    manager.addDocument('en', 'locate vehicle %veh%', 'tracking');

    manager.addDocument('en', 'shipment status %ship%', 'shipment_status');
    manager.addDocument('en', 'status of shipment %ship%', 'shipment_status');

    manager.addDocument('en', 'what truck capacity for %wt% tons', 'capacity_advice');
    manager.addDocument('en', 'capacity for %wt% tons', 'capacity_advice');

    manager.addDocument('en', 'what documents are required', 'documents');
    manager.addDocument('en', 'which papers needed', 'documents');
    manager.addDocument('en', 'e way bill lr bill documents', 'documents');

    manager.addDocument('en', 'quote from %from% to %to% for %goods%', 'quote_request');
    manager.addDocument('en', 'price to move %goods% from %from% to %to%', 'quote_request');

    // Named entities (simple)
    manager.addNamedEntityText('veh', 'veh', ['en'], ['MH-12-AB-1234', 'UP-14-C-5678']);
    manager.addNamedEntityText('ship', 'ship', ['en'], ['S-123', 'S-456']);

    // We still rely on regex extraction in interpret() for generality
  }
  return manager;
}

export async function warmup() {
  const m = getManager();
  if (!trainingPromise) {
    trainingPromise = m.train();
  }
  await trainingPromise;
}

function extractEntities(text) {
  const vehicleReg = (text.match(/[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{4}/i) || [])[0];
  const shipmentId = (text.match(/S-\d+/i) || [])[0];
  const tonsMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:t|tons?)/i);
  const weightTons = tonsMatch ? parseFloat(tonsMatch[1]) : undefined;

  // crude from/to extraction
  const from = (text.match(/from\s+([^,]+?)(?=\s+to\b|$)/i) || [])[1];
  const to = (text.match(/to\s+([^,]+)$/i) || [])[1];

  // goods type words (simple pick)
  const goodsList = ['fmcg', 'electronics', 'machinery', 'industrial machinery', 'construction material', 'cement', 'steel', 'automotive parts'];
  const lower = text.toLowerCase();
  const goods = goodsList.find(g => lower.includes(g)) || undefined;

  return { vehicleReg, shipmentId, weightTons, from, to, goods };
}

export async function nlpInterpret(text) {
  await warmup();
  const m = getManager();
  const result = await m.process('en', text);
  const intent = result.intent && result.score >= 0.6 ? result.intent : 'none';
  const entities = extractEntities(text);
  return { intent, entities, score: result.score };
}
